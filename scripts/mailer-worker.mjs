#!/usr/bin/env node

/**
 * Standalone Mailer Worker Process
 *
 * Runs both the BullMQ campaign worker AND the campaign scheduler poll loop
 * in a dedicated Node process (no Next.js runtime). Intended to be deployed
 * as a separate container so the web app can set
 * ENABLE_IN_PROCESS_CAMPAIGN_WORKER=false and not consume jobs.
 *
 * Run:
 *   npx tsx scripts/mailer-worker.mjs
 *
 * Required env:
 *   DATABASE_URL, REDIS_URL, UNSUBSCRIBE_TOKEN_SECRET (or INTERNAL_API_SECRET)
 *   MAILER_PUBLIC_URL (preferred) or NEXT_PUBLIC_APP_URL / NEXTAUTH_URL
 *
 * Optional env:
 *   WORKER_HEALTH_PORT (default 3001)
 *   CAMPAIGN_BATCH_SIZE, CAMPAIGN_DELAY_MIN_MS, CAMPAIGN_DELAY_MAX_MS,
 *   CAMPAIGN_BATCH_PAUSE_MS, CAMPAIGN_SCHEDULER_POLL_MS, CAMPAIGN_WARMUP_*,
 *   TRACK_OPENS, TRACK_CLICKS, TRACKING_PIXEL_URL, CLICK_TRACKING_URL,
 *   UNSUBSCRIBE_PAGE_URL, SMTP_*
 */

import "dotenv/config";
import http from "node:http";

const REQUIRED_ENV = ["DATABASE_URL", "REDIS_URL"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[mailer-worker] Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

// MAILER_PUBLIC_URL is the forever-host baked into outgoing emails. In prod
// it is the ONLY acceptable source. Falling back to NEXT_PUBLIC_APP_URL /
// NEXTAUTH_URL is permitted in dev/test only so local setups with a single
// URL env continue to work.
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  if (!process.env.MAILER_PUBLIC_URL) {
    console.error(
      "[mailer-worker] MAILER_PUBLIC_URL is required in production. It is the " +
        "forever-host baked into every outgoing tracking pixel and unsubscribe link. " +
        "Set it explicitly (e.g. https://freela.ge) — falling back to " +
        "NEXT_PUBLIC_APP_URL or NEXTAUTH_URL is not allowed in prod.",
    );
    process.exit(1);
  }
} else {
  const hasPublicBase =
    Boolean(process.env.MAILER_PUBLIC_URL) ||
    Boolean(process.env.NEXT_PUBLIC_APP_URL) ||
    Boolean(process.env.NEXTAUTH_URL);
  if (!hasPublicBase) {
    console.error(
      "[mailer-worker] Must set one of MAILER_PUBLIC_URL / NEXT_PUBLIC_APP_URL / NEXTAUTH_URL " +
        "so tracking & unsubscribe links resolve to an absolute URL.",
    );
    process.exit(1);
  }
}

if (!process.env.UNSUBSCRIBE_TOKEN_SECRET && !process.env.INTERNAL_API_SECRET) {
  console.error(
    "[mailer-worker] UNSUBSCRIBE_TOKEN_SECRET (or INTERNAL_API_SECRET) is required to sign " +
      "unsubscribe tokens identically to the web app.",
  );
  process.exit(1);
}

// Non-fatal warning: Phase 4 expects RATE_LIMIT_KEY_PREFIX="mailer:" on this
// container. Missing prefix means the worker shares rate-limit keys with the
// freela app — visible but not broken.
if (isProd) {
  const prefix = (process.env.RATE_LIMIT_KEY_PREFIX ?? "").trim();
  if (!prefix) {
    console.warn(
      "[mailer-worker] RATE_LIMIT_KEY_PREFIX is unset in production. " +
        "Phase 4 requires 'mailer:' on this container so rate-limit keys " +
        "do not collide with the freela app.",
    );
  } else if (prefix !== "mailer:") {
    console.warn(
      `[mailer-worker] RATE_LIMIT_KEY_PREFIX="${prefix}" is not the expected "mailer:" value.`,
    );
  }
}

// Dynamically load TS modules via tsx loader invocation.
const { startCampaignWorker, stopCampaignWorker } = await import(
  "../src/lib/campaign-worker.ts"
);
const { ensureCampaignSchedulerStarted } = await import(
  "../src/lib/campaign-scheduler.ts"
);

console.log("─────────────────────────────────────");
console.log("  Mailer Worker Process (worker + scheduler)");
console.log("─────────────────────────────────────");
console.log(`  REDIS_URL:         ${process.env.REDIS_URL ? "✓ set" : "(not set)"}`);
console.log(`  DATABASE_URL:      ${process.env.DATABASE_URL ? "✓ set" : "(not set)"}`);
console.log(`  MAILER_PUBLIC_URL: ${process.env.MAILER_PUBLIC_URL || "(fallback to NEXTAUTH_URL)"}`);
console.log(`  BATCH_SIZE:        ${process.env.CAMPAIGN_BATCH_SIZE || "50 (default)"}`);
console.log(`  SCHEDULER_POLL_MS: ${process.env.CAMPAIGN_SCHEDULER_POLL_MS || "30000 (default)"}`);
console.log("─────────────────────────────────────");

const worker = startCampaignWorker();
if (!worker) {
  console.error("[mailer-worker] Failed to start BullMQ worker (check REDIS_URL).");
  process.exit(1);
}

const schedulerStarted = ensureCampaignSchedulerStarted();
if (!schedulerStarted) {
  console.warn("[mailer-worker] Scheduler did not start (duplicate init?)");
}

// ── Health HTTP server ───────────────────────────────────────────
const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "3001", 10);
const startedAt = Date.now();
let shuttingDown = false;

const healthServer = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1");

  if (url.pathname === "/healthz") {
    const ok = !shuttingDown && worker.isRunning();
    res.statusCode = ok ? 200 : 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok,
        workerRunning: worker.isRunning(),
        schedulerStarted,
        shuttingDown,
        uptimeMs: Date.now() - startedAt,
      }),
    );
    return;
  }

  if (url.pathname === "/ready") {
    const ok = !shuttingDown && worker.isRunning();
    res.statusCode = ok ? 200 : 503;
    res.end(ok ? "ready" : "not-ready");
    return;
  }

  res.statusCode = 404;
  res.end();
});

healthServer.listen(healthPort, "0.0.0.0", () => {
  console.log(`[mailer-worker] Health server listening on :${healthPort} (/healthz, /ready)`);
});

// ── Graceful shutdown ────────────────────────────────────────────
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[mailer-worker] Received ${signal}, shutting down...`);

  healthServer.close();

  try {
    await stopCampaignWorker();
  } catch (err) {
    console.error("[mailer-worker] Error stopping worker:", err);
  }

  // Scheduler timer is unref'd, so process will exit when no handles remain.
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[mailer-worker] uncaughtException:", err);
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (err) => {
  console.error("[mailer-worker] unhandledRejection:", err);
});
