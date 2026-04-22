import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { assignContactListSchema } from "@/lib/validation";
import { errors, success } from "@/lib/api-response";
import { ensureCampaignRuntimeStarted } from "@/lib/campaign-runtime-init";

type RouteContext = { params: Promise<{ id: string }> };

// ── PATCH /api/desktop/campaigns/:id/assign-list — link contact list ─
export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    ensureCampaignRuntimeStarted();

    const { id } = await params;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = assignContactListSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    // Verify campaign ownership + DRAFT status
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { desktopUserId: true, status: true },
    });

    if (!campaign) return errors.notFound("Campaign");
    if (campaign.desktopUserId !== auth.user.id) return errors.forbidden();
    if (campaign.status !== "DRAFT") {
      return errors.badRequest("Only DRAFT campaigns can be modified");
    }

    // Verify contact list ownership
    const contactList = await prisma.contactList.findUnique({
      where: { id: parsed.data.contactListId },
      select: { desktopUserId: true, contactCount: true },
    });

    if (!contactList) return errors.notFound("Contact list");
    if (contactList.desktopUserId !== auth.user.id) return errors.forbidden();

    // Assign list and update total count
    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        contactListId: parsed.data.contactListId,
        totalCount: contactList.contactCount,
      },
      select: {
        id: true,
        name: true,
        subject: true,
        status: true,
        contactListId: true,
        totalCount: true,
        updatedAt: true,
      },
    });

    return success(updated);
  } catch (err) {
    console.error("[Campaign AssignList] Error:", err);
    return errors.serverError();
  }
}
