import { errors, success } from "@/lib/api-response";
import { mailerDeliverabilitySchema } from "@/lib/validation";
import { checkDeliverability } from "@/lib/mailer-preflight";
import { prisma } from "@/lib/prisma";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const desktopUserId = url.searchParams.get("desktopUserId")?.trim() ?? "";

    const parsed = mailerDeliverabilitySchema.safeParse({
      senderEmail: url.searchParams.get("senderEmail") ?? undefined,
      domain: url.searchParams.get("domain") ?? undefined,
      dkimSelectors: url.searchParams.getAll("dkimSelector"),
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    let target = parsed.data.senderEmail || parsed.data.domain || "";

    if (!target && desktopUserId) {
      const smtp = await prisma.desktopSmtpConfig.findUnique({
        where: { desktopUserId },
        select: { fromEmail: true, username: true },
      });
      target = smtp?.fromEmail || smtp?.username || "";
    }

    if (!target) {
      return errors.badRequest("senderEmail or domain is required");
    }

    const report = await checkDeliverability(target, parsed.data.dkimSelectors);
    return success(report);
  } catch (err) {
    console.error("[Internal Preflight Deliverability] Error:", err);
    return errors.serverError();
  }
}
