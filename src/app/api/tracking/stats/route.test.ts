import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    campaignReport: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    emailTrackingEvent: {
      findMany: vi.fn(),
    },
    unsubscribedEmail: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/desktop-auth', () => ({
  requireDesktopAuth: vi.fn(),
}));

describe('GET /api/tracking/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: 'desktop-user-1', email: 'user@example.com', isAdmin: false },
    });
    (prisma.emailTrackingEvent.findMany as any).mockResolvedValue([]);
    (prisma.unsubscribedEmail.count as any).mockResolvedValue(0);
    (prisma.campaign.findUnique as any).mockResolvedValue(null);
    (prisma.campaign.findMany as any).mockResolvedValue([]);
    (prisma.campaign.aggregate as any).mockResolvedValue({
      _sum: { sentCount: 0, failedCount: 0 },
    });
  });

  it('returns campaign stats for owned campaign', async () => {
    const startedAt = new Date('2026-04-04T00:00:00.000Z');
    (prisma.campaignReport.findUnique as any).mockResolvedValue({
      desktopUserId: 'desktop-user-1',
      hwid: 'user@example.com',
      sent: 100,
      failed: 5,
      startedAt,
    });

    (prisma.emailTrackingEvent.findMany as any)
      .mockResolvedValueOnce([{ emailHash: 'a' }, { emailHash: 'b' }]) // OPEN distinct
      .mockResolvedValueOnce([{ emailHash: 'a' }]); // CLICK distinct

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=cid-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_sent).toBe(100);
    expect(body.bounced).toBe(5);
    expect(body.opened).toBe(2);
    expect(body.clicked).toBe(1);
    expect(body.open_rate).toBe(2);
    expect(body.click_rate).toBe(1);
    expect(prisma.unsubscribedEmail.count).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: startedAt },
        desktopUserId: 'desktop-user-1',
        source: { not: 'bounce' },
      },
    });
  });

  it('returns 404 when desktop user requests missing campaign report', async () => {
    (prisma.campaignReport.findUnique as any).mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=missing-cid'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Campaign report not found');
  });

  it('returns 403 for campaign owned by another desktop user', async () => {
    (prisma.campaignReport.findUnique as any).mockResolvedValue({
      desktopUserId: 'desktop-user-2',
      hwid: 'other@example.com',
      sent: 10,
      failed: 0,
      startedAt: new Date(),
    });

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=foreign-cid'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('allows legacy campaign owned by matching hwid email', async () => {
    (prisma.campaignReport.findUnique as any).mockResolvedValue({
      desktopUserId: null,
      hwid: 'user@example.com',
      sent: 40,
      failed: 2,
      startedAt: new Date('2026-04-04T00:00:00.000Z'),
    });

    (prisma.emailTrackingEvent.findMany as any)
      .mockResolvedValueOnce([{ emailHash: 'a' }])
      .mockResolvedValueOnce([]);

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=legacy-cid'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_sent).toBe(40);
    expect(body.opened).toBe(1);
  });

  it('falls back when CampaignReport.desktopUserId column is missing in DB', async () => {
    const startedAt = new Date('2026-04-05T00:00:00.000Z');
    (prisma.campaignReport.findUnique as any)
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'The column `CampaignReport.desktopUserId` does not exist in the current database.',
      })
      .mockResolvedValueOnce({
        hwid: 'user@example.com',
        sent: 25,
        failed: 1,
        startedAt,
      });

    (prisma.emailTrackingEvent.findMany as any)
      .mockResolvedValueOnce([{ emailHash: 'aa' }])
      .mockResolvedValueOnce([]);

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=legacy-schema-cid'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_sent).toBe(25);
    expect(body.bounced).toBe(1);
    expect(body.opened).toBe(1);
    expect(body.clicked).toBe(0);
    expect(prisma.campaignReport.findUnique).toHaveBeenCalledTimes(2);
  });

  it('falls back to Campaign table when campaign report is missing', async () => {
    const startedAt = new Date('2026-04-06T00:00:00.000Z');
    (prisma.campaignReport.findUnique as any).mockResolvedValue(null);
    (prisma.campaign.findUnique as any).mockResolvedValue({
      desktopUserId: 'desktop-user-1',
      sentCount: 12,
      failedCount: 1,
      startedAt,
      createdAt: startedAt,
    });
    (prisma.emailTrackingEvent.findMany as any)
      .mockResolvedValueOnce([{ emailHash: 'x' }])
      .mockResolvedValueOnce([]);

    const response = await GET(new Request('http://localhost/api/tracking/stats?campaign_id=cid-fallback'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_sent).toBe(12);
    expect(body.bounced).toBe(1);
    expect(body.opened).toBe(1);
  });
});
