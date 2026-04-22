-- ═══════════════════════════════════════════════════════════════════════════
--  Phase 4 blocker G.7 — UnsubscribedEmail orphan backfill  (DECISION REQUIRED)
--
--  DESTRUCTIVE. Do NOT run without operator review of the audit output.
--  Wrapped in a transaction so a single bad run rolls back.
--
--  What it does (bucket 2 of the audit):
--    For every orphan UnsubscribedEmail row whose email matches an
--    EmailTrackingEvent row whose campaign has a known owner, sets
--    desktopUserId to that owner. Skips rows that match multiple owners
--    (ambiguous).
--
--  Usage:
--    psql "$DATABASE_URL" \
--      --set=ON_ERROR_STOP=1 \
--      -f scripts/sql/phase4-unsubscribed-orphan-backfill.sql
--
--  To preview without committing, replace COMMIT with ROLLBACK at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Temp table: one row per unsub_id that maps to exactly one owner.
CREATE TEMP TABLE orphan_backfill ON COMMIT DROP AS
WITH plaintext_events AS (
  SELECT DISTINCT "campaignId", lower("email") AS email_lc
  FROM "EmailTrackingEvent"
  WHERE "email" IS NOT NULL
    AND "campaignId" IS NOT NULL
),
candidates AS (
  SELECT
    u.id                AS unsub_id,
    cr."desktopUserId"  AS inferred_owner
  FROM "UnsubscribedEmail" u
  JOIN plaintext_events e ON e.email_lc = lower(u.email)
  JOIN "CampaignReport"  cr ON cr."campaignId" = e."campaignId"
  WHERE u."desktopUserId" IS NULL
    AND cr."desktopUserId" IS NOT NULL
),
unambiguous AS (
  SELECT unsub_id, MIN(inferred_owner) AS inferred_owner
  FROM candidates
  GROUP BY unsub_id
  HAVING COUNT(DISTINCT inferred_owner) = 1
)
SELECT * FROM unambiguous;

\echo 'Rows to update:'
SELECT COUNT(*) FROM orphan_backfill;

UPDATE "UnsubscribedEmail" u
SET "desktopUserId" = b.inferred_owner
FROM orphan_backfill b
WHERE u.id = b.unsub_id
  AND u."desktopUserId" IS NULL;

\echo 'Post-update null-owner count (remaining orphans):'
SELECT COUNT(*) FROM "UnsubscribedEmail" WHERE "desktopUserId" IS NULL;

COMMIT;
