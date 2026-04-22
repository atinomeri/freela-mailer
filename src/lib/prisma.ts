// NOTE: Intentionally does NOT use "server-only" — this module is imported
// from the standalone mailer-worker process (scripts/mailer-worker.mjs).
// Client code must never import this file; keep that contract by convention.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

type PrismaSingleton = {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const globalForPrisma = globalThis as unknown as PrismaSingleton;

// In dev, PrismaClient instances are cached on `globalThis` to avoid exhausting DB connections.
// If Prisma Client was regenerated with new mailer models, drop the cached instance.
if (process.env.NODE_ENV !== "production" && globalForPrisma.prisma) {
  const maybeClient = globalForPrisma.prisma as unknown as Record<string, unknown>;
  const requiredDelegates = ["desktopUser", "campaign", "contact", "emailTrackingEvent"];
  if (requiredDelegates.some((d) => !(d in maybeClient))) {
    globalForPrisma.prisma = undefined;
  }
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (url && url.trim().length > 0) return url;
  throw new Error(
    [
      "Missing DATABASE_URL.",
      'Add DATABASE_URL=postgresql://freela:freela_password@localhost:5432/freela?schema=public to .env.local.',
      "Then restart `npm run dev`."
    ].join(" ")
  );
}

// Prisma v7 requires a Driver Adapter (or Accelerate). For local Postgres we use the official pg adapter.
const connectionString = requireDatabaseUrl();

const pgPool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString
  });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pgPool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pgPool;
  globalForPrisma.prisma = prisma;
}
