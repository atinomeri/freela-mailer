import { requireDesktopAuth } from "@/lib/desktop-auth";
import { campaignPreflightRequestSchema } from "@/lib/validation";
import { errors, success } from "@/lib/api-response";
import { runCampaignPreflight } from "@/lib/campaign-preflight";
import { prisma } from "@/lib/prisma";

async function loadSendingAccountContext(desktopUserId: string, sendingAccountId?: string) {
  try {
    const [sendingAccount, activeSendingAccountsCount] = await Promise.all([
      sendingAccountId
        ? prisma.desktopSmtpPoolAccount.findFirst({
            where: {
              id: sendingAccountId,
              desktopUserId,
            },
            select: {
              id: true,
              active: true,
              failCount: true,
              username: true,
              fromEmail: true,
            },
          })
        : Promise.resolve(null),
      prisma.desktopSmtpPoolAccount.count({
        where: {
          desktopUserId,
          active: true,
        },
      }),
    ]);

    const linkedStatus = sendingAccount
      ? await prisma.desktopSendingAccount.findFirst({
          where: {
            desktopUserId,
            OR: [
              { username: sendingAccount.username },
              ...(sendingAccount.fromEmail ? [{ senderEmail: sendingAccount.fromEmail }] : []),
            ],
          },
          select: {
            status: true,
            lastTestSuccess: true,
          },
        })
      : null;

    return {
      activeSendingAccountsCount,
      sendingAccount: sendingAccount
        ? {
            active: sendingAccount.active,
            failCount: sendingAccount.failCount,
            username: sendingAccount.username,
            fromEmail: sendingAccount.fromEmail,
            linkedStatus: linkedStatus?.status ?? null,
            linkedLastTestSuccess: linkedStatus?.lastTestSuccess ?? null,
          }
        : null,
    };
  } catch (err) {
    console.warn("[Campaign Preflight] Sending account context unavailable:", err);
    return {
      activeSendingAccountsCount: 0,
      sendingAccount: null,
    };
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => null);
    if (!body) return errors.badRequest("Invalid JSON body");

    const parsed = campaignPreflightRequestSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);

    const accountContext = await loadSendingAccountContext(
      auth.user.id,
      parsed.data.sendingAccountId,
    );

    const result = await runCampaignPreflight({
      ...parsed.data,
      activeSendingAccountsCount: accountContext.activeSendingAccountsCount,
      sendingAccount: accountContext.sendingAccount,
    });
    return success({
      status: result.status.toLowerCase(),
      recommendations: result.recommendations,
      checks: result.checks,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Campaign Preflight] Error:", err);
    return errors.serverError();
  }
}
