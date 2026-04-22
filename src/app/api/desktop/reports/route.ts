import { z } from "zod";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, successWithPagination } from "@/lib/api-response";
import {
  getReportTotals,
  listReportSection,
  countReportSection,
  type ReportSection,
} from "@/lib/reports-data";

const reportsQuerySchema = z.object({
  section: z.enum(["SENT", "OPENED", "CLICKED"]).default("SENT"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  campaignId: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const parsed = reportsQuerySchema.safeParse({
      section: url.searchParams.get("section") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const { section, page, limit, campaignId, dateFrom, dateTo } = parsed.data;
    const filters = { campaignId, dateFrom, dateTo };

    const [totals, totalRows, list] = await Promise.all([
      getReportTotals(auth.user.id, filters),
      countReportSection(auth.user.id, section as ReportSection, filters),
      listReportSection(auth.user.id, section as ReportSection, filters, page, limit),
    ]);

    return successWithPagination(
      {
        section,
        totals,
        rows: list,
      },
      {
        page,
        pageSize: limit,
        total: totalRows,
      },
    );
  } catch (err) {
    console.error("[Reports API] Error:", err);
    return errors.serverError();
  }
}

