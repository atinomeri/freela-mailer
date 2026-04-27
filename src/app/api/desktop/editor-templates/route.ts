import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { saveMailerEditorTemplateSchema } from "@/lib/validation";
import { created, errors, success } from "@/lib/api-response";

function logDevError(scope: string, err: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  console.error(scope, err);
}

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
      : 20;

    const items = await prisma.mailerEditorTemplate.findMany({
      where: { desktopUserId: auth.user.id },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        subject: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success(items);
  } catch (err) {
    logDevError("[Editor Templates List] Error:", err);
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = saveMailerEditorTemplateSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const payload = parsed.data;

    if (payload.id) {
      const existing = await prisma.mailerEditorTemplate.findUnique({
        where: { id: payload.id },
        select: { desktopUserId: true },
      });

      if (!existing) return errors.notFound("Editor template");
      if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

      const updated = await prisma.$transaction(async (tx) => {
        const editorTemplate = await tx.mailerEditorTemplate.update({
          where: { id: payload.id },
          data: {
            name: payload.name,
            subject: payload.subject ?? null,
            editorProjectJson: payload.editorProjectJson as Prisma.InputJsonValue,
            mjmlSource: payload.mjmlSource ?? "",
            htmlOutput: payload.htmlOutput,
          },
          select: {
            id: true,
            name: true,
            subject: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const existingCampaignTemplate = await tx.campaignTemplate.findUnique({
          where: { id: payload.id },
          select: { desktopUserId: true },
        });

        if (!existingCampaignTemplate) {
          await tx.campaignTemplate.create({
            data: {
              id: payload.id,
              desktopUserId: auth.user.id,
              name: payload.name,
              category: "unlayer-editor",
              subject: payload.subject?.trim() || payload.name,
              html: payload.htmlOutput,
              description: "Created in Unlayer editor",
            },
          });
        } else if (existingCampaignTemplate.desktopUserId === auth.user.id) {
          await tx.campaignTemplate.update({
            where: { id: payload.id },
            data: {
              name: payload.name,
              category: "unlayer-editor",
              subject: payload.subject?.trim() || payload.name,
              html: payload.htmlOutput,
            },
          });
        }

        return editorTemplate;
      });

      return success(updated);
    }

    const template = await prisma.$transaction(async (tx) => {
      const editorTemplate = await tx.mailerEditorTemplate.create({
        data: {
          desktopUserId: auth.user.id,
          name: payload.name,
          subject: payload.subject ?? null,
          editorProjectJson: payload.editorProjectJson as Prisma.InputJsonValue,
          mjmlSource: payload.mjmlSource ?? "",
          htmlOutput: payload.htmlOutput,
        },
        select: {
          id: true,
          name: true,
          subject: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.campaignTemplate.upsert({
        where: { id: editorTemplate.id },
        create: {
          id: editorTemplate.id,
          desktopUserId: auth.user.id,
          name: payload.name,
          category: "unlayer-editor",
          subject: payload.subject?.trim() || payload.name,
          html: payload.htmlOutput,
          description: "Created in Unlayer editor",
        },
        update: {
          desktopUserId: auth.user.id,
          name: payload.name,
          category: "unlayer-editor",
          subject: payload.subject?.trim() || payload.name,
          html: payload.htmlOutput,
        },
      });

      return editorTemplate;
    });

    return created(template);
  } catch (err) {
    logDevError("[Editor Templates Save] Error:", err);
    return errors.serverError();
  }
}
