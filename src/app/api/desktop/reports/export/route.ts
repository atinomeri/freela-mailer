import { z } from "zod";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success } from "@/lib/api-response";
import { enqueueReportExport } from "@/lib/reports-export";

const exportSchema = z.object({
  section: z.enum(["SENT", "OPENED", "CLICKED", "ALL"]).default("ALL"),
  format: z.enum(["CSV", "XLSX"]).default("CSV"),
  campaignId: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const result = await enqueueReportExport({
      desktopUserId: auth.user.id,
      section: parsed.data.section,
      format: parsed.data.format,
      filters: {
        campaignId: parsed.data.campaignId,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
      },
    });

    return success({
      mode: result.mode,
      jobId: result.jobId,
      statusUrl: `/api/desktop/reports/export/${result.jobId}`,
      ...(result.mode === "direct"
        ? { downloadUrl: `/api/desktop/reports/export/${result.jobId}/download` }
        : {}),
    });
  } catch (err) {
    console.error("[Reports Export] Error:", err);
    return errors.serverError();
  }
}

