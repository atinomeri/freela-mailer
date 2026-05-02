import "server-only";

import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  countReportSection,
  listReportSection,
  type ClickedRow,
  type OpenedRow,
  type ReportFilters,
  type ReportSection,
  type SentRow,
} from "@/lib/reports-data";

const DIRECT_EXPORT_LIMIT = 5000;
const EXPORT_BATCH = 1000;
// EXPORT_DIR resolution:
//   - MAILER_EXPORT_DIR env override (production docker-compose mounts the
//     `mailer_exports` volume at /data/exports and sets this env).
//   - Default: <cwd>/data/exports (dev).
const EXPORT_DIR =
  process.env.MAILER_EXPORT_DIR?.trim() || path.join(process.cwd(), "data", "exports");
const CSV_INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

declare global {
  var __freelaReportExportWorkers: Set<string> | undefined;
}

function csvSafe(value: string): string {
  if (!value) return "";
  return CSV_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toDate(value: Date | string | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeFilters(filters: ReportFilters) {
  return {
    campaignId: filters.campaignId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  };
}

function downloadFileName(section: "SENT" | "OPENED" | "CLICKED" | "ALL", format: "CSV" | "XLSX"): string {
  const date = new Date().toISOString().slice(0, 10);
  const ext = format === "CSV" ? "csv" : "xlsx";
  return `reports_${section.toLowerCase()}_${date}.${ext}`;
}

function buildDateRange(filters: ReportFilters): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (filters.dateFrom) {
    range.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    const dayStart = new Date(`${filters.dateTo}T00:00:00.000Z`);
    range.lt = new Date(dayStart.getTime() + 86_400_000);
  }
  return range;
}

async function collectRows(
  desktopUserId: string,
  section: "SENT" | "OPENED" | "CLICKED" | "ALL",
  filters: ReportFilters,
): Promise<Array<Record<string, string | number>>> {
  if (section === "ALL") {
    const [sent, opened, clicked] = await Promise.all([
      collectRows(desktopUserId, "SENT", filters),
      collectRows(desktopUserId, "OPENED", filters),
      collectRows(desktopUserId, "CLICKED", filters),
    ]);

    const all: Array<Record<string, string | number>> = [
      ...(sent.map((row) => ({
        email: String(row.email ?? ""),
        campaign: String(row.campaign ?? ""),
        event_type: "sent",
        timestamp: String(row.sent_at ?? ""),
        link: "",
        opens_count: "",
      })) as Array<Record<string, string | number>>),
      ...(opened.map((row) => ({
        email: String(row.email ?? ""),
        campaign: String(row.campaign ?? ""),
        event_type: "opened",
        timestamp: String(row.first_opened_at ?? ""),
        link: "",
        opens_count: Number(row.opens_count ?? 0),
      })) as Array<Record<string, string | number>>),
      ...(clicked.map((row) => ({
        email: String(row.email ?? ""),
        campaign: String(row.campaign ?? ""),
        event_type: "clicked",
        timestamp: String(row.clicked_at ?? ""),
        link: String(row.link ?? ""),
        opens_count: "",
      })) as Array<Record<string, string | number>>),
    ];

    const dateRange = buildDateRange(filters);
    const bounceWhere = {
      campaign: {
        desktopUserId,
        ...(filters.campaignId ? { id: filters.campaignId } : {}),
      },
      ...(dateRange.gte || dateRange.lt
        ? {
            createdAt: {
              ...(dateRange.gte ? { gte: dateRange.gte } : {}),
              ...(dateRange.lt ? { lt: dateRange.lt } : {}),
            },
          }
        : {}),
    };

    let page = 1;
    while (true) {
      const bounceRows = await prisma.campaignFailedRecipient.findMany({
        where: bounceWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * EXPORT_BATCH,
        take: EXPORT_BATCH,
        select: {
          email: true,
          createdAt: true,
          campaign: {
            select: {
              name: true,
            },
          },
        },
      });
      if (bounceRows.length === 0) break;

      for (const row of bounceRows) {
        all.push({
          email: row.email,
          campaign: row.campaign.name,
          event_type: "bounced",
          timestamp: row.createdAt.toISOString(),
          link: "",
          opens_count: "",
        });
      }
      page += 1;
    }

    all.sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
    return all;
  }

  const rows: Array<Record<string, string | number>> = [];
  let page = 1;

  while (true) {
    const batch = await listReportSection(
      desktopUserId,
      section as ReportSection,
      filters,
      page,
      EXPORT_BATCH,
    );
    if (batch.length === 0) break;

    if (section === "SENT") {
      for (const item of batch as SentRow[]) {
        rows.push({
          email: item.email,
          campaign: item.campaign,
          sender: item.sender || "",
          sent_at: item.sentAt.toISOString(),
        });
      }
    } else if (section === "OPENED") {
      for (const item of batch as OpenedRow[]) {
        rows.push({
          email: item.email,
          campaign: item.campaign,
          first_opened_at: item.firstOpenedAt.toISOString(),
          opens_count: item.opensCount,
        });
      }
    } else {
      for (const item of batch as ClickedRow[]) {
        rows.push({
          email: item.email,
          campaign: item.campaign,
          clicked_at: item.clickedAt.toISOString(),
          link: item.link || "",
        });
      }
    }

    page += 1;
  }

  return rows;
}

async function writeCsv(rows: Array<Record<string, string | number>>, filePath: string): Promise<void> {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = String(row[h] ?? "");
          return csvEscape(csvSafe(value));
        })
        .join(","),
    ),
  ];
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
}

async function writeXlsx(rows: Array<Record<string, string | number>>, filePath: string): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await fs.writeFile(filePath, buffer);
}

export async function runReportExportJob(jobId: string): Promise<void> {
  const job = await prisma.reportExportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      desktopUserId: true,
      section: true,
      format: true,
      campaignId: true,
      dateFrom: true,
      dateTo: true,
      status: true,
    },
  });
  if (!job) return;
  if (job.status === "COMPLETED") return;

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  await prisma.reportExportJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", error: null },
  });

  try {
    const filters = normalizeFilters({
      campaignId: job.campaignId || undefined,
      dateFrom: job.dateFrom ? job.dateFrom.toISOString().slice(0, 10) : undefined,
      dateTo: job.dateTo ? job.dateTo.toISOString().slice(0, 10) : undefined,
    });
    const section = job.section as "SENT" | "OPENED" | "CLICKED" | "ALL";
    const format = job.format as "CSV" | "XLSX";

    const rows = await collectRows(job.desktopUserId, section, filters);
    const fileName = `${job.id}_${downloadFileName(section, format)}`;
    const filePath = path.join(EXPORT_DIR, fileName);

    if (format === "CSV") {
      await writeCsv(rows, filePath);
    } else {
      await writeXlsx(rows, filePath);
    }

    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        fileName,
        filePath,
        rowCount: rows.length,
      },
    });
  } catch (err) {
    console.error("[Reports Export Job] Failed:", {
      jobId,
      exportDir: EXPORT_DIR,
      message: err instanceof Error ? err.message : String(err),
    });
    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message.slice(0, 500) : "Export failed",
      },
    });
  }
}

export async function enqueueReportExport(params: {
  desktopUserId: string;
  section: "SENT" | "OPENED" | "CLICKED" | "ALL";
  format: "CSV" | "XLSX";
  filters: ReportFilters;
}): Promise<{ mode: "direct"; jobId: string } | { mode: "background"; jobId: string }> {
  let sectionCount = 0;
  if (params.section === "ALL") {
    const [sentCount, openedCount, clickedCount] = await Promise.all([
      countReportSection(params.desktopUserId, "SENT", params.filters),
      countReportSection(params.desktopUserId, "OPENED", params.filters),
      countReportSection(params.desktopUserId, "CLICKED", params.filters),
    ]);
    const dateRange = buildDateRange(params.filters);
    const bouncedCount = await prisma.campaignFailedRecipient.count({
      where: {
        campaign: {
          desktopUserId: params.desktopUserId,
          ...(params.filters.campaignId ? { id: params.filters.campaignId } : {}),
        },
        ...(dateRange.gte || dateRange.lt
          ? {
              createdAt: {
                ...(dateRange.gte ? { gte: dateRange.gte } : {}),
                ...(dateRange.lt ? { lt: dateRange.lt } : {}),
              },
            }
          : {}),
      },
    });
    sectionCount = sentCount + openedCount + clickedCount + bouncedCount;
  } else {
    sectionCount = await countReportSection(params.desktopUserId, params.section, params.filters);
  }

  const job = await prisma.reportExportJob.create({
    data: {
      desktopUserId: params.desktopUserId,
      campaignId: params.filters.campaignId || null,
      section: params.section,
      format: params.format,
      dateFrom: toDate(params.filters.dateFrom ? `${params.filters.dateFrom}T00:00:00.000Z` : null),
      dateTo: toDate(params.filters.dateTo ? `${params.filters.dateTo}T00:00:00.000Z` : null),
      status: "PENDING",
    },
    select: { id: true },
  });

  if (sectionCount <= DIRECT_EXPORT_LIMIT) {
    await runReportExportJob(job.id);
    return { mode: "direct", jobId: job.id };
  }

  if (!globalThis.__freelaReportExportWorkers) {
    globalThis.__freelaReportExportWorkers = new Set<string>();
  }
  if (!globalThis.__freelaReportExportWorkers.has(job.id)) {
    globalThis.__freelaReportExportWorkers.add(job.id);
    setTimeout(() => {
      void runReportExportJob(job.id).finally(() => {
        globalThis.__freelaReportExportWorkers?.delete(job.id);
      });
    }, 0);
  }

  return { mode: "background", jobId: job.id };
}
