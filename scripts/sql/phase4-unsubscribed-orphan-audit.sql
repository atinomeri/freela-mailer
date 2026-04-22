-- ═══════════════════════════════════════════════════════════════════════════
--  Phase 4 blocker G.7 — UnsubscribedEmail orphan audit
--
--  READ-ONLY. Run against production (or a recent replica) BEFORE DB split.
--  Outputs buckets that require an operator decision. No writes.
--
--  Usage:
--    psql "$DATABASE_URL" -f scripts/sql/phase4-unsubscribed-orphan-audit.sql \
--         | tee audit-unsubscribed-$(date +%F).txt
--
--  Expected output: 4 sections.
--    1) total + null-owner counts
--    2) orphans with a matching CampaignReport.desktopUserId (safe backfill)
--    3) orphans matching an existing DesktopUser email
--    4) fully-unattributed orphans (no backfill path)
--  See docs/phase4-blocker-runbook.md for the decision tree.
-- ═══════════════════════════════════════════════════════════════════════════

\echo '--- 1) Headline counts ---'
SELECT
  COUNT(*)                                 AS total_rows,
  COUNT(*) FILTER (WHERE "desktopUserId" IS NULL) AS null_owner_rows,
  COUNT(*) FILTER (WHERE "desktopUserId" IS NOT NULL) AS scoped_rows
FROM "UnsubscribedEmail";

\echo ''
\echo '--- 2) Backfillable via CampaignReport (email matched in EmailTrackingEvent) ---'
--  Rows where we can infer the sender from the campaign a recipient interacted with.
--  Requires EmailTrackingEvent.email (plaintext) — will be empty after the IP/email
--  scrub runs. Run this audit BEFORE the scrub.
WITH plaintext_events AS (
  SELECT DISTINCT "campaignId", "email"
  FROM "EmailTrackingEvent"
  WHERE "email" IS NOT NULL
    AND "campaignId" IS NOT NULL
),
inferable AS (
  SELECT
    u.id                     AS unsub_id,
    u.email                  AS unsub_email,
    cr."desktopUserId"       AS inferred_owner,
    cr."campaignId"          AS via_campaign
  FROM "UnsubscribedEmail" u
  JOIN plaintext_events e ON lower(e.email) = lower(u.email)
  JOIN "CampaignReport"  cr ON cr."campaignId" = e."campaignId"
  WHERE u."desktopUserId" IS NULL
    AND cr."desktopUserId" IS NOT NULL
)
SELECT
  COUNT(*)                                          AS backfillable_rows,
  COUNT(DISTINCT unsub_id)                          AS distinct_unsub_ids,
  COUNT(DISTINCT inferred_owner)                    AS distinct_owners_inferred
FROM inferable;

\echo ''
\echo '--- 3) Matchable by recipient-email = DesktopUser.email (weak heuristic) ---'
--  Only meaningful if the unsubscribed email *is* a mailer operator. Rare. Listed
--  for completeness; operators should rarely backfill from this.
SELECT COUNT(*) AS rows_matching_desktop_user_email
FROM "UnsubscribedEmail" u
JOIN "DesktopUser" d ON lower(d.email) = lower(u.email)
WHERE u."desktopUserId" IS NULL;

\echo ''
\echo '--- 4) Fully unattributed (no inference, no match) — must decide: keep vs delete ---'
WITH plaintext_events AS (
  SELECT DISTINCT "campaignId", lower("email") AS email_lc
  FROM "EmailTrackingEvent"
  WHERE "email" IS NOT NULL
    AND "campaignId" IS NOT NULL
),
inferable_ids AS (
  SELECT DISTINCT u.id
  FROM "UnsubscribedEmail" u
  JOIN plaintext_events e ON e.email_lc = lower(u.email)
  JOIN "CampaignReport"  cr ON cr."campaignId" = e."campaignId"
  WHERE u."desktopUserId" IS NULL
    AND cr."desktopUserId" IS NOT NULL
)
SELECT
  COUNT(*) AS fully_unattributed_rows,
  MIN(u."createdAt") AS oldest,
  MAX(u."createdAt") AS newest
FROM "UnsubscribedEmail" u
WHERE u."desktopUserId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM inferable_ids i WHERE i.id = u.id);

\echo ''
\echo '--- 5) Source distribution (helps operator judge retention) ---'
SELECT source, COUNT(*)
FROM "UnsubscribedEmail"
WHERE "desktopUserId" IS NULL
GROUP BY source
ORDER BY COUNT(*) DESC;
