/**
 * Mailer-admin payments list — replaces /api/admin/billing/payments.
 * Gated by Desktop JWT + DesktopUser.isAdmin.
 */

import { prisma } from "@/lib/prisma";
import { errors, successWithPagination } from "@/lib/api-response";
import { listDesktopPaymentsSchema } from "@/lib/validation";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim().toLowerCase() || undefined;

    const parsed = listDesktopPaymentsSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const { page, limit, status } = parsed.data;
    const skip = (page - 1) * limit;

    let userId: string | undefined;
    if (email) {
      const desktopUser = await prisma.desktopUser.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!desktopUser) {
        return successWithPagination([], { page, pageSize: limit, total: 0 });
      }
      userId = desktopUser.id;
    }

    const where = {
      ...(userId ? { userId } : {}),
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
          processedByAdminId: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.desktopPayment.count({ where }),
    ]);

    return successWithPagination(payments, { page, pageSize: limit, total });
  } catch (err) {
    console.error("[Mailer Admin Payments] Error:", err);
    return errors.serverError();
  }
}
