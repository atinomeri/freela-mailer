import "server-only";

import { prisma } from "@/lib/prisma";

export type ReportSection = "SENT" | "OPENED" | "CLICKED";

export interface ReportFilters {
  campaignId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SentRow {
  email: string;
  campaignId: string;
  campaign: string;
  sender: string | null;
  sentAt: Date;
}

export interface OpenedRow {
  email: string;
  campaignId: string;
  campaign: string;
  firstOpenedAt: Date;
  opensCount: number;
}

export interface ClickedRow {
  email: string;
  campaignId: string;
  campaign: string;
  clickedAt: Date;
  link: string | null;
}

function buildDateRange(dateFrom?: string, dateTo?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (dateFrom) {
    range.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    const start = new Date(`${dateTo}T00:00:00.000Z`);
    range.lt = new Date(start.getTime() + 86_400_000);
  }
  return range;
}

function campaignFilterForUser(desktopUserId: string, filters: ReportFilters) {
  const createdAt = buildDateRange(filters.dateFrom, filters.dateTo);
  return {
    desktopUserId,
    ...(filters.campaignId ? { id: filters.campaignId } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
  };
}

function activityWhere(
  desktopUserId: string,
  section: ReportSection,
  filters: ReportFilters,
) {
  const range = buildDateRange(filters.dateFrom, filters.dateTo);
  const sectionDateField =
    section === "SENT"
      ? "sentAt"
      : section === "OPENED"
        ? "firstOpenedAt"
        : "firstClickedAt";

  return {
    campaign: {
      desktopUserId,
      ...(filters.campaignId ? { id: filters.campaignId } : {}),
    },
    ...(section === "OPENED" ? { firstOpenedAt: { not: null } } : {}),
    ...(section === "CLICKED" ? { firstClickedAt: { not: null } } : {}),
    ...(range.gte || range.lt
      ? {
          [sectionDateField]: {
            ...(range.gte ? { gte: range.gte } : {}),
            ...(range.lt ? { lt: range.lt } : {}),
          },
        }
      : {}),
  };
}

export async function getReportTotals(
  desktopUserId: string,
  filters: ReportFilters,
): Promise<{ sent: number; opened: number; clicked: number }> {
  const where = campaignFilterForUser(desktopUserId, filters);
  const aggregate = await prisma.campaign.aggregate({
    where,
    _sum: {
      sentCount: true,
      openCount: true,
      clickCount: true,
    },
  });

  return {
    sent: aggregate._sum.sentCount ?? 0,
    opened: aggregate._sum.openCount ?? 0,
    clicked: aggregate._sum.clickCount ?? 0,
  };
}

export async function countReportSection(
  desktopUserId: string,
  section: ReportSection,
  filters: ReportFilters,
): Promise<number> {
  return prisma.campaignRecipientActivity.count({
    where: activityWhere(desktopUserId, section, filters),
  });
}

export async function listReportSection(
  desktopUserId: string,
  section: ReportSection,
  filters: ReportFilters,
  page: number,
  limit: number,
): Promise<SentRow[] | OpenedRow[] | ClickedRow[]> {
  const where = activityWhere(desktopUserId, section, filters);
  const skip = (page - 1) * limit;

  if (section === "SENT") {
    const rows = await prisma.campaignRecipientActivity.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
      select: {
        email: true,
        sentAt: true,
        campaign: {
          select: {
            id: true,
            name: true,
            senderEmail: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      email: row.email,
      campaignId: row.campaign.id,
      campaign: row.campaign.name,
      sender: row.campaign.senderEmail,
      sentAt: row.sentAt,
    }));
  }

  if (section === "OPENED") {
    const rows = await prisma.campaignRecipientActivity.findMany({
      where,
      orderBy: { firstOpenedAt: "desc" },
      skip,
      take: limit,
      select: {
        email: true,
        firstOpenedAt: true,
        opensCount: true,
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return rows
      .filter((row) => row.firstOpenedAt)
      .map((row) => ({
        email: row.email,
        campaignId: row.campaign.id,
        campaign: row.campaign.name,
        firstOpenedAt: row.firstOpenedAt as Date,
        opensCount: row.opensCount,
      }));
  }

  const rows = await prisma.campaignRecipientActivity.findMany({
    where,
    orderBy: { firstClickedAt: "desc" },
    skip,
    take: limit,
    select: {
      email: true,
      firstClickedAt: true,
      lastClickedUrl: true,
      campaign: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return rows
    .filter((row) => row.firstClickedAt)
    .map((row) => ({
      email: row.email,
      campaignId: row.campaign.id,
      campaign: row.campaign.name,
      clickedAt: row.firstClickedAt as Date,
      link: row.lastClickedUrl,
    }));
}

