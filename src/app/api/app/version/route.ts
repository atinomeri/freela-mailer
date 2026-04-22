import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Public API endpoint for desktop app version check.
 * Reads the latest active release from the AppRelease table.
 * No authentication required - accessible to all app instances.
 */
export async function GET() {
  try {
    const release = await prisma.appRelease.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!release) {
      return NextResponse.json({ version: '0.0.0', url: '', release_notes: '' });
    }

    return NextResponse.json({
      version: release.version,
      url: release.downloadUrl,
      release_notes: release.releaseNotes || '',
    });
  } catch (error) {
    console.error('[API app/version] Error:', error);
    return NextResponse.json({ version: '0.0.0', url: '', release_notes: '' });
  }
}
