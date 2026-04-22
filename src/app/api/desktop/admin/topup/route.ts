/**
 * Mailer-admin top-up endpoint — replaces /api/admin/topup (NextAuth).
 * Gated by Desktop JWT + DesktopUser.isAdmin. No dependency on freela `User`.
 * Legacy route remains live until Phase 4 cutover.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminTopupSchema } from "@/lib/validation";
import { errors } from "@/lib/api-response";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";
import {
  adjustDesktopUserBalance,
  createDesktopLedgerEntry,
  createDesktopPayment,
} from "@/lib/desktop-billing";

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;
    const adminUserId = auth.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = adminTopupSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { email, amount, reason, externalPaymentId } = parsed.data;

    const user = await prisma.desktopUser.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) return errors.notFound("Desktop user");

    const updated = await prisma.$transaction(async (tx) => {
      const balance = await adjustDesktopUserBalance(tx, user.id, amount);

      const payment = await createDesktopPayment(tx, {
        userId: user.id,
        amount,
        status: "SUCCEEDED",
        provider: "MANUAL",
        externalPaymentId,
        processedByAdminId: adminUserId,
        completedAt: new Date(),
        metadata: {
          reason: reason ?? null,
          source: "mailer-admin-topup",
          adminUserId,
        },
      });

      await createDesktopLedgerEntry(tx, {
        userId: user.id,
        type: "TOPUP",
        amount,
        balanceBefore: balance.before,
        balanceAfter: balance.after,
        referenceType: "payment",
        referenceId: payment.id,
        description: "Mailer admin manual top-up",
        metadata: {
          adminUserId,
          reason: reason ?? null,
          externalPaymentId: externalPaymentId ?? null,
        },
      });

      return {
        email: user.email,
        balance: balance.after,
        paymentId: payment.id,
      };
    });

    return NextResponse.json({
      email: updated.email,
      new_balance: updated.balance,
      payment_id: updated.paymentId,
    });
  } catch (err) {
    console.error("[Mailer Admin Topup] Error:", err);
    return errors.serverError();
  }
}
