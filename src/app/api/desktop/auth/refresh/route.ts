import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  hashToken,
} from "@/lib/desktop-jwt";
import { desktopRefreshSchema } from "@/lib/validation";
import { errors } from "@/lib/api-response";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // ── Parse body ──────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = desktopRefreshSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { refreshToken: refreshTokenValue } = parsed.data;

    // ── Rate limit ──────────────────────────────────────────────
    // XFF/X-Real-IP are honored only when TRUST_PROXY_HEADERS=true.
    const ip = getClientIpFromHeaders(req.headers);

    const ipLimit = await checkRateLimit({
      scope: "desktop:refresh:ip",
      key: ip,
      limit: 30,
      windowSeconds: 900,
    });
    if (!ipLimit.allowed) {
      return errors.rateLimited(ipLimit.retryAfterSeconds);
    }

    // ── Verify refresh token JWT ────────────────────────────────
    let payload;
    try {
      payload = verifyRefreshToken(refreshTokenValue);
    } catch {
      return errors.unauthorized("Invalid or expired refresh token");
    }

    // ── Find token in desktop_refresh_tokens ────────────────────
    const tokenHash = hashToken(payload.jti);
    const stored = await prisma.desktopRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return errors.unauthorized("Invalid or expired refresh token");
    }

    // ── Check user exists in desktop_users ──────────────────────
    const user = await prisma.desktopUser.findUnique({
      where: { id: stored.userId },
      select: { id: true },
    });

    if (!user) {
      return errors.unauthorized("Account not available");
    }

    // ── Rotate: revoke old, issue new ───────────────────────────
    const newAccessToken = signAccessToken(user.id);
    const { token: newRefreshToken, jti: newJti } = signRefreshToken(user.id);

    await prisma.$transaction([
      prisma.desktopRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      prisma.desktopRefreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(newJti),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    });
  } catch (err) {
    console.error("[Desktop Refresh] Error:", err);
    return errors.serverError();
  }
}
