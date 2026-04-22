import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";

function isMissingCampaignDesktopUserColumn(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    message?: string;
    meta?: { column?: unknown };
  };
  if (candidate?.code !== "P2022") return false;
  const details = `${candidate.message ?? ""} ${String(candidate.meta?.column ?? "")}`.toLowerCase();
  return details.includes("desktopuserid");
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth: require desktop JWT ──
    const auth = await requireDesktopAuth(req);
    if ('error' in auth) {
      return auth.error;
    }
    const desktopUserId = auth.user.id;

    const body = await req.json();
    const {
      campaign_id,
      hwid,
      license_key,
      total,
      sent,
      failed,
      started_at,
      finished_at,
      events
    } = body;

    if (!campaign_id || !hwid) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: campaign_id or hwid" },
        { status: 400 }
      );
    }

    // ── Ownership check: if report already exists, verify ownership ──
    let existing: { desktopUserId: string | null } | null = null;
    try {
      existing = await prisma.campaignReport.findUnique({
        where: { campaignId: campaign_id },
        select: { desktopUserId: true },
      });
    } catch (error) {
      if (!isMissingCampaignDesktopUserColumn(error)) {
        throw error;
      }
      console.warn("[Tracking Report] Legacy schema detected: CampaignReport.desktopUserId is missing.");
    }

    if (existing && existing.desktopUserId && existing.desktopUserId !== desktopUserId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: campaign belongs to another user" },
        { status: 403 }
      );
    }

    // Parse unix timestamps to Date objects if they exist
    let startedAtDate = new Date();
    let finishedAtDate = new Date();

    if (started_at) {
      startedAtDate = new Date(started_at * 1000);
    }

    if (finished_at) {
      finishedAtDate = new Date(finished_at * 1000);
    }

    // Save report to database with user ownership
    try {
      await prisma.campaignReport.upsert({
        where: {
          campaignId: campaign_id,
        },
        update: {
          hwid,
          licenseKey: license_key || null,
          total: total || 0,
          sent: sent || 0,
          failed: failed || 0,
          startedAt: startedAtDate,
          finishedAt: finishedAtDate,
          events: events || null,
          desktopUserId: desktopUserId,
        },
        create: {
          campaignId: campaign_id,
          desktopUserId: desktopUserId,
          hwid,
          licenseKey: license_key || null,
          total: total || 0,
          sent: sent || 0,
          failed: failed || 0,
          startedAt: startedAtDate,
          finishedAt: finishedAtDate,
          events: events || null,
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isMissingCampaignDesktopUserColumn(error)) {
        throw error;
      }

      console.warn("[Tracking Report] Retrying upsert without desktopUserId due to legacy schema.");
      await prisma.campaignReport.upsert({
        where: {
          campaignId: campaign_id,
        },
        update: {
          hwid,
          licenseKey: license_key || null,
          total: total || 0,
          sent: sent || 0,
          failed: failed || 0,
          startedAt: startedAtDate,
          finishedAt: finishedAtDate,
          events: events || null,
        },
        create: {
          campaignId: campaign_id,
          hwid,
          licenseKey: license_key || null,
          total: total || 0,
          sent: sent || 0,
          failed: failed || 0,
          startedAt: startedAtDate,
          finishedAt: finishedAtDate,
          events: events || null,
        },
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Tracking Report] Error saving report:", e);
    return NextResponse.json(
      { ok: false, error: "Invalid request body or database error" },
      { status: 400 }
    );
  }
}
