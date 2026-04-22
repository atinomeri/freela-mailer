#!/usr/bin/env node

/**
 * One-time SMTP credential re-encryption.
 *
 * Rewrites every `passwordEnc` / `proxyPasswordEnc` column on
 *   - DesktopSmtpConfig
 *   - DesktopSmtpPoolAccount  (passwordEnc, proxyPasswordEnc)
 *   - DesktopSendingAccount
 * under the current SMTP_CONFIG_SECRET.
 *
 * Run:
 *   node --import tsx scripts/rotate-smtp-crypto.mjs          # normal run
 *   node --import tsx scripts/rotate-smtp-crypto.mjs --dry    # report-only, no writes
 *
 * Required env:
 *   DATABASE_URL            — target database
 *   SMTP_CONFIG_SECRET      — the new mailer-owned primary secret
 *
 * Optional env (only during migration window):
 *   LEGACY_SMTP_CRYPTO_FALLBACK=true
 *   INTERNAL_API_SECRET / DESKTOP_JWT_SECRET / NEXTAUTH_SECRET
 *   SMTP_CONFIG_SECRET_FALLBACK=old1,old2
 *
 * Idempotent: rows already encrypted under the current primary are skipped.
 *
 * Exit codes:
 *   0 — success, including 0 rows or all-skipped
 *   1 — at least one row failed to decrypt under all known secrets
 *   2 — invalid env / startup failure
 */

import "dotenv/config";

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("[rotate-smtp-crypto] DATABASE_URL is required.");
  process.exit(2);
}
if (!process.env.SMTP_CONFIG_SECRET) {
  console.error(
    "[rotate-smtp-crypto] SMTP_CONFIG_SECRET is required. Set it to the new primary secret before running.",
  );
  process.exit(2);
}

// Dynamic import so tsx resolves TypeScript.
const { reencryptUnderPrimary } = await import("../src/lib/secret-crypto.ts");
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { Pool } = await import("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** @type {{ table: string, idField: string, columns: string[] }[]} */
const TARGETS = [
  { table: "desktopSmtpConfig", idField: "id", columns: ["passwordEnc"] },
  {
    table: "desktopSmtpPoolAccount",
    idField: "id",
    columns: ["passwordEnc", "proxyPasswordEnc"],
  },
  { table: "desktopSendingAccount", idField: "id", columns: ["passwordEnc"] },
];

const report = {
  scanned: 0,
  rewritten: 0,
  already: 0,
  skippedNull: 0,
  failed: 0,
};
const failures = [];

for (const target of TARGETS) {
  const select = { id: true };
  for (const col of target.columns) select[col] = true;

  const rows = await prisma[target.table].findMany({ select });
  console.log(
    `[rotate-smtp-crypto] ${target.table}: scanning ${rows.length} row(s)`,
  );

  for (const row of rows) {
    /** @type {Record<string, string>} */
    const writes = {};

    for (const col of target.columns) {
      const current = row[col];
      if (current === null || current === undefined || current === "") {
        report.skippedNull++;
        continue;
      }
      report.scanned++;

      try {
        const { ciphertext, rewritten } = reencryptUnderPrimary(current);
        if (rewritten) {
          writes[col] = ciphertext;
          report.rewritten++;
        } else {
          report.already++;
        }
      } catch (err) {
        report.failed++;
        failures.push({
          table: target.table,
          id: row[target.idField],
          column: col,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (Object.keys(writes).length > 0 && !DRY_RUN) {
      await prisma[target.table].update({
        where: { [target.idField]: row[target.idField] },
        data: writes,
      });
    }
  }
}

console.log("[rotate-smtp-crypto] Summary:");
console.log(`  scanned      : ${report.scanned}`);
console.log(`  rewritten    : ${report.rewritten}${DRY_RUN ? " (dry run — no writes)" : ""}`);
console.log(`  already-OK   : ${report.already}`);
console.log(`  skipped-null : ${report.skippedNull}`);
console.log(`  failed       : ${report.failed}`);

if (failures.length > 0) {
  console.error("[rotate-smtp-crypto] Failures:");
  for (const f of failures) {
    console.error(`  ${f.table}.${f.column} id=${f.id}: ${f.error}`);
  }
}

await prisma.$disconnect();
await pool.end();

process.exit(report.failed > 0 ? 1 : 0);
