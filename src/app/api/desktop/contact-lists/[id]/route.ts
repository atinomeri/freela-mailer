import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success, noContent } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/desktop/contact-lists/:id — get single list ─────
export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;

    const list = await prisma.contactList.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        columns: true,
        emailColumn: true,
        contactCount: true,
        desktopUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!list) return errors.notFound("Contact list");
    if (list.desktopUserId !== auth.user.id) return errors.forbidden();

    const { desktopUserId: _, ...data } = list;
    return success(data);
  } catch (err) {
    console.error("[ContactList Get] Error:", err);
    return errors.serverError();
  }
}

// ── DELETE /api/desktop/contact-lists/:id — delete list + contacts ─
export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;

    const list = await prisma.contactList.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });

    if (!list) return errors.notFound("Contact list");
    if (list.desktopUserId !== auth.user.id) return errors.forbidden();

    await prisma.contactList.delete({ where: { id } });

    return noContent();
  } catch (err) {
    console.error("[ContactList Delete] Error:", err);
    return errors.serverError();
  }
}
