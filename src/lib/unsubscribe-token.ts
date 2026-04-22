// NOTE: Intentionally does NOT use "server-only" — this module is imported
// by the standalone mailer-worker process at send time. It is a pure
// server-side utility (Node crypto); client code must not import it.

import { createHmac, timingSafeEqual } from "crypto";

const EMAIL_RE =
  /^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export interface UnsubscribeTokenPayload {
  email: string;
  desktopUserId?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parsePayload(value: string): UnsubscribeTokenPayload | null {
  const decoded = value.trim();
  if (!decoded) return null;

  if (decoded.includes("|")) {
    const [emailRaw, desktopUserIdRaw] = decoded.split("|", 2);
    const email = normalizeEmail(emailRaw ?? "");
    const desktopUserId = (desktopUserIdRaw ?? "").trim();
    if (!EMAIL_RE.test(email) || !desktopUserId) return null;
    return { email, desktopUserId };
  }

  const email = normalizeEmail(decoded);
  if (!EMAIL_RE.test(email)) return null;
  return { email };
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(padded, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

function isHex(value: string): boolean {
  return /^[a-fA-F0-9]+$/.test(value);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || !isHex(a) || !isHex(b)) return false;
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function signingSecrets(): string[] {
  const raw = [
    process.env.UNSUBSCRIBE_TOKEN_SECRET?.trim(),
    process.env.INTERNAL_API_SECRET?.trim(),
  ].filter((v): v is string => Boolean(v));

  return [...new Set(raw)];
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("hex");
}

export function createUnsubscribeToken(
  email: string,
  desktopUserId?: string,
): string {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new Error("Invalid email for unsubscribe token");
  }

  const payload = desktopUserId
    ? `${normalizedEmail}|${desktopUserId.trim()}`
    : normalizedEmail;
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");

  const secret = signingSecrets()[0];
  if (!secret) {
    throw new Error(
      "Missing unsubscribe signing secret (set UNSUBSCRIBE_TOKEN_SECRET or INTERNAL_API_SECRET)",
    );
  }

  return `${payloadB64}.${signPayload(payloadB64, secret)}`;
}

export function verifyUnsubscribeToken(
  rawToken: string,
  options?: { allowLegacy?: boolean },
): UnsubscribeTokenPayload | null {
  const raw = (rawToken ?? "").trim();
  if (!raw) return null;

  const allowLegacy =
    options?.allowLegacy ??
    process.env.UNSUBSCRIBE_ALLOW_LEGACY === "true";

  if (raw.includes(".")) {
    const parts = raw.split(".");
    const signature = parts.pop() ?? "";
    const payloadB64 = parts.join(".");
    if (!payloadB64 || !signature) return null;

    const secrets = signingSecrets();
    if (secrets.length === 0) return null;

    let signatureOk = false;
    for (const secret of secrets) {
      const expected = signPayload(payloadB64, secret);
      if (safeEqualHex(signature, expected)) {
        signatureOk = true;
        break;
      }
      // Backwards compatibility with truncated legacy signatures (32 hex chars)
      if (
        signature.length === 32 &&
        safeEqualHex(signature, expected.slice(0, 32))
      ) {
        signatureOk = true;
        break;
      }
    }
    if (!signatureOk) return null;

    const decoded = decodeBase64Url(payloadB64);
    if (!decoded) return null;
    return parsePayload(decoded);
  }

  if (!allowLegacy) return null;

  if (raw.includes("@")) {
    return parsePayload(raw);
  }

  const decoded = decodeBase64Url(raw);
  if (!decoded) return null;
  return parsePayload(decoded);
}

