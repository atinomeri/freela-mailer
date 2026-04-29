import { NextResponse } from "next/server";
import { requireDesktopAuth } from "@/lib/desktop-auth";
import { checkDeliverability } from "@/lib/mailer-preflight";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const MONITORED_DOMAIN = "mailer.freela.ge";

type DomainStatus = "ready" | "review" | "failed";

function extractDomain(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;

  const emailMatch = raw.match(/[a-z0-9._%+\-]+@([a-z0-9.\-]+\.[a-z]{2,})/i);
  if (emailMatch?.[1]) return emailMatch[1].replace(/\.+$/, "");

  const host = raw
    .replace(/^https?:\/\//, "")
    .replace(/^smtp\./, "")
    .split(/[/:?#]/)[0]
    ?.replace(/\.+$/, "");

  if (!host || !/^[a-z0-9.\-]+\.[a-z]{2,}$/i.test(host)) return null;
  return host;
}

function resolveDomainStatus(
  checks: Array<{ name: string; status: "pass" | "warn" | "fail" }>,
): { ready: boolean; status: DomainStatus } {
  const spf = checks.find((item) => item.name === "SPF")?.status;
  const dkim = checks.find((item) => item.name === "DKIM")?.status;
  const mx = checks.find((item) => item.name === "MX")?.status;

  if (spf === "pass" && dkim === "pass") {
    return { ready: true, status: "ready" };
  }

  if (spf === "fail" || dkim === "fail" || mx === "fail") {
    return { ready: false, status: "failed" };
  }

  return { ready: false, status: "review" };
}

export async function GET(req: Request) {
  const auth = await requireDesktopAuth(req);
  if (auth.error) return auth.error;

  try {
    const [settings, smtpPoolAccounts, sendingAccounts, recentCampaigns] = await Promise.all([
      prisma.desktopMailerSettings.findUnique({
        where: { desktopUserId: auth.user.id },
        select: { fromEmail: true },
      }),
      prisma.desktopSmtpPoolAccount.findMany({
        where: { desktopUserId: auth.user.id, active: true },
        select: { fromEmail: true, username: true },
        take: 20,
      }),
      prisma.desktopSendingAccount.findMany({
        where: { desktopUserId: auth.user.id, active: true },
        select: { senderEmail: true, username: true },
        take: 20,
      }),
      prisma.campaign.findMany({
        where: { desktopUserId: auth.user.id, senderEmail: { not: null } },
        select: { senderEmail: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

    const domainSet = new Set<string>();
    domainSet.add(MONITORED_DOMAIN);

    [
      settings?.fromEmail,
      ...smtpPoolAccounts.flatMap((account) => [account.fromEmail, account.username]),
      ...sendingAccounts.flatMap((account) => [account.senderEmail, account.username]),
      ...recentCampaigns.map((campaign) => campaign.senderEmail),
    ].forEach((value) => {
      const domain = extractDomain(value);
      if (domain) domainSet.add(domain);
    });

    const domainsToCheck = Array.from(domainSet).slice(0, 8);
    const checks = await Promise.all(
      domainsToCheck.map(async (domain) => {
        try {
          const report = await checkDeliverability(domain);
          const resolved = resolveDomainStatus(report.checks);
          return {
            domain,
            score: report.score,
            riskLevel: report.riskLevel,
            ready: resolved.ready,
            status: resolved.status,
            checks: report.checks.map((item) => ({
              name: item.name,
              status: item.status,
              message: item.message,
            })),
          };
        } catch {
          return {
            domain,
            score: 0,
            riskLevel: "high" as const,
            ready: false,
            status: "failed" as const,
            checks: [],
          };
        }
      }),
    );

    const readyCount = checks.filter((item) => item.ready).length;
    const first = checks[0];

    return NextResponse.json({
      readyCount,
      totalCount: checks.length,
      domains: checks,
      // Backward-compatible top-level fields for older clients.
      domain: first?.domain,
      score: first?.score,
      riskLevel: first?.riskLevel,
      checks: first?.checks,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to check domain health" }, { status: 500 });
  }
}
