import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

async function checkDb() {
  await prisma.$queryRaw`SELECT 1`;
}

async function checkRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return { configured: false as const, ok: true as const };

  const client = createClient({
    url,
    socket: { connectTimeout: 1500 }
  });

  try {
    client.on("error", () => {
      // ignore; handled by connect/ping timeouts
    });
    await withTimeout(client.connect(), 2000, "redis.connect");
    await withTimeout(client.ping(), 1500, "redis.ping");
    return { configured: true as const, ok: true as const };
  } finally {
    try {
      await client.quit();
    } catch {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const secret = process.env.HEALTH_CHECK_TOKEN?.trim();
  const provided = req.headers.get("x-health-secret")?.trim();
  const allowDetails = Boolean(secret && provided && provided === secret);

  const res: {
    ok: boolean;
    time: string;
    uptimeSeconds: number;
    checks: {
      db: { ok: boolean; ms: number; error?: string };
      redis: { ok: boolean; configured: boolean; ms: number; error?: string };
    };
  } = {
    ok: false,
    time: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      db: { ok: false, ms: 0 },
      redis: { ok: true, configured: Boolean(process.env.REDIS_URL?.trim()), ms: 0 }
    }
  };

  // DB
  {
    const t0 = Date.now();
    try {
      await withTimeout(checkDb(), 3000, "db");
      res.checks.db = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      res.checks.db = { ok: false, ms: Date.now() - t0, error: "CHECK_FAILED" };
    }
  }

  // Redis (optional)
  {
    const t0 = Date.now();
    try {
      const rr = await checkRedis();
      res.checks.redis = {
        ok: rr.ok,
        configured: rr.configured,
        ms: Date.now() - t0
      };
    } catch (e) {
      res.checks.redis = {
        ok: false,
        configured: true,
        ms: Date.now() - t0,
        error: "CHECK_FAILED"
      };
    }
  }

  res.ok = res.checks.db.ok && res.checks.redis.ok;

  const status = res.ok ? 200 : 503;
  const totalMs = Date.now() - startedAt;

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");

  if (allowDetails) {
    return NextResponse.json({ ...res, ms: totalMs }, { status, headers });
  }

  return NextResponse.json(
    {
      ok: res.ok,
      time: res.time,
      uptimeSeconds: res.uptimeSeconds,
      ms: totalMs
    },
    { status, headers }
  );
}

