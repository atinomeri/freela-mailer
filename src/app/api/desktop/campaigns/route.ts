import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  createCampaignSchema,
  listCampaignsSchema,
} from "@/lib/validation";
import { errors, created, successWithPagination } from "@/lib/api-response";
import { ensureCampaignRuntimeStarted } from "@/lib/campaign-runtime-init";
import {
  deriveDailySendTimeFromDate,
  nextDailyRunFrom,
} from "@/lib/campaign-schedule";
import type { CampaignStatus } from "@prisma/client";

// ── POST /api/desktop/campaigns — create campaign ────────────
export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const {
      name,
      subject,
      previewText,
      senderName,
      senderEmail,
      html,
      contactListId,
      preflight,
      scheduleMode,
      scheduledAt,
      dailyLimit,
      dailySendTime,
    } =
      parsed.data;

    let scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    let normalizedDailyLimit: number | null = null;
    let normalizedDailySendTime: string | null = null;

    if (scheduleMode === "DAILY") {
      normalizedDailyLimit = dailyLimit ?? null;
      normalizedDailySendTime =
        dailySendTime ||
        (scheduledDate ? deriveDailySendTimeFromDate(scheduledDate) : "10:00");
      if (!scheduledDate) {
        scheduledDate = nextDailyRunFrom(new Date(), normalizedDailySendTime);
      }
    }

    let resolvedContactListId: string | null = null;
    let resolvedTotalCount = 0;
    if (contactListId) {
      const list = await prisma.contactList.findUnique({
        where: { id: contactListId },
        select: {
          id: true,
          desktopUserId: true,
          contactCount: true,
        },
      });
      if (!list) return errors.notFound("Contact list");
      if (list.desktopUserId !== auth.user.id) return errors.forbidden();
      resolvedContactListId = list.id;
      resolvedTotalCount = list.contactCount;
    }

    const campaign = await prisma.campaign.create({
      data: {
        desktopUserId: auth.user.id,
        name,
        subject,
        previewText: previewText ?? null,
        senderName: senderName ?? null,
        senderEmail: senderEmail ?? null,
        html,
        contactListId: resolvedContactListId,
        scheduleMode,
        scheduledAt: scheduledDate,
        dailyLimit: normalizedDailyLimit,
        dailySendTime: normalizedDailySendTime,
        dailySentOffset: 0,
        dailyTotalCount: null,
        totalCount: resolvedTotalCount,
        preflightStatus: preflight?.status ?? null,
        preflightRecommendations: preflight?.recommendations ?? undefined,
        preflightCheckedAt: preflight?.checkedAt ? new Date(preflight.checkedAt) : null,
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

    return created(campaign);
  } catch (err) {
    console.error("[Campaign Create] Error:", err);
    return errors.serverError();
  }
}

// ── GET /api/desktop/campaigns — list campaigns ──────────────
export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const url = new URL(req.url);
    const parsed = listCampaignsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
    });
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { page, limit, status, campaignId, dateFrom, dateTo } = parsed.data;
    const skip = (page - 1) * limit;

    const createdAtFilter: {
      gte?: Date;
      lt?: Date;
    } = {};
    if (dateFrom) {
      createdAtFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      const toStart = new Date(`${dateTo}T00:00:00.000Z`);
      const nextDay = new Date(toStart.getTime() + 86_400_000);
      createdAtFilter.lt = nextDay;
    }

    const where = {
      desktopUserId: auth.user.id,
      ...(status ? { status: status as CampaignStatus } : {}),
      ...(campaignId ? { id: campaignId } : {}),
      ...(createdAtFilter.gte || createdAtFilter.lt ? { createdAt: createdAtFilter } : {}),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      select: {
          id: true,
        name: true,
        subject: true,
        previewText: true,
        status: true,
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
          openCount: true,
          clickCount: true,
          bounceCount: true,
          preflightStatus: true,
          preflightCheckedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return successWithPagination(campaigns, {
      page,
      pageSize: limit,
      total,
    });
  } catch (err) {
    console.error("[Campaign List] Error:", err);
    return errors.serverError();
  }
}
