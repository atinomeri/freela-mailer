import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { key, hwid } = await request.json();

    if (!key || !hwid) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const license = await prisma.licenseKey.findUnique({ where: { key } });

    // Жесткие проверки для фоновой валидации
    if (!license || !license.isActive || license.hwid !== hwid) {
      return NextResponse.json({ valid: false });
    }

    if (license.expiresAt && license.expiresAt < new Date()) {
        return NextResponse.json({ valid: false });
    }

    const expiresAtUnix = license.expiresAt ? Math.floor(license.expiresAt.getTime() / 1000) : 0;

    return NextResponse.json({ 
      valid: true, 
      tier: license.tier.toLowerCase(),
      expires_at: expiresAtUnix
    });

  } catch (error) {
    console.error("Validation API error:", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}