import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors, success, successWithPagination } from "@/lib/api-response";
import { listCampaignFailedRecipientsSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const CSV_INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function csvSafe(value: string): string {
  if (!value) return "";
  return CSV_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const url = new URL(req.url);
    const parsed = listCampaignFailedRecipientsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
    });

    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, desktopUserId: true, name: true },
    });
    if (!campaign) return errors.notFound("Campaign");
    if (campaign.desktopUserId !== auth.user.id) return errors.forbidden();

    const { page, limit, format } = parsed.data;

    if (format === "csv") {
      const rows = await prisma.campaignFailedRecipient.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        select: {
          email: true,
          reason: true,
          createdAt: true,
        },
      });

      const csv = [
        ["email", "reason", "created_at"].join(","),
        ...rows.map((row) =>
          [
            csvEscape(csvSafe(row.email)),
            csvEscape(csvSafe(row.reason ?? "")),
            csvEscape(row.createdAt.toISOString()),
          ].join(","),
        ),
      ].join("\n");

      const filename = `failed_${campaign.name.replace(/[^\w.-]+/g, "_")}_${id}.csv`;
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.campaignFailedRecipient.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          email: true,
          reason: true,
          createdAt: true,
        },
      }),
      prisma.campaignFailedRecipient.count({
        where: { campaignId: id },
      }),
    ]);

    return successWithPagination(rows, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[Campaign Failed List] Error:", err);
    return errors.serverError();
  }
}
