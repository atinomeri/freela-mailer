import { NextResponse } from "next/server";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { checkDeliverability } from "@/lib/mailer-preflight";

export const dynamic = "force-dynamic";
const MONITORED_DOMAIN = "mailer.freela.ge";

export async function GET(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;

  try {
    const report = await checkDeliverability(MONITORED_DOMAIN);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: "Failed to check domain health" }, { status: 500 });
  }
}
