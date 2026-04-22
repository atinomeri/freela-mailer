// NOTE: Intentionally does NOT use "server-only" — this module is imported
// by the standalone mailer-worker process to decrypt SMTP credentials.
// Pure Node crypto; client code must never import it.
//
// Crypto model (Week 1 of blocker remediation):
//
// - encryptSecretValue() ALWAYS uses the primary (write) secret.
// - decryptSecretValue() tries the primary first, then any read-only legacy
//   secrets listed in SMTP_CONFIG_SECRET_FALLBACK (comma-separated), then
//   (only if LEGACY_SMTP_CRYPTO_FALLBACK=true) the legacy fallback chain
//   INTERNAL_API_SECRET → DESKTOP_JWT_SECRET → NEXTAUTH_SECRET.
//
// Migration workflow:
//   1. Deploy this file + `scripts/rotate-smtp-crypto.mjs`.
//      Keep LEGACY_SMTP_CRYPTO_FALLBACK=true so existing ciphertexts remain
//      readable.
//   2. Set SMTP_CONFIG_SECRET to a dedicated, mailer-owned value.
//   3. Run `node --import tsx scripts/rotate-smtp-crypto.mjs` — every row is
//      decrypted under the legacy chain and re-encrypted under the primary.
//   4. Set LEGACY_SMTP_CRYPTO_FALLBACK=false and restart. From now on mailer
//      crypto depends only on SMTP_CONFIG_SECRET (+ optional explicit
//      SMTP_CONFIG_SECRET_FALLBACK for future rotations).
//
// Future rotations: push old SMTP_CONFIG_SECRET into SMTP_CONFIG_SECRET_FALLBACK,
// set a new SMTP_CONFIG_SECRET, run the rotate script, drop the fallback.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = "v1";

function parseSecretList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function legacyFallbackEnabled(): boolean {
  const raw = (process.env.LEGACY_SMTP_CRYPTO_FALLBACK ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * The single secret used for NEW ciphertexts. Required.
 * No cross-system fallback: mailer crypto must depend only on a mailer-owned secret.
 */
function getPrimarySecret(): string {
  const primary = process.env.SMTP_CONFIG_SECRET?.trim();
  if (primary) return primary;

  // During the Week-1 migration window (LEGACY_SMTP_CRYPTO_FALLBACK=true),
  // the primary can temporarily be read from the first legacy value so that
  // brand-new writes remain decryptable post-migration even if the operator
  // forgot to set SMTP_CONFIG_SECRET yet. After Week-1 step 2 this branch
  // should never trigger; the final step removes it.
  if (legacyFallbackEnabled()) {
    const legacy =
      process.env.INTERNAL_API_SECRET?.trim() ||
      process.env.DESKTOP_JWT_SECRET?.trim() ||
      process.env.NEXTAUTH_SECRET?.trim();
    if (legacy) return legacy;
  }

  throw new Error(
    "Missing SMTP_CONFIG_SECRET (mailer-scoped SMTP credential encryption key). " +
      "Set SMTP_CONFIG_SECRET to a dedicated random value. If migrating from legacy " +
      "crypto, also set LEGACY_SMTP_CRYPTO_FALLBACK=true temporarily and run " +
      "`npm run migrate:smtp-crypto` before removing the flag.",
  );
}

/**
 * Ordered list of secrets that decryption may try, primary first.
 * Used by decryptSecretValue() only. Never used for encryption.
 */
function getDecryptionSecrets(): string[] {
  const ordered: string[] = [];

  const primary = process.env.SMTP_CONFIG_SECRET?.trim();
  if (primary) ordered.push(primary);

  for (const extra of parseSecretList(process.env.SMTP_CONFIG_SECRET_FALLBACK)) {
    ordered.push(extra);
  }

  if (legacyFallbackEnabled()) {
    for (const envName of [
      "INTERNAL_API_SECRET",
      "DESKTOP_JWT_SECRET",
      "NEXTAUTH_SECRET",
    ]) {
      const v = process.env[envName]?.trim();
      if (v) ordered.push(v);
    }
  }

  // Dedupe while preserving order.
  const seen = new Set<string>();
  return ordered.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecretValue(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(getPrimarySecret());
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

function tryDecryptOnce(
  iv: Buffer,
  encrypted: Buffer,
  tag: Buffer,
  secret: string,
): string | null {
  try {
    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf-8",
    );
  } catch {
    return null;
  }
}

export function decryptSecretValue(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted secret format");
  }

  const [version, ivB64, dataB64, tagB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported encrypted secret version: ${version}`);
  }

  const iv = Buffer.from(ivB64, "base64url");
  const encrypted = Buffer.from(dataB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted secret payload");
  }

  const secrets = getDecryptionSecrets();
  if (secrets.length === 0) {
    throw new Error(
      "No decryption secret configured (set SMTP_CONFIG_SECRET).",
    );
  }

  for (const secret of secrets) {
    const result = tryDecryptOnce(iv, encrypted, tag, secret);
    if (result !== null) return result;
  }

  throw new Error(
    "SMTP credential decryption failed under all configured secrets. " +
      "If this happened after rotating SMTP_CONFIG_SECRET, add the previous value " +
      "to SMTP_CONFIG_SECRET_FALLBACK and re-run the migration.",
  );
}

/**
 * Re-encrypts a ciphertext under the current primary secret.
 * Used by the one-time migration script. Returns null if the input is
 * already re-encrypted (i.e. the primary already decrypts it cleanly and
 * no rewrite is required).
 */
export function reencryptUnderPrimary(
  payload: string,
): { ciphertext: string; rewritten: boolean } {
  const parts = payload.split(".");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted secret format");
  }
  const [version, ivB64, dataB64, tagB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported encrypted secret version: ${version}`);
  }

  const iv = Buffer.from(ivB64, "base64url");
  const encrypted = Buffer.from(dataB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");

  const primary = getPrimarySecret();
  const underPrimary = tryDecryptOnce(iv, encrypted, tag, primary);
  if (underPrimary !== null) {
    // Already encrypted under the current primary — no rewrite needed.
    return { ciphertext: payload, rewritten: false };
  }

  // Try remaining secrets (fallback + legacy if enabled), skipping primary.
  const secrets = getDecryptionSecrets().filter((s) => s !== primary);
  for (const secret of secrets) {
    const plaintext = tryDecryptOnce(iv, encrypted, tag, secret);
    if (plaintext !== null) {
      return { ciphertext: encryptSecretValue(plaintext), rewritten: true };
    }
  }

  throw new Error("Re-encryption failed: none of the configured secrets decrypted the payload.");
}
