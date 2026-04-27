import { NextResponse } from "next/server";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { getCampaignQueue } from "@/lib/campaign-queue";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["SENDING", "QUEUED", "PAUSED"] as const;

function normalizeJobProgress(progress: unknown): number | null {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    return Math.max(0, Math.min(100, progress));
  }
  if (progress && typeof progress === "object" && "progress" in progress) {
    const value = Number((progress as { progress?: unknown }).progress);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;

  const activeCampaign = await prisma.campaign.findFirst({
    where: {
      desktopUserId: auth.user.id,
      status: { in: [...ACTIVE_STATUSES] },
    },
    orderBy: [{ startedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      scheduledAt: true,
      totalCount: true,
      sentCount: true,
      failedCount: true,
      openCount: true,
      clickCount: true,
      bounceCount: true,
      startedAt: true,
      completedAt: true,
      updatedAt: true,
    },
  });

  const campaign =
    activeCampaign ??
    (await prisma.campaign.findFirst({
      where: { desktopUserId: auth.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        scheduledAt: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        openCount: true,
        clickCount: true,
        bounceCount: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    }));

  if (!campaign) {
    return NextResponse.json({ campaign: null, queue: null });
  }

  const queue = getCampaignQueue();
  const job = queue ? await queue.getJob(`campaign-${campaign.id}`) : null;
  const jobState = job ? await job.getState().catch(() => null) : null;
  const processed = campaign.sentCount + campaign.failedCount;
  const total = Math.max(campaign.totalCount, processed);
  const derivedProgress = total > 0 ? Math.round((processed / total) * 100) : 0;

  return NextResponse.json({
    campaign,
    queue: {
      available: Boolean(queue),
      jobId: job?.id ?? null,
      state: jobState,
      progress: normalizeJobProgress(job?.progress) ?? derivedProgress,
      processed,
      sent: campaign.sentCount,
      failed: campaign.failedCount,
      total,
    },
  });
}
