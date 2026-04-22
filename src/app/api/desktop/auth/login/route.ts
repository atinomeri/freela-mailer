import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, hashToken } from "@/lib/desktop-jwt";
import { desktopLoginSchema } from "@/lib/validation";
import { errors } from "@/lib/api-response";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // ── Parse body ──────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = desktopLoginSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.issues);
    }

    const { email, password } = parsed.data;

    // ── Rate limit ──────────────────────────────────────────────
    // XFF/X-Real-IP are honored only when TRUST_PROXY_HEADERS=true.
    const ip = getClientIpFromHeaders(req.headers);

    const ipLimit = await checkRateLimit({
      scope: "desktop:login:ip",
      key: ip,
      limit: 10,
      windowSeconds: 900,
    });
    if (!ipLimit.allowed) {
      return errors.rateLimited(ipLimit.retryAfterSeconds);
    }

    const emailLimit = await checkRateLimit({
      scope: "desktop:login:email",
      key: email,
      limit: 5,
      windowSeconds: 900,
    });
    if (!emailLimit.allowed) {
      return errors.rateLimited(emailLimit.retryAfterSeconds);
    }

    // ── Find user in desktop_users & verify password ────────────
    const user = await prisma.desktopUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        balance: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return errors.unauthorized("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return errors.unauthorized("Invalid email or password");
    }

    // ── Issue tokens ────────────────────────────────────────────
    const accessToken = signAccessToken(user.id);
    const { token: refreshToken, jti } = signRefreshToken(user.id);

    await prisma.desktopRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(jti),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error("[Desktop Login] Error:", err);
    return errors.serverError();
  }
}
