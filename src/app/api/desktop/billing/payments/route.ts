import { requireDesktopAuth } from "@/lib/desktop-auth";
import { prisma } from "@/lib/prisma";
import { errors, successWithPagination } from "@/lib/api-response";
import { listDesktopPaymentsSchema } from "@/lib/validation";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const parsed = listDesktopPaymentsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const { page, limit, status } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      userId: auth.user.id,
      ...(status ? { status } : {}),
    };

    const [payments, total] = await Promise.all([
      prisma.desktopPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          provider: true,
          externalPaymentId: true,
          metadata: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.desktopPayment.count({ where }),
    ]);

    return successWithPagination(payments, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[Desktop Billing Payments] Error:", err);
    return errors.serverError();
  }
}
