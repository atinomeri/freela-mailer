import { NextResponse } from "next/server";
import { requireDesktopAuth } from "@/lib/desktop-auth";

export async function GET(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;

  return NextResponse.json({
    email: auth.user.email,
    balance: auth.user.balance,
    isAdmin: auth.user.isAdmin,
  });
}
