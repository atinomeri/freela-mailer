/**
 * Bearer-token auth middleware for desktop app API routes.
 * Completely separate from NextAuth — uses DesktopUser table.
 */

import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/desktop-jwt";
import { errors } from "@/lib/api-response";
import type { NextResponse } from "next/server";

export interface DesktopUser {
  id: string;
  email: string;
  balance: number;
  userType: "INDIVIDUAL" | "COMPANY";
  isAdmin: boolean;
}

type AuthResult =
  | { user: DesktopUser; error?: never }
  | { user?: never; error: NextResponse };

/**
 * Extracts Bearer token, verifies JWT, loads DesktopUser from DB.
 * Returns { user } on success or { error: NextResponse } on failure.
 *
 * NO dependency on NextAuth, getServerSession, or site User table.
 */
export async function requireDesktopAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: errors.unauthorized("Missing or invalid Authorization header") };
  }

  const token = authHeader.slice(7);

  let userId: string;
  try {
    const payload = verifyAccessToken(token);
    userId = payload.sub;
  } catch {
    return { error: errors.unauthorized("Invalid or expired access token") };
  }

  const user = await prisma.desktopUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, balance: true, userType: true, isAdmin: true },
  });

  if (!user) {
    return { error: errors.unauthorized("User not found") };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      balance: user.balance,
      userType: user.userType,
      isAdmin: user.isAdmin,
    },
  };
}
