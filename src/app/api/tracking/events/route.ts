import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';

/**
 * GET /api/tracking/events?campaign_id=X&type=OPEN|CLICK
 *
 * Returns distinct email hashes for a campaign filtered by event type.
 * Desktop app can match these against SHA-256 hashes of loaded contacts
 * to identify which emails opened/clicked.
 *
 * Auth: Desktop JWT only. DesktopUser.isAdmin bypasses the ownership
 * check. The legacy NextAuth admin branch was removed in Week 2 of the
 * blocker remediation.
 */
export async function GET(request: Request) {
  try {
    const desktopAuth = await requireDesktopAuth(request);
    if (desktopAuth.error) return desktopAuth.error;

    const desktopUserId = desktopAuth.user.id;
    const desktopUserEmail = desktopAuth.user.email.toLowerCase();
    const isAdmin = desktopAuth.user.isAdmin === true;

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaign_id');
    const eventType = searchParams.get('type')?.toUpperCase();

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }
    if (!eventType || !['OPEN', 'CLICK'].includes(eventType)) {
      return NextResponse.json({ error: 'type must be OPEN or CLICK' }, { status: 400 });
    }

    // Ownership check — admins bypass it, non-admins must own the campaign.
    if (!isAdmin) {
      let report;
      try {
        report = await prisma.campaignReport.findUnique({
          where: { campaignId },
          select: { desktopUserId: true, hwid: true },
        });
      } catch {
        report = await prisma.campaignReport.findUnique({
          where: { campaignId },
          select: { hwid: true },
        });
      }

      if (!report) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      const ownedByUser =
        ('desktopUserId' in report && report.desktopUserId === desktopUserId) ||
        (report.hwid.toLowerCase() === desktopUserEmail);

      if (!ownedByUser) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const events = await prisma.emailTrackingEvent.findMany({
      where: { campaignId, eventType },
      distinct: ['emailHash'],
      select: { emailHash: true },
    });

    const hashes = events.map((e) => e.emailHash);

    return NextResponse.json({ campaign_id: campaignId, type: eventType, hashes });
  } catch (error) {
    console.error('[Tracking Events] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracking events' },
      { status: 500 },
    );
  }
}
