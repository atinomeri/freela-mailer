import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireDesktopAuth } from '@/lib/desktop-auth';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Mailer-owned unsubscribe sync endpoint.
 *
 * Auth (mailer-scoped only — no NextAuth, no freela User session):
 *   - Desktop JWT (Bearer) — tenant-scoped read/delete for the signed-in DesktopUser.
 *   - INTERNAL_API_SECRET (Bearer OR ?secret= when UNSUBSCRIBED_ALLOW_QUERY_SECRET=true)
 *     — cross-tenant read; cross-tenant DELETE only when UNSUBSCRIBED_ALLOW_SECRET_DELETE=true.
 *
 * Admin UI for cross-tenant operations now lives in /mailer/admin/unsubscribed
 * (gated by DesktopUser.isAdmin). The legacy NextAuth admin branch was removed
 * in Week 2 of the blocker remediation.
 */

interface AuthResult {
  authorized: boolean;
  scope?: 'desktop' | 'internal';
  desktopUserId?: string;
}

function envEnabled(name: string): boolean {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function safeSecretMatch(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isInternalSecret(token: string, expectedSecret?: string): boolean {
  if (!expectedSecret || !token) return false;
  return safeSecretMatch(token, expectedSecret);
}

async function checkAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const allowQuerySecret = envEnabled('UNSUBSCRIBED_ALLOW_QUERY_SECRET');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    const desktopAuth = await requireDesktopAuth(request);
    if (desktopAuth.user) {
      return { authorized: true, scope: 'desktop', desktopUserId: desktopAuth.user.id };
    }

    if (isInternalSecret(token, expectedSecret)) {
      return { authorized: true, scope: 'internal' };
    }
  }

  if (allowQuerySecret) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret')?.trim() ?? '';
    if (isInternalSecret(secret, expectedSecret)) {
      return { authorized: true, scope: 'internal' };
    }
  }

  return { authorized: false };
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const where = auth.scope === 'desktop' ? { desktopUserId: auth.desktopUserId } : {};

    const unsubscribed = await prisma.unsubscribedEmail.findMany({
      where,
      select: {
        id: true,
        email: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      count: unsubscribed.length,
      items: unsubscribed.map((u) => ({
        id: u.id,
        email: u.email,
        source: u.source,
        timestamp: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[API Unsubscribed] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await checkAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.scope === 'internal' && !envEnabled('UNSUBSCRIBED_ALLOW_SECRET_DELETE')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { id, email } = body as { id?: string; email?: string };

    const ownershipFilter = auth.scope === 'desktop' ? { desktopUserId: auth.desktopUserId } : {};

    if (id) {
      const record = await prisma.unsubscribedEmail.findFirst({
        where: { id, ...ownershipFilter },
      });
      if (!record) {
        return NextResponse.json({ error: 'Not found or not owned' }, { status: 404 });
      }
      await prisma.unsubscribedEmail.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: id });
    }

    if (email) {
      const result = await prisma.unsubscribedEmail.deleteMany({
        where: { email, ...ownershipFilter },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Not found or not owned' }, { status: 404 });
      }
      return NextResponse.json({ success: true, deleted: email });
    }

    return NextResponse.json({ error: 'Provide id or email' }, { status: 400 });
  } catch (error) {
    console.error('[API Unsubscribed DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
