import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { key, hwid } = await request.json();

    if (!key || !hwid) {
      return NextResponse.json({ valid: false, error: "Missing key or hwid" }, { status: 400 });
    }

    const license = await prisma.licenseKey.findUnique({ where: { key } });

    // Проверки на валидность
    if (!license) {
      return NextResponse.json({ valid: false, error: "Invalid license key" }, { status: 200 });
    }
    if (!license.isActive) {
      return NextResponse.json({ valid: false, error: "License is blocked" }, { status: 200 });
    }
    // Если ключ уже привязан к другому железу
    if (license.hwid && license.hwid !== hwid) {
      return NextResponse.json({ valid: false, error: "License already used on another machine" }, { status: 200 });
    }
    // Если подписка истекла
    if (license.expiresAt && license.expiresAt < new Date()) {
        return NextResponse.json({ valid: false, error: "License expired" }, { status: 200 });
    }

    // Привязываем HWID (если он еще не привязан)
    if (!license.hwid) {
      await prisma.licenseKey.update({
        where: { key },
        data: { hwid: hwid }
      });
    }

    // Python ожидает expires_at в Unix timestamp (секунды)
    const expiresAtUnix = license.expiresAt ? Math.floor(license.expiresAt.getTime() / 1000) : 0;

    // Успешная активация
    return NextResponse.json({ 
      valid: true, 
      tier: license.tier.toLowerCase(), // "pro" или "enterprise"
      expires_at: expiresAtUnix
      // max_contacts и features подтянутся из Python (TIER_LIMITS), поэтому их можно не отправлять
    });

  } catch (error) {
    console.error("Activation API error:", error);
    return NextResponse.json({ valid: false, error: "Internal server error" }, { status: 500 });
  }
}