import "server-only";
import { createClient } from "redis";
import { trackRateLimitBreach } from "./rate-limit-alerts";
import { logWarn } from "./logger";

type HeadersLike = Headers | Record<string, string | string[] | undefined> | undefined | null;

function trustProxyHeaders(): boolean {
  return String(process.env.TRUST_PROXY_HEADERS ?? "").trim().toLowerCase() === "true";
}

/**
 * Per-product Redis key prefix. Set to "freela:" in the freela container and
 * "mailer:" in the mailer container so login / rate-limit counters never
 * collide across products (G.6 in the pre-Phase-4 audit).
 *
 * Default is "" to preserve read/write compatibility with existing in-flight
 * buckets the day the flag is introduced — counters expire within 30 minutes
 * so the prefix converges without a data migration.
 */
function keyPrefix(): string {
  return (process.env.RATE_LIMIT_KEY_PREFIX ?? "").trim();
}

/**
 * Prefixes a Redis key. Used for every `rl:*` bucket — and the parallel
 * in-memory fallback keys — so both backends stay in sync.
 */
function pk(key: string): string {
  const prefix = keyPrefix();
  return prefix ? `${prefix}${key}` : key;
}

export function getClientIpFromHeaders(headers: HeadersLike): string {
  if (!headers) return "unknown";

  const get = (name: string) => {
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
    const v = (headers as Record<string, string | string[] | undefined>)[name];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const trusted = trustProxyHeaders();

  const xRealIp = get("x-real-ip");
  if (trusted && xRealIp) return String(xRealIp).trim() || "unknown";

  const xff = get("x-forwarded-for");
  if (trusted && xff) return String(xff).split(",")[0]!.trim() || "unknown";

  return "unknown";
}

export function getClientIp(req: Request): string {
  return getClientIpFromHeaders(req.headers);
}

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RedisClient = ReturnType<typeof createClient>;

let redis: RedisClient | null = null;
let redisInit: Promise<RedisClient> | null = null;
let warnedNoRedis = false;

async function getRedisClient(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    if (!warnedNoRedis && process.env.NODE_ENV !== "production") {
      warnedNoRedis = true;
      logWarn("[rate-limit] REDIS_URL not set; using in-memory limiter (dev only).");
    }
    return null;
  }

  if (redis) return redis;
  if (redisInit) return redisInit;

  redisInit = (async () => {
    const client = createClient({ url });
    client.on("error", () => {
      // ignore; caller will fall back to in-memory if needed
    });
    await client.connect();
    redis = client;
    return client;
  })();

  return redisInit;
}

type MemoryBucket = { count: number; expiresAt: number };
const memory = new Map<string, MemoryBucket>();

function checkMemory(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= now) {
    const expiresAt = now + windowSeconds * 1000;
    memory.set(key, { count: 1, expiresAt });
    return { allowed: true, limit, remaining: limit - 1, retryAfterSeconds: windowSeconds };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const retryAfterSeconds = Math.max(0, Math.ceil((existing.expiresAt - now) / 1000));
  return { allowed: existing.count <= limit, limit, remaining, retryAfterSeconds };
}

// ── Login rate limiting with exponential backoff + lockout ──

type LoginRateLimitResult = RateLimitResult & {
  lockedOut: boolean;
  lockoutRemainingSeconds: number;
};

const LOGIN_BACKOFF_THRESHOLD = 5; // Start exponential backoff after 5 failures
const LOGIN_LOCKOUT_THRESHOLD = 15; // Lock account after 15 failures
const LOGIN_LOCKOUT_DURATION = 30 * 60; // 30 minutes lockout
const LOGIN_BASE_WINDOW = 60; // Base window 1 minute

export async function checkLoginRateLimit(params: {
  key: string; // email or IP
  scope: "email" | "ip";
}): Promise<LoginRateLimitResult> {
  if (process.env.NODE_ENV === "test" || process.env.E2E === "true") {
    return { allowed: true, limit: 100, remaining: 100, retryAfterSeconds: 0, lockedOut: false, lockoutRemainingSeconds: 0 };
  }

  const keySafe = (params.key || "unknown").slice(0, 200);
  const failKey = pk(`rl:login:fail:${params.scope}:${keySafe}`);
  const lockKey = pk(`rl:login:lock:${params.scope}:${keySafe}`);

  const client = await getRedisClient().catch(() => null);

  // In-memory fallback for development
  if (!client) {
    const memFailKey = pk(`login:fail:${params.scope}:${keySafe}`);
    const memLockKey = pk(`login:lock:${params.scope}:${keySafe}`);

    const now = Date.now();
    const lockBucket = memory.get(memLockKey);
    if (lockBucket && lockBucket.expiresAt > now) {
      const lockoutRemaining = Math.ceil((lockBucket.expiresAt - now) / 1000);
      return {
        allowed: false,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        remaining: 0,
        retryAfterSeconds: lockoutRemaining,
        lockedOut: true,
        lockoutRemainingSeconds: lockoutRemaining,
      };
    }

    const failBucket = memory.get(memFailKey);
    const failCount = failBucket && failBucket.expiresAt > now ? failBucket.count : 0;

    if (failCount >= LOGIN_LOCKOUT_THRESHOLD) {
      memory.set(memLockKey, { count: 1, expiresAt: now + LOGIN_LOCKOUT_DURATION * 1000 });
      return {
        allowed: false,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        remaining: 0,
        retryAfterSeconds: LOGIN_LOCKOUT_DURATION,
        lockedOut: true,
        lockoutRemainingSeconds: LOGIN_LOCKOUT_DURATION,
      };
    }

    // Calculate exponential backoff window
    let windowSeconds = LOGIN_BASE_WINDOW;
    if (failCount >= LOGIN_BACKOFF_THRESHOLD) {
      const backoffMultiplier = Math.pow(2, failCount - LOGIN_BACKOFF_THRESHOLD);
      windowSeconds = Math.min(LOGIN_BASE_WINDOW * backoffMultiplier, LOGIN_LOCKOUT_DURATION);
    }

    const limit = params.scope === "ip" ? 30 : 10;
    const result = checkMemory(memFailKey, limit, windowSeconds);
    return { ...result, lockedOut: false, lockoutRemainingSeconds: 0 };
  }

  try {
    // Check lockout first
    const lockTtl = await client.ttl(lockKey);
    if (lockTtl > 0) {
      return {
        allowed: false,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        remaining: 0,
        retryAfterSeconds: lockTtl,
        lockedOut: true,
        lockoutRemainingSeconds: lockTtl,
      };
    }

    // Get current failure count
    const failCountStr = await client.get(failKey);
    const failCount = failCountStr ? parseInt(failCountStr, 10) : 0;

    // Check if should be locked out
    if (failCount >= LOGIN_LOCKOUT_THRESHOLD) {
      await client.setEx(lockKey, LOGIN_LOCKOUT_DURATION, "1");
      trackRateLimitBreach({
        timestamp: new Date(),
        scope: `login:lockout:${params.scope}`,
        key: keySafe,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        windowSeconds: LOGIN_LOCKOUT_DURATION,
        attemptCount: failCount,
        severity: "critical",
      });
      return {
        allowed: false,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        remaining: 0,
        retryAfterSeconds: LOGIN_LOCKOUT_DURATION,
        lockedOut: true,
        lockoutRemainingSeconds: LOGIN_LOCKOUT_DURATION,
      };
    }

    // Calculate exponential backoff window
    let windowSeconds = LOGIN_BASE_WINDOW;
    if (failCount >= LOGIN_BACKOFF_THRESHOLD) {
      const backoffMultiplier = Math.pow(2, failCount - LOGIN_BACKOFF_THRESHOLD);
      windowSeconds = Math.min(LOGIN_BASE_WINDOW * backoffMultiplier, LOGIN_LOCKOUT_DURATION);
    }

    const limit = params.scope === "ip" ? 30 : 10;
    const remaining = Math.max(0, limit - failCount);
    const ttl = await client.ttl(failKey);

    return {
      allowed: failCount < limit,
      limit,
      remaining,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      lockedOut: false,
      lockoutRemainingSeconds: 0,
    };
  } catch {
    // Fail open in case of Redis errors (but log it)
    logWarn("[rate-limit] Redis error in checkLoginRateLimit; allowing request");
    return { allowed: true, limit: 100, remaining: 100, retryAfterSeconds: 0, lockedOut: false, lockoutRemainingSeconds: 0 };
  }
}

export async function recordLoginFailure(params: { key: string; scope: "email" | "ip" }): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.E2E === "true") return;

  const keySafe = (params.key || "unknown").slice(0, 200);
  const failKey = pk(`rl:login:fail:${params.scope}:${keySafe}`);

  const client = await getRedisClient().catch(() => null);

  if (!client) {
    // In-memory fallback
    const memFailKey = pk(`login:fail:${params.scope}:${keySafe}`);
    const now = Date.now();
    const existing = memory.get(memFailKey);
    if (existing && existing.expiresAt > now) {
      existing.count += 1;
    } else {
      memory.set(memFailKey, { count: 1, expiresAt: now + LOGIN_BASE_WINDOW * 1000 });
    }
    return;
  }

  try {
    const count = await client.incr(failKey);
    if (count === 1) {
      await client.expire(failKey, LOGIN_BASE_WINDOW);
    } else {
      // Extend window with exponential backoff
      if (count >= LOGIN_BACKOFF_THRESHOLD) {
        const backoffMultiplier = Math.pow(2, count - LOGIN_BACKOFF_THRESHOLD);
        const newWindow = Math.min(LOGIN_BASE_WINDOW * backoffMultiplier, LOGIN_LOCKOUT_DURATION);
        await client.expire(failKey, newWindow);
      }
    }

    // Track repeated failures
    if (count >= LOGIN_BACKOFF_THRESHOLD) {
      trackRateLimitBreach({
        timestamp: new Date(),
        scope: `login:backoff:${params.scope}`,
        key: keySafe,
        limit: LOGIN_LOCKOUT_THRESHOLD,
        windowSeconds: LOGIN_BASE_WINDOW,
        attemptCount: count,
        severity: count >= LOGIN_LOCKOUT_THRESHOLD - 3 ? "high" : "medium",
      });
    }
  } catch {
    logWarn("[rate-limit] Redis error in recordLoginFailure");
  }
}

export async function clearLoginFailures(params: { key: string; scope: "email" | "ip" }): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.E2E === "true") return;

  const keySafe = (params.key || "unknown").slice(0, 200);
  const failKey = pk(`rl:login:fail:${params.scope}:${keySafe}`);

  const client = await getRedisClient().catch(() => null);

  if (!client) {
    const memFailKey = pk(`login:fail:${params.scope}:${keySafe}`);
    memory.delete(memFailKey);
    return;
  }

  try {
    await client.del(failKey);
  } catch {
    logWarn("[rate-limit] Redis error in clearLoginFailures");
  }
}

// ── Standard rate limiting ──

export async function checkRateLimit(params: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  // Avoid flakiness in automated tests that may reuse the same IP bucket ("unknown") across runs.
  if (process.env.NODE_ENV === "test" || process.env.E2E === "true") {
    return { allowed: true, limit: params.limit, remaining: params.limit, retryAfterSeconds: 0 };
  }

  const keySafe = (params.key || "unknown").slice(0, 200);
  const redisKey = pk(`rl:${params.scope}:${keySafe}`);
  const strictInProd =
    process.env.NODE_ENV === "production" && String(process.env.RATE_LIMIT_STRICT ?? "true").toLowerCase() !== "false";

  const client = await getRedisClient().catch(() => null);
  if (!client) {
    if (strictInProd) {
      trackRateLimitBreach({
        timestamp: new Date(),
        scope: params.scope,
        key: keySafe,
        limit: params.limit,
        windowSeconds: params.windowSeconds,
        attemptCount: 1,
        severity: "high"
      });
      return {
        allowed: false,
        limit: params.limit,
        remaining: 0,
        retryAfterSeconds: params.windowSeconds
      };
    }
    if (process.env.NODE_ENV === "production") {
      logWarn("[rate-limit] Redis unavailable in production; using in-memory fallback (set RATE_LIMIT_STRICT=true to fail-closed).");
    }
    return checkMemory(redisKey, params.limit, params.windowSeconds);
  }

  try {
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, params.windowSeconds);
    }

    let ttl = await client.ttl(redisKey);
    if (ttl < 0) {
      await client.expire(redisKey, params.windowSeconds);
      ttl = params.windowSeconds;
    }

    const remaining = Math.max(0, params.limit - count);
    const allowed = count <= params.limit;
    
    // Track breach for monitoring
    if (!allowed) {
      trackRateLimitBreach({
        timestamp: new Date(),
        scope: params.scope,
        key: keySafe,
        limit: params.limit,
        windowSeconds: params.windowSeconds,
        attemptCount: count,
        severity: count > params.limit * 2 ? "critical" : count > params.limit ? "medium" : "low"
      });
    }
    
    return {
      allowed,
      limit: params.limit,
      remaining,
      retryAfterSeconds: Math.max(0, ttl)
    };
  } catch {
    if (strictInProd) {
      return {
        allowed: false,
        limit: params.limit,
        remaining: 0,
        retryAfterSeconds: params.windowSeconds
      };
    }
    if (process.env.NODE_ENV === "production") {
      logWarn("[rate-limit] Redis operation failed in production; using in-memory fallback (set RATE_LIMIT_STRICT=true to fail-closed).");
    }
    // If Redis is down, fall back to in-memory buckets in non-production environments.
    return checkMemory(redisKey, params.limit, params.windowSeconds);
  }
}
