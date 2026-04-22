-- ═══════════════════════════════════════════════════════════════════════════
--  Phase 4 blocker G.8 — EmailTrackingEvent plaintext IP scrub  (DECISION REQUIRED)
--
--  DESTRUCTIVE. Review audit output first. Wrapped in a transaction.
--
--  What it does:
--    Rewrites every EmailTrackingEvent.ipAddress that is not a 64-char hex
--    hash to its SHA-256 digest. Same hashing used by the write path today
--    (createHash('sha256').update(ip.trim()).digest('hex')).
--
--  Requires: the pgcrypto extension for digest().
--    CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
--  Usage:
--    psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
--         -f scripts/sql/phase4-tracking-ip-scrub.sql
--
--  To preview without committing, replace COMMIT with ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

\echo 'Rows to scrub (pre-check):'
SELECT COUNT(*) AS rows_to_scrub
FROM "EmailTrackingEvent"
WHERE "ipAddress" IS NOT NULL
  AND "ipAddress" !~ '^[a-f0-9]{64}$';

UPDATE "EmailTrackingEvent"
SET "ipAddress" = encode(digest(trim("ipAddress"), 'sha256'), 'hex')
WHERE "ipAddress" IS NOT NULL
  AND "ipAddress" !~ '^[a-f0-9]{64}$';

\echo 'Post-scrub plaintext residue (should be 0):'
SELECT COUNT(*) AS residue
FROM "EmailTrackingEvent"
WHERE "ipAddress" IS NOT NULL
  AND "ipAddress" !~ '^[a-f0-9]{64}$';

COMMIT;
