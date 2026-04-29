-- Split mailer metadata (default sender + tracking flags) out of
-- DesktopSmtpConfig into a dedicated DesktopMailerSettings table.
--
-- DesktopSmtpConfig is intentionally NOT dropped here — it stays in place
-- read-only for one release. A follow-up migration will drop it once we
-- confirm no code path reads from it anymore.

CREATE TABLE "DesktopMailerSettings" (
  "id"            TEXT NOT NULL,
  "desktopUserId" TEXT NOT NULL,
  "fromEmail"     TEXT,
  "fromName"      TEXT,
  "trackOpens"    BOOLEAN NOT NULL DEFAULT true,
  "trackClicks"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesktopMailerSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesktopMailerSettings_desktopUserId_key"
  ON "DesktopMailerSettings"("desktopUserId");

ALTER TABLE "DesktopMailerSettings"
  ADD CONSTRAINT "DesktopMailerSettings_desktopUserId_fkey"
  FOREIGN KEY ("desktopUserId") REFERENCES "DesktopUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy existing per-user metadata from DesktopSmtpConfig.
-- gen_random_uuid() is available via pgcrypto on managed Postgres; if not,
-- we fall back to md5 of the user id as the new pk source.
INSERT INTO "DesktopMailerSettings" (
  "id",
  "desktopUserId",
  "fromEmail",
  "fromName",
  "trackOpens",
  "trackClicks",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || c."desktopUserId"),
  c."desktopUserId",
  c."fromEmail",
  c."fromName",
  c."trackOpens",
  c."trackClicks",
  c."createdAt",
  c."updatedAt"
FROM "DesktopSmtpConfig" c
ON CONFLICT ("desktopUserId") DO NOTHING;
