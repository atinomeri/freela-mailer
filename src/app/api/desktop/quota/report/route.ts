import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { quotaReportSchema } from "@/lib/validation";
import { errors } from "@/lib/api-response";
import {
  adjustDesktopUserBalance,
  createDesktopLedgerEntry,
} from "@/lib/desktop-billing";

const PRICE_PER_EMAIL = Number(process.env.PRICE_PER_EMAIL) || 5; // тетри

type LockedQuota = {
  id: string;
  userId: string;
  allowed: number;
  sent: number;
  failed: number;
  refunded: number;
  status: string;
  expiresAt: Date;
};

export async function POST(req: Request) {
  try {
    // ── Auth (DesktopUser, Bearer JWT) ───────────────────────────
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    // ── Parse body ───────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = quotaReportSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { quota_id, sent, failed, idempotency_key } = parsed.data;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedQuota[]>`
        SELECT id, "userId", allowed, sent, failed, refunded, status, "expiresAt"
        FROM "DesktopQuota"
        WHERE id = ${quota_id}
        FOR UPDATE
      `;
      const lockedQuota = rows[0];

      if (!lockedQuota || lockedQuota.userId !== auth.user.id) {
        return {
          ok: false as const,
          kind: "not_found" as const,
        };
      }

      if (lockedQuota.status !== "active") {
        if (
          lockedQuota.status === "reported" &&
          lockedQuota.sent === sent &&
          lockedQuota.failed === failed
        ) {
          const user = await tx.desktopUser.findUniqueOrThrow({
            where: { id: auth.user.id },
            select: { balance: true },
          });
          return {
            ok: true as const,
            refunded: lockedQuota.refunded,
            balance: user.balance,
            idempotent: true,
          };
        }
        return {
          ok: false as const,
          kind: "bad_request" as const,
          message: "Quota already reported or expired",
        };
      }

      if (lockedQuota.expiresAt < now) {
        return {
          ok: false as const,
          kind: "bad_request" as const,
          message: "Quota has expired",
        };
      }

      if (sent + failed > lockedQuota.allowed) {
        return {
          ok: false as const,
          kind: "bad_request" as const,
          message: `sent + failed (${sent + failed}) exceeds allowed amount (${lockedQuota.allowed})`,
        };
      }

      const refundAmount = failed * PRICE_PER_EMAIL;
      await tx.desktopQuota.update({
        where: { id: quota_id },
        data: {
          status: "reported",
          sent,
          failed,
          refunded: refundAmount,
        },
      });

      if (refundAmount > 0) {
        const balance = await adjustDesktopUserBalance(
          tx,
          auth.user.id,
          refundAmount,
        );
        await createDesktopLedgerEntry(tx, {
          userId: auth.user.id,
          type: "QUOTA_REFUND",
          amount: refundAmount,
          balanceBefore: balance.before,
          balanceAfter: balance.after,
          referenceType: "quota",
          referenceId: quota_id,
          description: `Refund for ${failed} failed emails`,
          idempotencyKey: idempotency_key
            ? `quota-refund:${quota_id}:${idempotency_key}`
            : undefined,
          metadata: {
            sent,
            failed,
            pricePerEmail: PRICE_PER_EMAIL,
            refunded: refundAmount,
          },
        });
        return {
          ok: true as const,
          refunded: refundAmount,
          balance: balance.after,
          idempotent: false,
        };
      }

      const user = await tx.desktopUser.findUniqueOrThrow({
        where: { id: auth.user.id },
        select: { balance: true },
      });
      return {
        ok: true as const,
        refunded: 0,
        balance: user.balance,
        idempotent: false,
      };
    });

    if (!result.ok) {
      if (result.kind === "not_found") return errors.notFound("Quota");
      return errors.badRequest(result.message);
    }

    return NextResponse.json({
      refunded: result.refunded,
      balance: result.balance,
      idempotent: result.idempotent,
    });
  } catch (err) {
    console.error("[Quota Report] Error:", err);
    return errors.serverError();
  }
}
