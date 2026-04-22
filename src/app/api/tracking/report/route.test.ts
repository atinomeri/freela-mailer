import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaignReport: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/desktop-auth', () => ({
  requireDesktopAuth: vi.fn(),
}));

describe('POST /api/tracking/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: 'desktop-user-1' },
    });
  });

  it('falls back when CampaignReport.desktopUserId column is missing in DB', async () => {
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

    const request = new Request('http://localhost/api/tracking/report', {
      method: 'POST',
      body: JSON.stringify({
        campaign_id: 'cid-legacy-schema',
        hwid: 'user@example.com',
        total: 100,
        sent: 95,
        failed: 5,
        started_at: 1712188800,
        finished_at: 1712189100,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request as any);
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
});
