/**
 * Mailer admin auth — gates /api/desktop/admin/* endpoints.
 *
 * Builds on `requireDesktopAuth` (Bearer JWT + DesktopUser) and additionally
 * asserts `DesktopUser.isAdmin === true`. Completely decoupled from NextAuth
 * and the freela `User` table.
 */

import { prisma } from "@/lib/prisma";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { errors } from "@/lib/api-response";
import type { NextResponse } from "next/server";

export interface DesktopAdminUser {
  id: string;
  email: string;
  balance: number;
  userType: "INDIVIDUAL" | "COMPANY";
  isAdmin: true;
}

type AdminAuthResult =
  | { user: DesktopAdminUser; error?: never }
  | { user?: never; error: NextResponse };

export async function requireDesktopAdmin(req: Request): Promise<AdminAuthResult> {
  const base = await requireDesktopAuth(req);
  if (base.error) return { error: base.error };

  const record = await prisma.desktopUser.findUnique({
    where: { id: base.user.id },
    select: { isAdmin: true },
  });

  if (!record?.isAdmin) {
    return { error: errors.forbidden("Admin privileges required") };
  }

  return {
    user: {
      id: base.user.id,
      email: base.user.email,
      balance: base.user.balance,
      userType: base.user.userType,
      isAdmin: true,
    },
  };
}
