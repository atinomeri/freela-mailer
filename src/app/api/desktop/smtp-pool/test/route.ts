import nodemailer from "nodemailer";
import { errors, success } from "@/lib/api-response";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { decryptSecretValue } from "@/lib/secret-crypto";
import { testDesktopSmtpPoolConnectionSchema } from "@/lib/validation";

function mapSmtpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("authentication")) {
    return "Wrong password. Please try again.";
  }
  if (lower.includes("app password")) {
    return "This provider requires an app password.";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return "SMTP server not responding. Try again in a moment.";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound")) {
    return "Connection failed. Please check your SMTP host and port.";
  }
  return "Connection failed. Please check your settings.";
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = testDesktopSmtpPoolConnectionSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);
    const data = parsed.data;

    let host = data.host ?? "";
    let port = data.port ?? 465;
    let secure = data.secure ?? port === 465;
    let username = data.username ?? "";
    let password = data.password ?? "";

    if (data.accountId) {
      const account = await prisma.desktopSmtpPoolAccount.findUnique({
        where: { id: data.accountId },
        select: {
          desktopUserId: true,
          host: true,
          port: true,
          secure: true,
          username: true,
          passwordEnc: true,
        },
      });

      if (!account) return errors.notFound("SMTP pool account");
      if (account.desktopUserId !== auth.user.id) return errors.forbidden();

      host = account.host;
      port = account.port;
      secure = account.secure;
      username = account.username;
      password = decryptSecretValue(account.passwordEnc);
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: username, pass: password },
    });

    await transporter.verify();
    return success({ connected: true });
  } catch (err) {
    const message = err instanceof Error ? mapSmtpError(err.message) : "Connection failed. Please check your settings.";
    return errors.badRequest(message);
  }
}
