import { errors, success } from "@/lib/api-response";
import { mailerSpamCheckSchema } from "@/lib/validation";
import { checkSpamScore } from "@/lib/mailer-preflight";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = mailerSpamCheckSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const report = checkSpamScore(parsed.data.subject, parsed.data.html);
    return success(report);
  } catch (err) {
    console.error("[Internal Preflight Spam Check] Error:", err);
    return errors.serverError();
  }
}
