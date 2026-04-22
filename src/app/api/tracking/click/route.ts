import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { recordClickForRecipient } from '@/lib/report-activity';
import { getClientIpFromHeaders } from '@/lib/rate-limit';

// Fallback-redirect target used when the click payload is malformed.
// Resolution order (narrowest/canonical → legacy):
//   1. MAILER_PUBLIC_URL  — the mailer's forever-host, baked into emails.
//   2. NEXT_PUBLIC_APP_URL / NEXTAUTH_URL — legacy fallback; in the monolith
//      era these pointed at freela.ge and therefore served the mailer via
//      the compat proxy.
// The literal 'https://freela.ge' fallback was removed so mailer-owned code
// no longer hard-codes freela's domain (G.10 in the pre-Phase-4 audit).
const getBaseUrl = (): string => {
  const url =
    process.env.MAILER_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    '';
  return url.trim().replace(/\/+$/, '');
};

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip.trim()).digest('hex');
}

// Safe fallback used when we cannot resolve a target URL. Redirects to
// BASE_URL if configured; otherwise returns 204 No Content so a malformed
// or unconfigured request does not throw.
function fallbackResponse(baseUrl: string): NextResponse {
  if (baseUrl) return NextResponse.redirect(baseUrl, 302);
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const BASE_URL = getBaseUrl();

  try {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get('url');
    const encodedEmail = searchParams.get('email');
    const campaignId = searchParams.get('cid') || null;

    if (!encodedUrl || !encodedEmail) {
      return fallbackResponse(BASE_URL);
    }

    let targetUrl: string;
    let emailHash: string;

    try {
      targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
      const email = Buffer.from(encodedEmail, 'base64').toString('utf-8');
      emailHash = hashEmail(email);
    } catch {
      return fallbackResponse(BASE_URL);
    }

    // Determine final redirect URL
    let finalUrl: string;

    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      try {
        new URL(targetUrl);
        finalUrl = targetUrl;
      } catch {
        return fallbackResponse(BASE_URL);
      }
    } else if (targetUrl.startsWith('/') && BASE_URL) {
      finalUrl = `${BASE_URL}${targetUrl}`;
    } else {
      return fallbackResponse(BASE_URL);
    }

    // Proxy headers honored only when TRUST_PROXY_HEADERS=true; else "unknown".
    const ipAddress = getClientIpFromHeaders(request.headers);
    const ipHash = ipAddress && ipAddress !== 'unknown' ? hashIp(ipAddress) : undefined;

    // Store only hashed data — no plaintext PII in the database
    try {
      await prisma.emailTrackingEvent.create({
        data: {
          campaignId,
          emailHash,
          eventType: 'CLICK',
          url: finalUrl,
          ipAddress: ipHash,
        },
      });
      if (campaignId) {
        await recordClickForRecipient({
          campaignId,
          emailHash,
          url: finalUrl,
        });
      }
    } catch (error) {
      console.error('[Click Tracking] Database error:', error);
    }

    return NextResponse.redirect(finalUrl, 302);
  } catch (error) {
    console.error('[Click Tracking] Unexpected error:', error);
    return fallbackResponse(BASE_URL);
  }
}
