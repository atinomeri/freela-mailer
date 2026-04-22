import "server-only";
import { logError } from "./logger";

export interface RateLimitBreachAlert {
  timestamp: Date;
  scope: string;
  key: string;
  ip?: string;
  userId?: string;
  limit: number;
  windowSeconds: number;
  attemptCount: number;
  severity: "low" | "medium" | "high" | "critical";
}

// in-memory storage for breach tracking (reset on restart)
const breaches = new Map<string, { count: number; firstAt: Date; lastAt: Date }>();

/**
 * Track and alert on rate limit breaches
 * Call this when checkRateLimit returns allowed: false
 */
export function trackRateLimitBreach(alert: RateLimitBreachAlert): void {
  const key = `${alert.scope}:${alert.key}`;
  const existing = breaches.get(key);

  if (existing) {
    existing.count += 1;
    existing.lastAt = alert.timestamp;
  } else {
    breaches.set(key, {
      count: 1,
      firstAt: alert.timestamp,
      lastAt: alert.timestamp,
    });
  }

  const count = breaches.get(key)?.count ?? 0;
  const isSuspicious = count >= 10; // 10+ breaches = suspicious activity

  // Log the breach
  logError("Rate limit breach detected", {
    scope: alert.scope,
    key: alert.key,
    ip: alert.ip,
    userId: alert.userId,
    limit: alert.limit,
    windowSeconds: alert.windowSeconds,
    attemptCount: alert.attemptCount,
    severity: alert.severity,
    breachCount: count,
    isSuspicious,
  });

  // Send alert for high severity breaches
  if (alert.severity === "high" || alert.severity === "critical") {
    sendBreachAlert(alert, count);
  }

  // Auto-block after multiple breaches (optional)
  if (isSuspicious && alert.severity === "critical") {
    // Could integrate with your admin notification system
    logError(`[SECURITY] Potential attack detected from ${alert.key}: ${count} breaches`);
  }
}

/**
 * Send alert via email/Slack (placeholder for integration)
 */
function sendBreachAlert(alert: RateLimitBreachAlert, totalBreaches: number): void {
  // Integration point: Send to Sentry, Slack, or email
  const message = `
🚨 Rate Limit Breach Alert
Scope: ${alert.scope}
Key: ${alert.key}
Severity: ${alert.severity}
Total Breaches: ${totalBreaches}
IP: ${alert.ip || "unknown"}
User: ${alert.userId || "anonymous"}
Time: ${alert.timestamp.toISOString()}
  `.trim();

  // If Sentry is configured, send exception
  if (typeof process !== "undefined" && process.env.SENTRY_DSN) {
    try {
      // Placeholder for Sentry integration
      logError(`[ALERT] Rate limit breach: ${message}`);
    } catch {
      // Ignore Sentry errors
    }
  }
}

/**
 * Get current breach statistics (admin dashboard)
 */
export function getBreachStats(): {
  totalScopes: number;
  activeBreach: RateLimitBreachAlert | null;
  topOffenders: Array<{ key: string; count: number }>;
} {
  const topOffenders = Array.from(breaches.entries())
    .map(([key, data]) => ({ key, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalScopes: breaches.size,
    activeBreach: null, // Would require storing last breach
    topOffenders,
  };
}

/**
 * Clear old breach records (call periodically)
 */
export function clearOldBreaches(olderThanMinutes: number = 60): number {
  const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
  let cleared = 0;

  for (const [key, data] of breaches.entries()) {
    if (data.lastAt.getTime() < cutoff) {
      breaches.delete(key);
      cleared += 1;
    }
  }

  return cleared;
}
