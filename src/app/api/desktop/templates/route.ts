import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  createCampaignTemplateSchema,
  listCampaignTemplatesSchema,
} from "@/lib/validation";
import { BUILTIN_MAILER_TEMPLATES } from "@/lib/mailer-templates";
import { created, errors, success } from "@/lib/api-response";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const parsed = listCampaignTemplatesSchema.safeParse({
      category: url.searchParams.get("category") ?? undefined,
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const { category } = parsed.data;

    const custom = await prisma.campaignTemplate.findMany({
      where: {
        desktopUserId: auth.user.id,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: "desc" },
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

    const builtins = category
      ? BUILTIN_MAILER_TEMPLATES.filter((item) => item.category === category)
      : BUILTIN_MAILER_TEMPLATES;

    return success([
      ...builtins,
      ...custom.map((item) => ({ ...item, builtIn: false as const })),
    ]);
  } catch (err) {
    console.error("[Template List] Error:", err);
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = createCampaignTemplateSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const template = await prisma.campaignTemplate.create({
      data: {
        desktopUserId: auth.user.id,
        name: parsed.data.name,
        category: parsed.data.category,
        subject: parsed.data.subject,
        html: parsed.data.html,
        description: parsed.data.description ?? null,
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

    return created({ ...template, builtIn: false as const });
  } catch (err) {
    console.error("[Template Create] Error:", err);
    return errors.serverError();
  }
}

