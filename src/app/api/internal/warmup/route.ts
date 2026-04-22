import { prisma } from "@/lib/prisma";
import { errors, success } from "@/lib/api-response";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

const WARMUP_ENABLED = (process.env.CAMPAIGN_WARMUP_ENABLED || "false").toLowerCase() === "true";
const WARMUP_START = Math.max(1, parseInt(process.env.CAMPAIGN_WARMUP_START || "10", 10));
const WARMUP_INCREMENT = Math.max(0, parseInt(process.env.CAMPAIGN_WARMUP_INCREMENT || "10", 10));
const WARMUP_MAX = Math.max(0, parseInt(process.env.CAMPAIGN_WARMUP_MAX || "0", 10));

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcWarmupLimit(firstSeenAt: Date, now: Date): number {
  const firstDay = new Date(
    firstSeenAt.getFullYear(),
    firstSeenAt.getMonth(),
    firstSeenAt.getDate(),
  );
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.max(
    1,
    Math.floor((currentDay.getTime() - firstDay.getTime()) / 86_400_000) + 1,
  );
  const limit = WARMUP_START + (days - 1) * WARMUP_INCREMENT;
  return WARMUP_MAX > 0 ? Math.min(limit, WARMUP_MAX) : limit;
}

export async function GET(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const url = new URL(req.url);
    const desktopUserId = url.searchParams.get("desktopUserId")?.trim() ?? "";
    if (!desktopUserId) return errors.badRequest("desktopUserId is required");

    const now = new Date();
    const today = localDateKey(now);
    const senders = await prisma.desktopWarmupSender.findMany({
      where: { desktopUserId },
      orderBy: { updatedAt: "desc" },
      select: {
        senderKey: true,
        firstSeenAt: true,
        lastSentDate: true,
        sentToday: true,
        totalSent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({
      enabled: WARMUP_ENABLED,
      config: {
        start: WARMUP_START,
        increment: WARMUP_INCREMENT,
        max: WARMUP_MAX,
      },
      senders: senders.map((sender) => {
        const limit = calcWarmupLimit(sender.firstSeenAt, now);
        const sentToday = sender.lastSentDate === today ? sender.sentToday : 0;
        const firstDay = new Date(
          sender.firstSeenAt.getFullYear(),
          sender.firstSeenAt.getMonth(),
          sender.firstSeenAt.getDate(),
        );
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return {
          senderKey: sender.senderKey,
          firstSeenAt: sender.firstSeenAt,
          day: Math.max(
            1,
            Math.floor((todayStart.getTime() - firstDay.getTime()) / 86_400_000) + 1,
          ),
          limit,
          sentToday,
          remainingToday: Math.max(0, limit - sentToday),
          totalSent: sender.totalSent,
          createdAt: sender.createdAt,
          updatedAt: sender.updatedAt,
        };
      }),
    });
  } catch (err) {
    console.error("[Internal Warmup GET] Error:", err);
    return errors.serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      desktopUserId?: string;
      senderKey?: string;
    };
    const desktopUserId = body.desktopUserId?.trim() ?? "";
    if (!desktopUserId) return errors.badRequest("desktopUserId is required");

    const senderKey = body.senderKey?.trim().toLowerCase();

    if (senderKey) {
      await prisma.desktopWarmupSender.updateMany({
        where: { desktopUserId, senderKey },
        data: {
          firstSeenAt: new Date(),
          lastSentDate: null,
          sentToday: 0,
          totalSent: 0,
        },
      });
    } else {
      await prisma.desktopWarmupSender.updateMany({
        where: { desktopUserId },
        data: {
          firstSeenAt: new Date(),
          lastSentDate: null,
          sentToday: 0,
          totalSent: 0,
        },
      });
    }

    return success({
      reset: senderKey ? "single" : "all",
      senderKey: senderKey ?? null,
      desktopUserId,
    });
  } catch (err) {
    console.error("[Internal Warmup POST] Error:", err);
    return errors.serverError();
  }
}
