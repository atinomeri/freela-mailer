-- Baseline migration for the freela-mailer extraction.
--
-- This is a generated DDL mirror of prisma/schema.prisma at extraction time.
-- Regenerate from scratch with:
--   rm -rf prisma/migrations && npx prisma migrate dev --name init
-- against an empty mailer database if anything goes stale during development.
--
-- In production (Phase 4) this file is applied to an empty mailer_db via
--   npx prisma migrate deploy
-- See docs/phase4-cutover-runbook.md Step 3.2.

-- ── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "DesktopUserType"                 AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "DesktopLedgerEntryType"          AS ENUM ('TOPUP','QUOTA_RESERVE','QUOTA_REFUND','ADJUSTMENT','PAYMENT_CAPTURE','PAYMENT_REFUND');
CREATE TYPE "DesktopPaymentStatus"            AS ENUM ('PENDING','SUCCEEDED','FAILED','CANCELED');
CREATE TYPE "DesktopPaymentProvider"          AS ENUM ('MANUAL','STRIPE','BOG');
CREATE TYPE "DesktopSendingAccountProvider"   AS ENUM ('GMAIL','OUTLOOK','YAHOO','CUSTOM');
CREATE TYPE "DesktopSendingAccountStatus"     AS ENUM ('NOT_TESTED','CONNECTED','FAILED','NEEDS_ATTENTION','PAUSED','TESTING');
CREATE TYPE "CampaignStatus"                  AS ENUM ('DRAFT','QUEUED','SENDING','PAUSED','COMPLETED','FAILED');
CREATE TYPE "CampaignScheduleMode"            AS ENUM ('ONCE','DAILY');
CREATE TYPE "CampaignPreflightStatus"         AS ENUM ('GOOD','WARNING','CRITICAL');
CREATE TYPE "ReportExportSection"             AS ENUM ('SENT','OPENED','CLICKED','ALL');
CREATE TYPE "ReportExportFormat"              AS ENUM ('CSV','XLSX');
CREATE TYPE "ReportExportStatus"              AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED');

-- ── DesktopUser ────────────────────────────────────────────────────────────
CREATE TABLE "DesktopUser" (
  "id"             TEXT PRIMARY KEY,
  "userType"       "DesktopUserType" NOT NULL,
  "firstName"      TEXT,
  "lastName"       TEXT,
  "personalNumber" TEXT UNIQUE,
  "birthDate"      TIMESTAMP(3),
  "companyName"    TEXT,
  "companyIdCode"  TEXT UNIQUE,
  "phone"          TEXT NOT NULL,
  "email"          TEXT NOT NULL UNIQUE,
  "passwordHash"   TEXT NOT NULL,
  "balance"        INTEGER NOT NULL DEFAULT 0,
  "isAdmin"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DesktopUser_email_idx" ON "DesktopUser"("email");

-- ── DesktopRefreshToken ────────────────────────────────────────────────────
CREATE TABLE "DesktopRefreshToken" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DesktopRefreshToken_userId_idx"    ON "DesktopRefreshToken"("userId");
CREATE INDEX "DesktopRefreshToken_expiresAt_idx" ON "DesktopRefreshToken"("expiresAt");

-- ── DesktopSmtpConfig ──────────────────────────────────────────────────────
CREATE TABLE "DesktopSmtpConfig" (
  "id"             TEXT PRIMARY KEY,
  "desktopUserId"  TEXT NOT NULL UNIQUE REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "host"           TEXT NOT NULL,
  "port"           INTEGER NOT NULL DEFAULT 465,
  "secure"         BOOLEAN NOT NULL DEFAULT true,
  "username"       TEXT NOT NULL,
  "passwordEnc"    TEXT NOT NULL,
  "fromEmail"      TEXT,
  "fromName"       TEXT,
  "trackOpens"     BOOLEAN NOT NULL DEFAULT true,
  "trackClicks"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);

-- ── DesktopSmtpPoolAccount ─────────────────────────────────────────────────
CREATE TABLE "DesktopSmtpPoolAccount" (
  "id"               TEXT PRIMARY KEY,
  "desktopUserId"    TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "host"             TEXT NOT NULL,
  "port"             INTEGER NOT NULL DEFAULT 465,
  "secure"           BOOLEAN NOT NULL DEFAULT true,
  "username"         TEXT NOT NULL,
  "passwordEnc"      TEXT NOT NULL,
  "fromEmail"        TEXT,
  "fromName"         TEXT,
  "proxyType"        TEXT,
  "proxyHost"        TEXT,
  "proxyPort"        INTEGER,
  "proxyUsername"    TEXT,
  "proxyPasswordEnc" TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "failCount"        INTEGER NOT NULL DEFAULT 0,
  "priority"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DesktopSmtpPoolAccount_desktopUserId_active_priority_created_idx"
  ON "DesktopSmtpPoolAccount"("desktopUserId","active","priority","createdAt");

-- ── DesktopSendingAccount ──────────────────────────────────────────────────
CREATE TABLE "DesktopSendingAccount" (
  "id"                TEXT PRIMARY KEY,
  "desktopUserId"     TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "provider"          "DesktopSendingAccountProvider" NOT NULL,
  "host"              TEXT NOT NULL,
  "port"              INTEGER NOT NULL DEFAULT 465,
  "secure"            BOOLEAN NOT NULL DEFAULT true,
  "username"          TEXT NOT NULL,
  "passwordEnc"       TEXT NOT NULL,
  "senderEmail"       TEXT,
  "senderName"        TEXT,
  "rotationEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "status"            "DesktopSendingAccountStatus" NOT NULL DEFAULT 'NOT_TESTED',
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "failCount"         INTEGER NOT NULL DEFAULT 0,
  "lastTestedAt"      TIMESTAMP(3),
  "lastTestSuccess"   BOOLEAN,
  "lastTestError"     TEXT,
  "lastTestLatencyMs" INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  UNIQUE ("desktopUserId","provider","host","port","username")
);
CREATE INDEX "DesktopSendingAccount_user_status_rotation_created_idx"
  ON "DesktopSendingAccount"("desktopUserId","status","rotationEnabled","createdAt");
CREATE INDEX "DesktopSendingAccount_user_active_created_idx"
  ON "DesktopSendingAccount"("desktopUserId","active","createdAt");

-- ── DesktopQuota ───────────────────────────────────────────────────────────
CREATE TABLE "DesktopQuota" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "allowed"   INTEGER NOT NULL,
  "charged"   INTEGER NOT NULL,
  "sent"      INTEGER NOT NULL DEFAULT 0,
  "failed"    INTEGER NOT NULL DEFAULT 0,
  "refunded"  INTEGER NOT NULL DEFAULT 0,
  "status"    TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DesktopQuota_userId_idx"               ON "DesktopQuota"("userId");
CREATE INDEX "DesktopQuota_expiresAt_idx"            ON "DesktopQuota"("expiresAt");
CREATE INDEX "DesktopQuota_status_expiresAt_idx"     ON "DesktopQuota"("status","expiresAt");

-- ── DesktopPayment ─────────────────────────────────────────────────────────
CREATE TABLE "DesktopPayment" (
  "id"                  TEXT PRIMARY KEY,
  "userId"              TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "amount"              INTEGER NOT NULL,
  "currency"            TEXT NOT NULL DEFAULT 'GEL',
  "status"              "DesktopPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider"            "DesktopPaymentProvider" NOT NULL DEFAULT 'MANUAL',
  "externalPaymentId"   TEXT,
  "metadata"            JSONB,
  "processedByAdminId"  TEXT,
  "completedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DesktopPayment_user_created_idx"       ON "DesktopPayment"("userId","createdAt");
CREATE INDEX "DesktopPayment_status_created_idx"     ON "DesktopPayment"("status","createdAt");
CREATE INDEX "DesktopPayment_externalPaymentId_idx"  ON "DesktopPayment"("externalPaymentId");

-- ── DesktopLedgerEntry ─────────────────────────────────────────────────────
CREATE TABLE "DesktopLedgerEntry" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "type"           "DesktopLedgerEntryType" NOT NULL,
  "amount"         INTEGER NOT NULL,
  "balanceBefore"  INTEGER NOT NULL,
  "balanceAfter"   INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'GEL',
  "referenceType"  TEXT,
  "referenceId"    TEXT,
  "description"    TEXT,
  "metadata"       JSONB,
  "idempotencyKey" TEXT UNIQUE,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DesktopLedgerEntry_user_created_idx" ON "DesktopLedgerEntry"("userId","createdAt");
CREATE INDEX "DesktopLedgerEntry_ref_idx"          ON "DesktopLedgerEntry"("referenceType","referenceId");

-- ── Contacts ───────────────────────────────────────────────────────────────
CREATE TABLE "ContactList" (
  "id"             TEXT PRIMARY KEY,
  "desktopUserId"  TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "name"           TEXT NOT NULL,
  "columns"        JSONB NOT NULL,
  "emailColumn"    TEXT NOT NULL,
  "contactCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ContactList_user_created_idx" ON "ContactList"("desktopUserId","createdAt");

CREATE TABLE "Contact" (
  "id"            TEXT PRIMARY KEY,
  "contactListId" TEXT NOT NULL REFERENCES "ContactList"("id") ON DELETE CASCADE,
  "email"         TEXT NOT NULL,
  "data"          JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("contactListId","email")
);
CREATE INDEX "Contact_listId_idx" ON "Contact"("contactListId");
CREATE INDEX "Contact_email_idx"  ON "Contact"("email");

-- ── Campaign infrastructure ────────────────────────────────────────────────
CREATE TABLE "CampaignTemplate" (
  "id"            TEXT PRIMARY KEY,
  "desktopUserId" TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "name"          TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT 'custom',
  "subject"       TEXT NOT NULL,
  "html"          TEXT NOT NULL,
  "description"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE INDEX "CampaignTemplate_user_created_idx" ON "CampaignTemplate"("desktopUserId","createdAt");

CREATE TABLE "Campaign" (
  "id"                       TEXT PRIMARY KEY,
  "desktopUserId"            TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "name"                     TEXT NOT NULL,
  "subject"                  TEXT NOT NULL,
  "previewText"              TEXT,
  "senderName"               TEXT,
  "senderEmail"              TEXT,
  "html"                     TEXT NOT NULL,
  "status"                   "CampaignStatus"       NOT NULL DEFAULT 'DRAFT',
  "scheduleMode"             "CampaignScheduleMode" NOT NULL DEFAULT 'ONCE',
  "contactListId"            TEXT REFERENCES "ContactList"("id") ON DELETE SET NULL,
  "scheduledAt"              TIMESTAMP(3),
  "dailyLimit"               INTEGER,
  "dailySendTime"            TEXT,
  "dailySentOffset"          INTEGER NOT NULL DEFAULT 0,
  "dailyTotalCount"          INTEGER,
  "startedAt"                TIMESTAMP(3),
  "completedAt"              TIMESTAMP(3),
  "totalCount"               INTEGER NOT NULL DEFAULT 0,
  "sentCount"                INTEGER NOT NULL DEFAULT 0,
  "failedCount"              INTEGER NOT NULL DEFAULT 0,
  "openCount"                INTEGER NOT NULL DEFAULT 0,
  "clickCount"               INTEGER NOT NULL DEFAULT 0,
  "bounceCount"              INTEGER NOT NULL DEFAULT 0,
  "preflightStatus"          "CampaignPreflightStatus",
  "preflightRecommendations" JSONB,
  "preflightCheckedAt"       TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Campaign_user_created_idx" ON "Campaign"("desktopUserId","createdAt");
CREATE INDEX "Campaign_status_idx"       ON "Campaign"("status");

CREATE TABLE "CampaignFailedRecipient" (
  "id"         TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "email"      TEXT NOT NULL,
  "reason"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("campaignId","email")
);
CREATE INDEX "CampaignFailedRecipient_campaign_created_idx" ON "CampaignFailedRecipient"("campaignId","createdAt");

CREATE TABLE "CampaignRecipientActivity" (
  "id"             TEXT PRIMARY KEY,
  "campaignId"     TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "email"          TEXT NOT NULL,
  "emailHash"      TEXT NOT NULL,
  "sender"         TEXT,
  "sentAt"         TIMESTAMP(3) NOT NULL,
  "firstOpenedAt"  TIMESTAMP(3),
  "lastOpenedAt"   TIMESTAMP(3),
  "opensCount"     INTEGER NOT NULL DEFAULT 0,
  "firstClickedAt" TIMESTAMP(3),
  "lastClickedAt"  TIMESTAMP(3),
  "clicksCount"    INTEGER NOT NULL DEFAULT 0,
  "lastClickedUrl" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  UNIQUE ("campaignId","emailHash")
);
CREATE INDEX "CampaignRecipientActivity_campaign_sent_idx"        ON "CampaignRecipientActivity"("campaignId","sentAt");
CREATE INDEX "CampaignRecipientActivity_campaign_firstOpened_idx" ON "CampaignRecipientActivity"("campaignId","firstOpenedAt");
CREATE INDEX "CampaignRecipientActivity_campaign_firstClicked_idx" ON "CampaignRecipientActivity"("campaignId","firstClickedAt");

CREATE TABLE "CampaignReport" (
  "id"            TEXT PRIMARY KEY,
  "campaignId"    TEXT NOT NULL UNIQUE,
  "desktopUserId" TEXT REFERENCES "DesktopUser"("id") ON DELETE SET NULL,
  "hwid"          TEXT NOT NULL,
  "licenseKey"    TEXT,
  "total"         INTEGER NOT NULL,
  "sent"          INTEGER NOT NULL,
  "failed"        INTEGER NOT NULL,
  "startedAt"     TIMESTAMP(3) NOT NULL,
  "finishedAt"    TIMESTAMP(3) NOT NULL,
  "events"        JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CampaignReport_desktopUserId_idx" ON "CampaignReport"("desktopUserId");

CREATE TABLE "ReportExportJob" (
  "id"             TEXT PRIMARY KEY,
  "desktopUserId"  TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "campaignId"     TEXT REFERENCES "Campaign"("id") ON DELETE SET NULL,
  "section"        "ReportExportSection" NOT NULL,
  "format"         "ReportExportFormat"  NOT NULL,
  "status"         "ReportExportStatus"  NOT NULL DEFAULT 'PENDING',
  "dateFrom"       TIMESTAMP(3),
  "dateTo"         TIMESTAMP(3),
  "rowCount"       INTEGER NOT NULL DEFAULT 0,
  "filePath"       TEXT,
  "fileName"       TEXT,
  "error"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ReportExportJob_user_status_created_idx" ON "ReportExportJob"("desktopUserId","status","createdAt");

CREATE TABLE "DesktopWarmupSender" (
  "id"            TEXT PRIMARY KEY,
  "desktopUserId" TEXT NOT NULL REFERENCES "DesktopUser"("id") ON DELETE CASCADE,
  "senderKey"     TEXT NOT NULL,
  "firstSeenAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSentDate"  TEXT,
  "sentToday"     INTEGER NOT NULL DEFAULT 0,
  "totalSent"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  UNIQUE ("desktopUserId","senderKey")
);
CREATE INDEX "DesktopWarmupSender_user_sender_idx" ON "DesktopWarmupSender"("desktopUserId","senderKey");

-- ── Standalone artifacts ───────────────────────────────────────────────────
CREATE TABLE "AppRelease" (
  "id"            TEXT PRIMARY KEY,
  "version"       TEXT NOT NULL UNIQUE,
  "releaseNotes"  TEXT,
  "downloadUrl"   TEXT NOT NULL,
  "isMandatory"   BOOLEAN NOT NULL DEFAULT false,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LicenseKey" (
  "id"        TEXT PRIMARY KEY,
  "key"       TEXT NOT NULL UNIQUE,
  "tier"      TEXT NOT NULL,
  "hwid"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LicenseKey_key_idx"  ON "LicenseKey"("key");
CREATE INDEX "LicenseKey_hwid_idx" ON "LicenseKey"("hwid");

CREATE TABLE "EmailTrackingEvent" (
  "id"         TEXT PRIMARY KEY,
  "campaignId" TEXT,
  "email"      TEXT,
  "emailHash"  TEXT,
  "eventType"  TEXT NOT NULL,
  "url"        TEXT,
  "userAgent"  TEXT,
  "ipAddress"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailTrackingEvent_campaign_type_idx" ON "EmailTrackingEvent"("campaignId","eventType");
CREATE INDEX "EmailTrackingEvent_hash_type_idx"     ON "EmailTrackingEvent"("emailHash","eventType");
CREATE INDEX "EmailTrackingEvent_created_idx"       ON "EmailTrackingEvent"("createdAt");

CREATE TABLE "UnsubscribedEmail" (
  "id"            TEXT PRIMARY KEY,
  "email"         TEXT NOT NULL,
  "source"        TEXT NOT NULL DEFAULT 'link',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "desktopUserId" TEXT REFERENCES "DesktopUser"("id") ON DELETE SET NULL,
  UNIQUE ("email","desktopUserId")
);
CREATE INDEX "UnsubscribedEmail_created_idx"       ON "UnsubscribedEmail"("createdAt");
CREATE INDEX "UnsubscribedEmail_desktopUserId_idx" ON "UnsubscribedEmail"("desktopUserId");
