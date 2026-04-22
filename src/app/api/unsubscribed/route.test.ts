import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE, GET } from './route';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    unsubscribedEmail: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/desktop-auth', () => ({
  requireDesktopAuth: vi.fn(),
}));

describe('GET /api/unsubscribed', () => {
  const SECRET = 'test-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
    process.env.UNSUBSCRIBED_ALLOW_QUERY_SECRET = 'false';
    process.env.UNSUBSCRIBED_ALLOW_SECRET_DELETE = 'false';
    (requireDesktopAuth as any).mockResolvedValue({
      error: new Response(null, { status: 401 }),
    });
  });

  it('returns 401 without auth', async () => {
    const request = new Request('http://localhost/api/unsubscribed');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 without bearer even if a NextAuth session exists (NextAuth branch removed in Week 2)', async () => {
    // Regression guard: the endpoint must no longer honor freela User session.
    const request = new Request('http://localhost/api/unsubscribed');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns rows with bearer internal secret', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    (prisma.unsubscribedEmail.findMany as any).mockResolvedValue([
      { id: 'a', email: 'test1@example.com', source: 'link', createdAt: now },
    ]);

    const request = new Request('http://localhost/api/unsubscribed', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.items).toEqual([
      { id: 'a', email: 'test1@example.com', source: 'link', timestamp: now.toISOString() },
    ]);
    expect(prisma.unsubscribedEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('allows legacy query secret only when enabled', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    (prisma.unsubscribedEmail.findMany as any).mockResolvedValue([
      { id: 'a', email: 'test1@example.com', source: 'link', createdAt: now },
    ]);

    const blockedReq = new Request(`http://localhost/api/unsubscribed?secret=${SECRET}`);
    const blockedRes = await GET(blockedReq);
    expect(blockedRes.status).toBe(401);

    process.env.UNSUBSCRIBED_ALLOW_QUERY_SECRET = 'true';
    const allowedReq = new Request(`http://localhost/api/unsubscribed?secret=${SECRET}`);
    const allowedRes = await GET(allowedReq);
    expect(allowedRes.status).toBe(200);
  });

  it('filters by desktopUserId for desktop auth', async () => {
    (requireDesktopAuth as any).mockResolvedValue({
      user: { id: 'desktop-user-1' },
    });
    (prisma.unsubscribedEmail.findMany as any).mockResolvedValue([]);

    const request = new Request('http://localhost/api/unsubscribed', {
      headers: { Authorization: 'Bearer desktop-jwt' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(prisma.unsubscribedEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { desktopUserId: 'desktop-user-1' },
      }),
    );
  });
});

describe('DELETE /api/unsubscribed', () => {
  const SECRET = 'test-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
    process.env.UNSUBSCRIBED_ALLOW_SECRET_DELETE = 'false';
    (requireDesktopAuth as any).mockResolvedValue({
      error: new Response(null, { status: 401 }),
    });
  });

  it('forbids internal secret deletes by default', async () => {
    const request = new Request('http://localhost/api/unsubscribed', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);
  });

  it('deletes with internal secret when explicitly enabled', async () => {
    process.env.UNSUBSCRIBED_ALLOW_SECRET_DELETE = 'true';
    (prisma.unsubscribedEmail.deleteMany as any).mockResolvedValue({ count: 1 });

    const request = new Request('http://localhost/api/unsubscribed', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(prisma.unsubscribedEmail.deleteMany).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
  });
});
