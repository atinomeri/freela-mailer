import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
    },
    campaignReport: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/desktop-auth', () => ({
  requireDesktopAuth: vi.fn(),
}));

function buildRequest(campaignId: string) {
  return new Request('http://localhost/api/tracking/report', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId,
      hwid: 'user@example.com',
      total: 100,
      sent: 95,
      failed: 5,
      started_at: 1712188800,
      finished_at: 1712189100,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/tracking/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: 'desktop-user-1' },
    });
  });

  it('falls back when CampaignReport.desktopUserId column is missing in DB', async () => {
    (prisma.campaign.findUnique as any).mockResolvedValueOnce({
      desktopUserId: 'desktop-user-1',
    });
    (prisma.campaignReport.findUnique as any).mockRejectedValueOnce({
      code: 'P2022',
      message: 'The column `CampaignReport.desktopUserId` does not exist in the current database.',
    });

    (prisma.campaignReport.upsert as any)
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'The column `CampaignReport.desktopUserId` does not exist in the current database.',
      })
      .mockResolvedValueOnce({ id: 'report-1' });

    const response = await POST(buildRequest('cid-legacy-schema') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(prisma.campaignReport.upsert).toHaveBeenCalledTimes(2);

    const firstCall = (prisma.campaignReport.upsert as any).mock.calls[0][0];
    const secondCall = (prisma.campaignReport.upsert as any).mock.calls[1][0];

    expect(firstCall.create.desktopUserId).toBe('desktop-user-1');
    expect(firstCall.update.desktopUserId).toBe('desktop-user-1');
    expect(secondCall.create.desktopUserId).toBeUndefined();
    expect(secondCall.update.desktopUserId).toBeUndefined();
  });

  it('succeeds when posting a report for an own campaign', async () => {
    (prisma.campaign.findUnique as any).mockResolvedValueOnce({
      desktopUserId: 'desktop-user-1',
    });
    (prisma.campaignReport.findUnique as any).mockResolvedValueOnce(null);
    (prisma.campaignReport.upsert as any).mockResolvedValueOnce({ id: 'report-1' });

    const response = await POST(buildRequest('cid-own') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(prisma.campaignReport.upsert).toHaveBeenCalledTimes(1);
    const call = (prisma.campaignReport.upsert as any).mock.calls[0][0];
    expect(call.create.desktopUserId).toBe('desktop-user-1');
    expect(call.update.desktopUserId).toBe('desktop-user-1');
  });

  it("returns 403 when posting for another user's campaign", async () => {
    (prisma.campaign.findUnique as any).mockResolvedValueOnce({
      desktopUserId: 'desktop-user-2',
    });

    const response = await POST(buildRequest('cid-other') as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(prisma.campaignReport.findUnique).not.toHaveBeenCalled();
    expect(prisma.campaignReport.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the campaign does not exist', async () => {
    (prisma.campaign.findUnique as any).mockResolvedValueOnce(null);

    const response = await POST(buildRequest('cid-missing') as any);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(prisma.campaignReport.findUnique).not.toHaveBeenCalled();
    expect(prisma.campaignReport.upsert).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing report owned by another user", async () => {
    // Campaign ownership lookup currently returns the caller (e.g. ownership
    // was just transferred), but a stale CampaignReport row still belongs to
    // the previous owner. Defense-in-depth: refuse the upsert.
    (prisma.campaign.findUnique as any).mockResolvedValueOnce({
      desktopUserId: 'desktop-user-1',
    });
    (prisma.campaignReport.findUnique as any).mockResolvedValueOnce({
      desktopUserId: 'desktop-user-2',
    });

    const response = await POST(buildRequest('cid-stale-report') as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(prisma.campaignReport.upsert).not.toHaveBeenCalled();
  });
});
