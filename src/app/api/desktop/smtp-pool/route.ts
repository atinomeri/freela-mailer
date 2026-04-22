import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import {
  createDesktopSmtpPoolAccountSchema,
} from "@/lib/validation";
import { created, errors, success } from "@/lib/api-response";
import { encryptSecretValue } from "@/lib/secret-crypto";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const accounts = await prisma.desktopSmtpPoolAccount.findMany({
      where: { desktopUserId: auth.user.id },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
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

    return success(accounts);
  } catch (err) {
    console.error("[SMTP Pool List] Error:", err);
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = createDesktopSmtpPoolAccountSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const data = parsed.data;
    const account = await prisma.desktopSmtpPoolAccount.create({
      data: {
        desktopUserId: auth.user.id,
        host: data.host,
        port: data.port,
        secure: data.secure ?? data.port === 465,
        username: data.username,
        passwordEnc: encryptSecretValue(data.password),
        fromEmail: data.fromEmail ?? null,
        fromName: data.fromName ?? null,
        proxyType: data.proxyType ?? null,
        proxyHost: data.proxyHost ?? null,
        proxyPort: data.proxyPort ?? null,
        proxyUsername: data.proxyUsername ?? null,
        proxyPasswordEnc: data.proxyPassword
          ? encryptSecretValue(data.proxyPassword)
          : null,
        active: data.active ?? true,
        priority: data.priority ?? 0,
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

    return created(account);
  } catch (err) {
    console.error("[SMTP Pool Create] Error:", err);
    return errors.serverError();
  }
}

