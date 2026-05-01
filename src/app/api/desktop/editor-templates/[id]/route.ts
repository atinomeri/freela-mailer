import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const template = await prisma.mailerEditorTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        desktopUserId: true,
        name: true,
        subject: true,
        editorProjectJson: true,
        mjmlSource: true,
        htmlOutput: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!template) return errors.notFound("Editor template");
    if (template.desktopUserId !== auth.user.id) return errors.forbidden();

    const { desktopUserId: _, ...data } = template;
    return success(data);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Editor Template Get] Error:", err);
    }
    return errors.serverError();
  }
}
