CREATE TABLE "MailerEditorTemplate" (
  "id" TEXT NOT NULL,
  "desktopUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT,
  "editorProjectJson" JSONB NOT NULL,
  "mjmlSource" TEXT NOT NULL,
  "htmlOutput" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailerEditorTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailerEditorTemplate_desktopUserId_createdAt_idx"
  ON "MailerEditorTemplate"("desktopUserId", "createdAt");

ALTER TABLE "MailerEditorTemplate"
  ADD CONSTRAINT "MailerEditorTemplate_desktopUserId_fkey"
  FOREIGN KEY ("desktopUserId") REFERENCES "DesktopUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
