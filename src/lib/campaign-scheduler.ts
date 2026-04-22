// NOTE: This module is imported from both the Next.js server runtime (lazy boot
// via ensureCampaignRuntimeStarted) and the standalone mailer-worker entrypoint
// (scripts/mailer-worker.mjs). Relative imports are required so the worker
// process can resolve them without Next.js / tsconfig-paths loader.
import { prisma } from "./prisma";
import { enqueueCampaignSend } from "./campaign-queue";
import { ensureCampaignWorkerStarted } from "./campaign-worker-init";

declare global {
  var __freelaCampaignSchedulerTimer: NodeJS.Timeout | undefined;
  var __freelaCampaignSchedulerRunning: boolean | undefined;
}

const POLL_MS = Math.max(
  5_000,
  parseInt(process.env.CAMPAIGN_SCHEDULER_POLL_MS || "30000", 10),
);
const MAX_BATCH = 25;

async function queueDueCampaigns(): Promise<void> {
  if (globalThis.__freelaCampaignSchedulerRunning) return;
  globalThis.__freelaCampaignSchedulerRunning = true;

  try {
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        status: "DRAFT",
        scheduledAt: { lte: new Date() },
        contactListId: { not: null },
      },
      orderBy: { scheduledAt: "asc" },
      take: MAX_BATCH,
      select: {
        id: true,
        desktopUserId: true,
        scheduleMode: true,
        dailyLimit: true,
        dailySentOffset: true,
        dailyTotalCount: true,
        preflightStatus: true,
        preflightCheckedAt: true,
        contactListId: true,
        contactList: { select: { contactCount: true } },
      },
    });

    if (dueCampaigns.length === 0) return;

    ensureCampaignWorkerStarted();

    for (const campaign of dueCampaigns) {
      if (!campaign.contactListId) continue;
      if (!campaign.preflightCheckedAt || !campaign.preflightStatus || campaign.preflightStatus === "CRITICAL") {
        await prisma.campaign.updateMany({
          where: { id: campaign.id, status: "DRAFT" },
          data: {
            status: "FAILED",
            completedAt: new Date(),
          },
        });
        continue;
      }

      const unsubscribed = await prisma.unsubscribedEmail.findMany({
        where: { desktopUserId: campaign.desktopUserId },
        select: { email: true },
      });
      const blockedEmails = Array.from(
        new Set(
          unsubscribed
            .map((item) => item.email.trim().toLowerCase())
            .filter(Boolean),
        ),
      );

      const eligibleCount = await prisma.contact.count({
        where: {
          contactListId: campaign.contactListId,
          ...(blockedEmails.length > 0 ? { email: { notIn: blockedEmails } } : {}),
        },
      });

      if (eligibleCount <= 0) {
        await prisma.campaign.updateMany({
          where: { id: campaign.id, status: "DRAFT" },
          data: {
            status: "COMPLETED",
            totalCount: 0,
            sentCount: 0,
            failedCount: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            scheduledAt: null,
          },
        });
        continue;
      }

      const isDaily = campaign.scheduleMode === "DAILY";
      const sliceOffset = isDaily ? campaign.dailySentOffset : 0;
      const sliceLimit = isDaily
        ? Math.max(0, Math.min(Math.max(1, campaign.dailyLimit ?? 1), eligibleCount - sliceOffset))
        : eligibleCount;

      if (isDaily && sliceLimit <= 0) {
        await prisma.campaign.updateMany({
          where: { id: campaign.id, status: "DRAFT" },
          data: {
            status: "COMPLETED",
            totalCount: eligibleCount,
            completedAt: new Date(),
            scheduledAt: null,
          },
        });
        continue;
      }

      const updated = await prisma.campaign.updateMany({
        where: {
          id: campaign.id,
          status: "DRAFT",
        },
        data: {
          status: "QUEUED",
          totalCount: eligibleCount,
          ...(isDaily && campaign.dailyTotalCount == null
            ? { dailyTotalCount: eligibleCount }
            : {}),
        },
      });
      if (updated.count === 0) continue;

      const jobId = await enqueueCampaignSend(
        campaign.id,
        campaign.desktopUserId,
        isDaily
          ? {
              dailyBatch: true,
              sliceOffset,
              sliceLimit,
            }
          : undefined,
      );
      if (!jobId) {
        await prisma.campaign.updateMany({
          where: { id: campaign.id, status: "QUEUED" },
          data: { status: "DRAFT" },
        });
      }
    }
  } catch (err) {
    console.error("[Campaign Scheduler] Tick error:", err);
  } finally {
    globalThis.__freelaCampaignSchedulerRunning = false;
  }
}

export function ensureCampaignSchedulerStarted(): boolean {
  if (globalThis.__freelaCampaignSchedulerTimer) return true;

  globalThis.__freelaCampaignSchedulerTimer = setInterval(() => {
    void queueDueCampaigns();
  }, POLL_MS);

  globalThis.__freelaCampaignSchedulerTimer.unref?.();
  void queueDueCampaigns();
  console.log(`[Campaign Scheduler] Started (poll ${POLL_MS}ms)`);
  return true;
}
