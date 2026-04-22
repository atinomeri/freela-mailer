import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { retryCampaignFailedSchema } from "@/lib/validation";
import { created, errors } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = retryCampaignFailedSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        desktopUserId: true,
        name: true,
        subject: true,
        senderName: true,
        senderEmail: true,
        html: true,
      },
    });

    if (!campaign) return errors.notFound("Campaign");
    if (campaign.desktopUserId !== auth.user.id) return errors.forbidden();

    const failedRows = await prisma.campaignFailedRecipient.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      select: { email: true },
      distinct: ["email"],
    });

    if (failedRows.length === 0) {
      return errors.badRequest("No failed recipients found for this campaign");
    }

    const retryName =
      parsed.data.newCampaignName?.trim() ||
      `${campaign.name} (Retry)`;
    const retryListName = `Retry — ${campaign.name} — ${new Date()
      .toISOString()
      .slice(0, 10)}`;

    const result = await prisma.$transaction(async (tx) => {
      const list = await tx.contactList.create({
        data: {
          desktopUserId: auth.user.id,
          name: retryListName,
          columns: ["email"],
          emailColumn: "email",
          contactCount: failedRows.length,
        },
        select: { id: true },
      });

      await tx.contact.createMany({
        data: failedRows.map((row) => ({
          contactListId: list.id,
          email: row.email,
          data: {},
        })),
        skipDuplicates: true,
      });

      const retryCampaign = await tx.campaign.create({
        data: {
          desktopUserId: auth.user.id,
          name: retryName,
          subject: campaign.subject,
          senderName: campaign.senderName,
          senderEmail: campaign.senderEmail,
          html: campaign.html,
          status: "DRAFT",
          scheduleMode: "ONCE",
          contactListId: list.id,
          totalCount: failedRows.length,
          sentCount: 0,
          failedCount: 0,
          dailyLimit: null,
          dailySendTime: null,
          dailySentOffset: 0,
          dailyTotalCount: null,
          scheduledAt: null,
          startedAt: null,
          completedAt: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          contactListId: true,
          totalCount: true,
          createdAt: true,
        },
      });

      return { listId: list.id, campaign: retryCampaign };
    });

    return created({
      sourceCampaignId: id,
      retryCampaign: result.campaign,
      retryListId: result.listId,
      recipients: failedRows.length,
    });
  } catch (err) {
    console.error("[Campaign Retry] Error:", err);
    return errors.serverError();
  }
}
