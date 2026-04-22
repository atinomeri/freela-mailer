/**
 * Mailer runtime env assertions shared by the Next.js app and the standalone
 * worker. Used to fail fast when Phase 4–required envs are missing, rather
 * than silently emitting broken tracking/unsubscribe links.
 *
 * These checks run at runtime (not build time) so dev/test environments
 * without the envs still compile. Production callers wrap them in try/catch
 * only if they want a user-visible 500 instead of process death.
 */

/**
 * Asserts that MAILER_PUBLIC_URL is set in production. No cross-product
 * fallback — the check exists precisely because falling back to
 * NEXTAUTH_URL couples mailer to freela auth env.
 *
 * Returns the trimmed URL on success.
 */
export function requireMailerPublicUrl(): string {
  const raw = process.env.MAILER_PUBLIC_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MAILER_PUBLIC_URL is required in production. It is the forever-host " +
        "baked into every outgoing tracking pixel and unsubscribe link. " +
        "Set it explicitly on both the app and worker containers.",
    );
  }

  // dev/test fallback (kept narrow — single env, no cross-product).
  const fallback = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).trim();
  return fallback.replace(/\/+$/, "");
}

/**
 * Asserts that a per-product RATE_LIMIT_KEY_PREFIX is configured in
 * production. The two valid values today are `freela:` and `mailer:`.
 * Missing prefix in prod means freela and mailer share one keyspace
 * (G.6 in the pre-Phase-4 audit).
 */
export function assertRateLimitKeyPrefixOrWarn(): void {
  if (process.env.NODE_ENV !== "production") return;
  const prefix = (process.env.RATE_LIMIT_KEY_PREFIX ?? "").trim();
  if (prefix && prefix.endsWith(":")) return;

  // Deliberately a warn, not a throw — legacy deployments predating Phase 4
  // are allowed to run with an empty prefix. The Phase-4 cutover checklist
  // escalates this to a deploy-time test.
  // eslint-disable-next-line no-console
  console.warn(
    "[mailer-env] RATE_LIMIT_KEY_PREFIX is not set (or missing trailing ':'). " +
      "Phase 4 requires 'freela:' on the freela container and 'mailer:' on " +
      "the mailer container.",
  );
}
