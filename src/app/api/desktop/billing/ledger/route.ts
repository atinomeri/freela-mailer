import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { errors, successWithPagination } from "@/lib/api-response";
import { listBillingLedgerSchema } from "@/lib/validation";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const parsed = listBillingLedgerSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const { page, limit, type } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      userId: auth.user.id,
      ...(type ? { type } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.desktopLedgerEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          referenceType: true,
          referenceId: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.desktopLedgerEntry.count({ where }),
    ]);

    return successWithPagination(entries, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[Desktop Billing Ledger] Error:", err);
    return errors.serverError();
  }
}
