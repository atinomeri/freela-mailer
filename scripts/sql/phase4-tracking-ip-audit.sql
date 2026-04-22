-- ═══════════════════════════════════════════════════════════════════════════
--  Phase 4 blocker G.8 — EmailTrackingEvent plaintext IP audit
--
--  READ-ONLY. Run BEFORE the scrub DML.
--
--  Current write path (src/app/api/tracking/pixel/route.ts and click/route.ts)
--  always stores a SHA-256 hex hash (64 chars) for EmailTrackingEvent.ipAddress.
--  Historical rows written by older code may contain plaintext IPs (IPv4 or
--  IPv6). This audit counts them by pattern so an operator can decide whether
--  to scrub or delete.
--
--  Usage:
--    psql "$DATABASE_URL" -f scripts/sql/phase4-tracking-ip-audit.sql \
--         | tee audit-tracking-ip-$(date +%F).txt
-- ═══════════════════════════════════════════════════════════════════════════

\echo '--- 1) Total + non-null IP rows ---'
SELECT
  COUNT(*)                                         AS total_rows,
  COUNT(*) FILTER (WHERE "ipAddress" IS NOT NULL)  AS rows_with_ip
FROM "EmailTrackingEvent";

\echo ''
\echo '--- 2) Pattern breakdown ---'
SELECT
  CASE
    WHEN "ipAddress" IS NULL THEN 'null'
    WHEN "ipAddress" ~ '^[a-f0-9]{64}$' THEN 'sha256 (ok)'
    WHEN "ipAddress" ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN 'plaintext_ipv4'
    WHEN "ipAddress" ~ ':' THEN 'plaintext_ipv6'
    ELSE 'other'
  END AS ip_class,
  COUNT(*) AS rows
FROM "EmailTrackingEvent"
GROUP BY 1
ORDER BY rows DESC;

\echo ''
\echo '--- 3) Date span of plaintext rows ---'
SELECT
  MIN("createdAt") AS oldest_plaintext,
  MAX("createdAt") AS newest_plaintext,
  COUNT(*)         AS plaintext_rows
FROM "EmailTrackingEvent"
WHERE "ipAddress" IS NOT NULL
  AND "ipAddress" !~ '^[a-f0-9]{64}$';

\echo ''
\echo '--- 4) Deprecated EmailTrackingEvent.email plaintext count (separate PII decision) ---'
SELECT
  COUNT(*)                                  AS total_rows,
  COUNT(*) FILTER (WHERE "email" IS NOT NULL) AS plaintext_email_rows
FROM "EmailTrackingEvent";
