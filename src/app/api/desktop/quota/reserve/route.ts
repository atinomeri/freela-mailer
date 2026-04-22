import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { quotaReserveSchema } from "@/lib/validation";
import { errors } from "@/lib/api-response";
import {
  adjustDesktopUserBalance,
  BillingError,
  createDesktopLedgerEntry,
} from "@/lib/desktop-billing";

const PRICE_PER_EMAIL = Number(process.env.PRICE_PER_EMAIL) || 5; // тетри

export async function POST(req: Request) {
  try {
    // ── Auth (DesktopUser, Bearer JWT) ───────────────────────────
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    // ── Parse body ───────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = quotaReserveSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { count, idempotency_key } = parsed.data;
    const totalCost = count * PRICE_PER_EMAIL;
    const reserveIdempotencyKey = idempotency_key
      ? `quota-reserve:${auth.user.id}:${idempotency_key}`
      : undefined;

    // ── Reserve with row-level locking ───────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      if (reserveIdempotencyKey) {
        const existingEntry = await tx.desktopLedgerEntry.findUnique({
          where: { idempotencyKey: reserveIdempotencyKey },
          select: {
            referenceType: true,
            referenceId: true,
            balanceAfter: true,
          },
        });

        if (existingEntry?.referenceType === "quota" && existingEntry.referenceId) {
          const existingQuota = await tx.desktopQuota.findUnique({
            where: { id: existingEntry.referenceId },
            select: {
              id: true,
              userId: true,
              allowed: true,
              charged: true,
              expiresAt: true,
            },
          });
          if (existingQuota && existingQuota.userId === auth.user.id) {
            return {
              insufficient: false as const,
              quotaId: existingQuota.id,
              allowed: existingQuota.allowed,
              charged: existingQuota.charged,
              expiresAt: existingQuota.expiresAt.getTime() / 1000,
              balance: existingEntry.balanceAfter,
              idempotent: true,
            };
          }
        }
      }

      let balanceBefore: number;
      let balanceAfter: number;
      try {
        const balance = await adjustDesktopUserBalance(tx, auth.user.id, -totalCost);
        balanceBefore = balance.before;
        balanceAfter = balance.after;
      } catch (err) {
        if (!(err instanceof BillingError) || err.code !== "INSUFFICIENT_BALANCE") {
          throw err;
        }
        const user = await tx.desktopUser.findUnique({
          where: { id: auth.user.id },
          select: { balance: true },
        });
        const currentBalance = user?.balance ?? 0;
        const maxAllowed = Math.floor(currentBalance / PRICE_PER_EMAIL);
        return {
          insufficient: true as const,
          balance: currentBalance,
          maxAllowed,
        };
      }

      // Create quota
      const quota = await tx.desktopQuota.create({
        data: {
          userId: auth.user.id,
          allowed: count,
          charged: totalCost,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
        },
      });

      await createDesktopLedgerEntry(tx, {
        userId: auth.user.id,
        type: "QUOTA_RESERVE",
        amount: -totalCost,
        balanceBefore,
        balanceAfter,
        referenceType: "quota",
        referenceId: quota.id,
        description: `Quota reserved for ${count} emails`,
        metadata: {
          emailCount: count,
          pricePerEmail: PRICE_PER_EMAIL,
          charged: totalCost,
        },
        idempotencyKey: reserveIdempotencyKey,
      });

      return {
        insufficient: false as const,
        quotaId: quota.id,
        allowed: count,
        charged: totalCost,
        expiresAt: quota.expiresAt.getTime() / 1000,
        balance: balanceAfter,
        idempotent: false,
      };
    });

    if (result.insufficient) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          balance: result.balance,
          max_allowed: result.maxAllowed,
        },
        { status: 402 }
      );
    }

    return NextResponse.json({
      quota_id: result.quotaId,
      allowed: result.allowed,
      charged: result.charged,
      expires_at: result.expiresAt,
      balance: result.balance,
      idempotent: result.idempotent,
    });
  } catch (err) {
    console.error("[Quota Reserve] Error:", err);
    return errors.serverError();
  }
}
