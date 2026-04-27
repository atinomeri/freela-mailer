import { NextResponse } from "next/server";
import { requireDesktopAuth } from "@/lib/desktop-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;
  const user = auth.user;

  const healthPort = process.env.WORKER_HEALTH_PORT || "3001";
  try {
    const res = await fetch(`http://127.0.0.1:${healthPort}/healthz`, {
      method: "GET",
      // Short timeout so we don't hang if worker is completely dead
      signal: AbortSignal.timeout(2000), 
    });
    
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    return NextResponse.json({ ok: false, error: "Worker returned error status" }, { status: 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Worker unreachable" }, { status: 503 });
  }
}
