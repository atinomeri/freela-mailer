import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { enqueueCampaignSend } from "@/lib/campaign-queue";
import { ensureCampaignRuntimeStarted } from "@/lib/campaign-runtime-init";
import { errors, success } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

// ── POST /api/desktop/campaigns/:id/send — trigger campaign sending ─
export async function POST(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const { id } = await params;

    // Load campaign with contact list info
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        desktopUserId: true,
        status: true,
        scheduleMode: true,
        dailyLimit: true,
        dailySentOffset: true,
        dailyTotalCount: true,
        preflightStatus: true,
        preflightCheckedAt: true,
        contactListId: true,
        contactList: {
          select: { contactCount: true },
        },
      },
    });

    if (!campaign) return errors.notFound("Campaign");
    if (campaign.desktopUserId !== auth.user.id) return errors.forbidden();

    // Validate campaign is ready to send
    if (campaign.status !== "DRAFT") {
      return errors.badRequest(
        `Campaign cannot be sent from status "${campaign.status}". Only DRAFT campaigns can be sent.`,
      );
    }

    if (!campaign.contactListId || !campaign.contactList) {
      return errors.badRequest(
        "Campaign has no contact list assigned. Use PATCH /campaigns/:id/assign-list first.",
      );
    }

    if (!campaign.preflightCheckedAt || !campaign.preflightStatus) {
      return errors.badRequest("Run preflight before sending this campaign.");
    }

    if (campaign.preflightStatus === "CRITICAL") {
      return errors.badRequest("Fix critical preflight issues before sending.");
    }

    if (campaign.contactList.contactCount === 0) {
      return errors.badRequest("Contact list is empty. Upload contacts first.");
    }

    const unsubscribed = await prisma.unsubscribedEmail.findMany({
      where: { desktopUserId: auth.user.id },
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
        ...(blockedEmails.length > 0
          ? { email: { notIn: blockedEmails } }
          : {}),
      },
    });

    if (eligibleCount === 0) {
      return errors.badRequest(
        "No sendable contacts left after unsubscribe suppression.",
      );
    }

    const isDaily = campaign.scheduleMode === "DAILY";
    const dailyOffset = isDaily ? campaign.dailySentOffset : 0;
    const dailyLimit = isDaily ? Math.max(1, campaign.dailyLimit ?? 1) : eligibleCount;
    const recipientsThisRun = isDaily
      ? Math.max(0, Math.min(dailyLimit, eligibleCount - dailyOffset))
      : eligibleCount;

    if (isDaily && recipientsThisRun <= 0) {
      return errors.badRequest(
        "Daily schedule is already complete for all eligible contacts.",
      );
    }

    // Move to QUEUED status
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "QUEUED",
        totalCount: eligibleCount,
        ...(isDaily && campaign.dailyTotalCount == null
          ? { dailyTotalCount: eligibleCount }
          : {}),
      },
    });

    // Enqueue the job
    const jobId = await enqueueCampaignSend(
      id,
      auth.user.id,
      isDaily
        ? {
            dailyBatch: true,
            sliceOffset: dailyOffset,
            sliceLimit: recipientsThisRun,
          }
        : undefined,
    );

    if (!jobId) {
      // Queue not available — revert status
      await prisma.campaign.update({
        where: { id },
        data: { status: "DRAFT" },
      });
      return errors.serverError(
        "Job queue is not available. Ensure Redis is running.",
      );
    }

    return success({
      campaignId: id,
      status: "QUEUED",
      jobId,
      totalRecipients: recipientsThisRun,
      eligibleRecipients: eligibleCount,
      scheduleMode: campaign.scheduleMode,
      suppressed: Math.max(0, campaign.contactList.contactCount - eligibleCount),
    });
  } catch (err) {
    console.error("[Campaign Send] Error:", err);
    return errors.serverError();
  }
}
