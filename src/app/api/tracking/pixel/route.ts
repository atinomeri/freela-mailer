import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { recordOpenForRecipient } from '@/lib/report-activity';
import { getClientIpFromHeaders } from '@/lib/rate-limit';

// 1x1 transparent GIF
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const GIF_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip.trim()).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const encodedData = searchParams.get('data');
    const campaignId = searchParams.get('cid') || null;

    if (!encodedData) {
      return new NextResponse(TRANSPARENT_GIF_BUFFER, {
        status: 200,
        headers: GIF_HEADERS,
      });
    }

    // Decode email and immediately hash it — never store plaintext
    let emailHash: string;
    try {
      const email = Buffer.from(encodedData, 'base64').toString('utf-8');
      emailHash = hashEmail(email);
    } catch {
      return new NextResponse(TRANSPARENT_GIF_BUFFER, {
        status: 200,
        headers: GIF_HEADERS,
      });
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
          eventType: 'OPEN',
          ipAddress: ipHash,
        },
      });
      if (campaignId) {
        await recordOpenForRecipient({ campaignId, emailHash });
      }
    } catch (error) {
      console.error('[Pixel Tracking] Database error:', error);
    }

    return new NextResponse(TRANSPARENT_GIF_BUFFER, {
      status: 200,
      headers: {
        ...GIF_HEADERS,
        'Content-Length': TRANSPARENT_GIF_BUFFER.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Pixel Tracking] Unexpected error:', error);
    return new NextResponse(TRANSPARENT_GIF_BUFFER, {
      status: 200,
      headers: GIF_HEADERS,
    });
  }
}
