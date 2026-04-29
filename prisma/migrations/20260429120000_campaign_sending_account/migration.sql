-- Bind a campaign to a specific sending account (DesktopSmtpPoolAccount).
-- When set, the worker uses only this account (no rotation, no fallback).
-- When null, the worker keeps the existing pool-rotation behaviour.

ALTER TABLE "Campaign"
  ADD COLUMN "sendingAccountId" TEXT;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_sendingAccountId_fkey"
  FOREIGN KEY ("sendingAccountId") REFERENCES "DesktopSmtpPoolAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Campaign_sendingAccountId_idx"
  ON "Campaign"("sendingAccountId");
