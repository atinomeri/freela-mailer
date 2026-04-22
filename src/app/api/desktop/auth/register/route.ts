import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, hashToken } from "@/lib/desktop-jwt";
import {
  desktopRegisterIndividualSchema,
  desktopRegisterCompanySchema,
} from "@/lib/validation";
import { errors } from "@/lib/api-response";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // ── Parse body ──────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    // ── Validate by userType ────────────────────────────────────
    const userType = body.userType;
    if (!userType || !["individual", "company"].includes(userType)) {
      return NextResponse.json(
        { error: "Validation error", details: ["userType must be 'individual' or 'company'"] },
        { status: 400 }
      );
    }

    const schema =
      userType === "individual"
        ? desktopRegisterIndividualSchema
        : desktopRegisterCompanySchema;

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`),
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // ── Rate limit ──────────────────────────────────────────────
    // XFF/X-Real-IP are honored only when TRUST_PROXY_HEADERS=true.
    const ip = getClientIpFromHeaders(req.headers);

    const ipLimit = await checkRateLimit({
      scope: "desktop:register:ip",
      key: ip,
      limit: 5,
      windowSeconds: 900,
    });
    if (!ipLimit.allowed) {
      return errors.rateLimited(ipLimit.retryAfterSeconds);
    }

    // ── Check email uniqueness ──────────────────────────────────
    const existing = await prisma.desktopUser.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // ── Check unique constraints ────────────────────────────────
    if (userType === "individual") {
      const d = data as typeof desktopRegisterIndividualSchema._type;
      const existingPn = await prisma.desktopUser.findUnique({
        where: { personalNumber: d.personalNumber },
        select: { id: true },
      });
      if (existingPn) {
        return NextResponse.json(
          { error: "User with this personal number already exists" },
          { status: 409 }
        );
      }
    } else {
      const d = data as typeof desktopRegisterCompanySchema._type;
      const existingCo = await prisma.desktopUser.findUnique({
        where: { companyIdCode: d.companyIdCode },
        select: { id: true },
      });
      if (existingCo) {
        return NextResponse.json(
          { error: "Company with this ID code already exists" },
          { status: 409 }
        );
      }
    }

    // ── Create user ─────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(data.password, 10);

    const createData: Parameters<typeof prisma.desktopUser.create>[0]["data"] = {
      userType: userType === "individual" ? "INDIVIDUAL" : "COMPANY",
      phone: data.phone,
      email: data.email,
      passwordHash,
      balance: 0,
    };

    if (userType === "individual") {
      const d = data as typeof desktopRegisterIndividualSchema._type;
      createData.firstName = d.firstName;
      createData.lastName = d.lastName;
      createData.personalNumber = d.personalNumber;
      createData.birthDate = new Date(d.birthDate);
    } else {
      const d = data as typeof desktopRegisterCompanySchema._type;
      createData.companyName = d.companyName;
      createData.companyIdCode = d.companyIdCode;
    }

    const user = await prisma.desktopUser.create({
      data: createData,
      select: { id: true, email: true, balance: true },
    });

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

    return NextResponse.json(
      {
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id,
          email: user.email,
          balance: user.balance,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Desktop Register] Error:", err);
    return errors.serverError();
  }
}
