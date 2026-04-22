/**
 * Mailer-admin unsubscribed management — cross-tenant list + delete.
 * Replaces the NextAuth-admin branch inside /api/unsubscribed.
 * Gated by Desktop JWT + DesktopUser.isAdmin.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const unsubscribed = await prisma.unsubscribedEmail.findMany({
      select: {
        id: true,
        email: true,
        source: true,
        createdAt: true,
        desktopUserId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      count: unsubscribed.length,
      items: unsubscribed.map((u) => ({
        id: u.id,
        email: u.email,
        source: u.source,
        desktopUserId: u.desktopUserId,
        timestamp: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[Mailer Admin Unsubscribed GET] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { id, email } = body as { id?: string; email?: string };

    if (id) {
      const record = await prisma.unsubscribedEmail.findUnique({ where: { id } });
      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await prisma.unsubscribedEmail.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: id });
    }

    if (email) {
      const result = await prisma.unsubscribedEmail.deleteMany({ where: { email } });
      if (result.count === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, deleted: email, count: result.count });
    }

    return NextResponse.json({ error: "Provide id or email" }, { status: 400 });
  } catch (err) {
    console.error("[Mailer Admin Unsubscribed DELETE] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
