import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export function hashRecipientEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export async function recordSentRecipientActivity(params: {
  campaignId: string;
  email: string;
  sender: string | null;
  sentAt?: Date;
}): Promise<void> {
  const sentAt = params.sentAt ?? new Date();
  const email = params.email.trim().toLowerCase();
  const emailHash = hashRecipientEmail(email);

  await prisma.campaignRecipientActivity.upsert({
    where: {
      campaignId_emailHash: {
        campaignId: params.campaignId,
        emailHash,
      },
    },
    update: {
      email,
      sender: params.sender,
      sentAt,
    },
    create: {
      campaignId: params.campaignId,
      email,
      emailHash,
      sender: params.sender,
      sentAt,
    },
  });
}

export async function recordOpenForRecipient(params: {
  campaignId: string;
  emailHash: string;
  occurredAt?: Date;
}): Promise<void> {
  const occurredAt = params.occurredAt ?? new Date();

  await prisma.$transaction(async (tx) => {
    const row = await tx.campaignRecipientActivity.findUnique({
      where: {
        campaignId_emailHash: {
          campaignId: params.campaignId,
          emailHash: params.emailHash,
        },
      },
      select: {
        id: true,
        firstOpenedAt: true,
      },
    });
    if (!row) return;

    const firstOpenSet = await tx.campaignRecipientActivity.updateMany({
      where: {
        id: row.id,
        firstOpenedAt: null,
      },
      data: {
        firstOpenedAt: occurredAt,
      },
    });

    await tx.campaignRecipientActivity.update({
      where: { id: row.id },
      data: {
        opensCount: { increment: 1 },
        lastOpenedAt: occurredAt,
      },
    });

    if (firstOpenSet.count > 0) {
      await tx.campaign.update({
        where: { id: params.campaignId },
        data: { openCount: { increment: 1 } },
      });
    }
  });
}

export async function recordClickForRecipient(params: {
  campaignId: string;
  emailHash: string;
  url: string | null;
  occurredAt?: Date;
}): Promise<void> {
  const occurredAt = params.occurredAt ?? new Date();

  await prisma.$transaction(async (tx) => {
    const row = await tx.campaignRecipientActivity.findUnique({
      where: {
        campaignId_emailHash: {
          campaignId: params.campaignId,
          emailHash: params.emailHash,
        },
      },
      select: {
        id: true,
        firstClickedAt: true,
      },
    });
    if (!row) return;

    const firstClickSet = await tx.campaignRecipientActivity.updateMany({
      where: {
        id: row.id,
        firstClickedAt: null,
      },
      data: {
        firstClickedAt: occurredAt,
      },
    });

    await tx.campaignRecipientActivity.update({
      where: { id: row.id },
      data: {
        clicksCount: { increment: 1 },
        lastClickedAt: occurredAt,
        lastClickedUrl: params.url,
      },
    });

    if (firstClickSet.count > 0) {
      await tx.campaign.update({
        where: { id: params.campaignId },
        data: { clickCount: { increment: 1 } },
      });
    }
  });
}
