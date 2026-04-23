import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { saveMailerEditorTemplateSchema } from "@/lib/validation";
import { created, errors, success } from "@/lib/api-response";

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
    console.error("[Editor Templates List] Error:", err);
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

      const updated = await prisma.mailerEditorTemplate.update({
        where: { id: payload.id },
        data: {
          name: payload.name,
          subject: payload.subject ?? null,
          editorProjectJson: payload.editorProjectJson,
          mjmlSource: payload.mjmlSource,
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

      return success(updated);
    }

    const template = await prisma.mailerEditorTemplate.create({
      data: {
        desktopUserId: auth.user.id,
        name: payload.name,
        subject: payload.subject ?? null,
        editorProjectJson: payload.editorProjectJson,
        mjmlSource: payload.mjmlSource,
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

    return created(template);
  } catch (err) {
    console.error("[Editor Templates Save] Error:", err);
    return errors.serverError();
  }
}
