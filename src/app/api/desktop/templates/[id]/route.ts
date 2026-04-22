import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { updateCampaignTemplateSchema } from "@/lib/validation";
import { errors, noContent, success } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const template = await prisma.campaignTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        desktopUserId: true,
        name: true,
        category: true,
        subject: true,
        html: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!template) return errors.notFound("Template");
    if (template.desktopUserId !== auth.user.id) return errors.forbidden();
    const { desktopUserId: _, ...data } = template;
    return success({ ...data, builtIn: false as const });
  } catch (err) {
    console.error("[Template Get] Error:", err);
    return errors.serverError();
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.campaignTemplate.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });
    if (!existing) return errors.notFound("Template");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = updateCampaignTemplateSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const data = parsed.data;
    const updated = await prisma.campaignTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.subject !== undefined ? { subject: data.subject } : {}),
        ...(data.html !== undefined ? { html: data.html } : {}),
        ...(data.description !== undefined
          ? { description: data.description ?? null }
          : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        subject: true,
        html: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({ ...updated, builtIn: false as const });
  } catch (err) {
    console.error("[Template Update] Error:", err);
    return errors.serverError();
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.campaignTemplate.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });
    if (!existing) return errors.notFound("Template");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    await prisma.campaignTemplate.delete({ where: { id } });
    return noContent();
  } catch (err) {
    console.error("[Template Delete] Error:", err);
    return errors.serverError();
  }
}

