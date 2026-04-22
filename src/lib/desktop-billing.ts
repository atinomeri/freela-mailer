import "server-only";

import type {
  DesktopLedgerEntry,
  DesktopLedgerEntryType,
  DesktopPayment,
  DesktopPaymentProvider,
  DesktopPaymentStatus,
  Prisma,
} from "@prisma/client";

export class BillingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type BillingTx = Prisma.TransactionClient;

export interface LedgerCreateInput {
  userId: string;
  type: DesktopLedgerEntryType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey?: string;
}

export interface PaymentCreateInput {
  userId: string;
  amount: number;
  currency?: string;
  status?: DesktopPaymentStatus;
  provider?: DesktopPaymentProvider;
  externalPaymentId?: string;
  metadata?: Prisma.InputJsonValue;
  processedByAdminId?: string;
  completedAt?: Date;
}

export async function lockDesktopUserBalance(tx: BillingTx, userId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ balance: number }[]>`
    SELECT balance
    FROM "DesktopUser"
    WHERE id = ${userId}
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) {
    throw new BillingError("USER_NOT_FOUND", "Desktop user not found");
  }

  return row.balance;
}

export async function setDesktopUserBalance(
  tx: BillingTx,
  userId: string,
  newBalance: number,
): Promise<void> {
  await tx.desktopUser.update({
    where: { id: userId },
    data: { balance: newBalance },
  });
}

export async function adjustDesktopUserBalance(
  tx: BillingTx,
  userId: string,
  delta: number,
): Promise<{ before: number; after: number }> {
  const before = await lockDesktopUserBalance(tx, userId);
  const after = before + delta;

  if (after < 0) {
    throw new BillingError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }

  await setDesktopUserBalance(tx, userId, after);

  return { before, after };
}

export async function createDesktopLedgerEntry(
  tx: BillingTx,
  input: LedgerCreateInput,
): Promise<DesktopLedgerEntry> {
  if (input.idempotencyKey) {
    const existing = await tx.desktopLedgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  return tx.desktopLedgerEntry.create({
    data: {
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      balanceBefore: input.balanceBefore,
      balanceAfter: input.balanceAfter,
      currency: input.currency ?? "GEL",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function createDesktopPayment(
  tx: BillingTx,
  input: PaymentCreateInput,
): Promise<DesktopPayment> {
  return tx.desktopPayment.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      currency: input.currency ?? "GEL",
      status: input.status ?? "PENDING",
      provider: input.provider ?? "MANUAL",
      externalPaymentId: input.externalPaymentId,
      metadata: input.metadata,
      processedByAdminId: input.processedByAdminId,
      completedAt: input.completedAt,
    },
  });
}
