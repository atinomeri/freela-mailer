import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { updateCampaignSchema } from "@/lib/validation";
import { errors, success, noContent } from "@/lib/api-response";
import { ensureCampaignRuntimeStarted } from "@/lib/campaign-runtime-init";
import { Prisma } from "@prisma/client";
import {
  deriveDailySendTimeFromDate,
  nextDailyRunFrom,
} from "@/lib/campaign-schedule";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/desktop/campaigns/:id — get single campaign ─────
export async function GET(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        subject: true,
        previewText: true,
        senderName: true,
        senderEmail: true,
        html: true,
        status: true,
        contactListId: true,
        scheduleMode: true,
        scheduledAt: true,
        dailyLimit: true,
        dailySendTime: true,
        dailySentOffset: true,
        dailyTotalCount: true,
        startedAt: true,
        completedAt: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        preflightStatus: true,
        preflightRecommendations: true,
        preflightCheckedAt: true,
        createdAt: true,
        updatedAt: true,
        desktopUserId: true,
      },
    });

    if (!campaign) return errors.notFound("Campaign");
    if (campaign.desktopUserId !== auth.user.id) return errors.forbidden();

    // Strip desktopUserId from response
    const { desktopUserId: _, ...data } = campaign;
    return success(data);
  } catch (err) {
    console.error("[Campaign Get] Error:", err);
    return errors.serverError();
  }
}

// ── PATCH /api/desktop/campaigns/:id — update draft campaign ─
export async function PATCH(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const { id } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    // Verify ownership and status
    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: {
        desktopUserId: true,
        status: true,
        scheduleMode: true,
        scheduledAt: true,
        dailyLimit: true,
        dailySendTime: true,
      },
    });

    if (!existing) return errors.notFound("Campaign");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();
    if (existing.status !== "DRAFT") {
      return errors.badRequest("Only DRAFT campaigns can be edited");
    }

    const {
      scheduleMode,
      scheduledAt,
      dailyLimit,
      dailySendTime,
      ...rest
    } = parsed.data;

    const shouldResetPreflight =
      parsed.data.subject !== undefined ||
      parsed.data.previewText !== undefined ||
      parsed.data.senderEmail !== undefined ||
      parsed.data.html !== undefined;

    const targetScheduleMode = scheduleMode ?? existing.scheduleMode;
    let nextScheduledAt: Date | null | undefined;
    if (scheduledAt !== undefined) {
      nextScheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    }

    let nextDailyLimit: number | null = null;
    let nextDailySendTime: string | null = null;

    if (targetScheduleMode === "DAILY") {
      nextDailyLimit = dailyLimit ?? existing.dailyLimit;
      if (!nextDailyLimit || nextDailyLimit < 1) {
        return errors.badRequest("dailyLimit is required for DAILY schedule mode");
      }

      nextDailySendTime =
        dailySendTime ??
        existing.dailySendTime ??
        (nextScheduledAt
          ? deriveDailySendTimeFromDate(nextScheduledAt)
          : existing.scheduledAt
            ? deriveDailySendTimeFromDate(existing.scheduledAt)
            : "10:00");

      if (nextScheduledAt === undefined) {
        if (!existing.scheduledAt) {
          nextScheduledAt = nextDailyRunFrom(new Date(), nextDailySendTime);
        }
      } else if (nextScheduledAt === null) {
        nextScheduledAt = nextDailyRunFrom(new Date(), nextDailySendTime);
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...rest,
        ...(scheduleMode !== undefined ? { scheduleMode: targetScheduleMode } : {}),
        ...(nextScheduledAt !== undefined ? { scheduledAt: nextScheduledAt } : {}),
        ...(targetScheduleMode === "DAILY"
          ? {
              dailyLimit: nextDailyLimit,
              dailySendTime: nextDailySendTime,
              ...(scheduleMode === "DAILY" && existing.scheduleMode !== "DAILY"
                ? {
                    dailySentOffset: 0,
                    dailyTotalCount: null,
                    sentCount: 0,
                    failedCount: 0,
                    totalCount: 0,
                  }
                : {}),
            }
          : {
              dailyLimit: null,
              dailySendTime: null,
              dailySentOffset: 0,
              dailyTotalCount: null,
            }),
        ...(shouldResetPreflight
          ? {
              preflightStatus: null,
              preflightRecommendations: Prisma.DbNull,
              preflightCheckedAt: null,
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        subject: true,
        previewText: true,
        senderName: true,
        senderEmail: true,
        status: true,
        contactListId: true,
        scheduleMode: true,
        scheduledAt: true,
        dailyLimit: true,
        dailySendTime: true,
        dailySentOffset: true,
        dailyTotalCount: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        preflightStatus: true,
        preflightRecommendations: true,
        preflightCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success(campaign);
  } catch (err) {
    console.error("[Campaign Update] Error:", err);
    return errors.serverError();
  }
}

// ── DELETE /api/desktop/campaigns/:id — delete draft campaign ─
export async function DELETE(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const { id } = await params;

    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: { desktopUserId: true, status: true },
    });

    if (!existing) return errors.notFound("Campaign");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();
    if (existing.status !== "DRAFT") {
      return errors.badRequest("Only DRAFT campaigns can be deleted");
    }

    await prisma.campaign.delete({ where: { id } });

    return noContent();
  } catch (err) {
    console.error("[Campaign Delete] Error:", err);
    return errors.serverError();
  }
}
