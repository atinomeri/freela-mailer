import { requireDesktopAuth } from "@/lib/desktop-auth";
import { campaignPreflightRequestSchema } from "@/lib/validation";
import { errors, success } from "@/lib/api-response";
import { runCampaignPreflight } from "@/lib/campaign-preflight";

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = campaignPreflightRequestSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const result = runCampaignPreflight(parsed.data);
    return success({
      status: result.status.toLowerCase(),
      recommendations: result.recommendations,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Campaign Preflight] Error:", err);
    return errors.serverError();
  }
}
