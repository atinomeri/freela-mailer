import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { updateDesktopSmtpPoolAccountSchema } from "@/lib/validation";
import { errors, noContent, success } from "@/lib/api-response";
import { encryptSecretValue } from "@/lib/secret-crypto";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.desktopSmtpPoolAccount.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });
    if (!existing) return errors.notFound("SMTP pool account");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = updateDesktopSmtpPoolAccountSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const data = parsed.data;

    const updated = await prisma.desktopSmtpPoolAccount.update({
      where: { id },
      data: {
        ...(data.host !== undefined ? { host: data.host } : {}),
        ...(data.port !== undefined ? { port: data.port } : {}),
        ...(data.secure !== undefined
          ? { secure: data.secure }
          : data.port !== undefined
            ? { secure: data.port === 465 }
            : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.password !== undefined
          ? { passwordEnc: encryptSecretValue(data.password) }
          : {}),
        ...(data.fromEmail !== undefined ? { fromEmail: data.fromEmail ?? null } : {}),
        ...(data.fromName !== undefined ? { fromName: data.fromName ?? null } : {}),
        ...(data.proxyType !== undefined ? { proxyType: data.proxyType ?? null } : {}),
        ...(data.proxyHost !== undefined ? { proxyHost: data.proxyHost ?? null } : {}),
        ...(data.proxyPort !== undefined ? { proxyPort: data.proxyPort ?? null } : {}),
        ...(data.proxyUsername !== undefined
          ? { proxyUsername: data.proxyUsername ?? null }
          : {}),
        ...(data.proxyPassword !== undefined
          ? {
              proxyPasswordEnc: data.proxyPassword
                ? encryptSecretValue(data.proxyPassword)
                : null,
            }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
      },
      select: {
        id: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        proxyType: true,
        proxyHost: true,
        proxyPort: true,
        proxyUsername: true,
        active: true,
        failCount: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success(updated);
  } catch (err) {
    console.error("[SMTP Pool Update] Error:", err);
    return errors.serverError();
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await prisma.desktopSmtpPoolAccount.findUnique({
      where: { id },
      select: { desktopUserId: true },
    });
    if (!existing) return errors.notFound("SMTP pool account");
    if (existing.desktopUserId !== auth.user.id) return errors.forbidden();

    await prisma.desktopSmtpPoolAccount.delete({ where: { id } });
    return noContent();
  } catch (err) {
    console.error("[SMTP Pool Delete] Error:", err);
    return errors.serverError();
  }
}

