import { prisma } from "@/lib/prisma";
import { errors, success } from "@/lib/api-response";
import { mailerBounceScanSchema } from "@/lib/validation";
import { scanBouncesForAccount, type ImapScanAccount } from "@/lib/imap-bounce";
import { requireDesktopAdmin } from "@/lib/desktop-admin-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireDesktopAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const desktopUserId = typeof body?.desktopUserId === "string" ? body.desktopUserId.trim() : "";
    if (!desktopUserId) return errors.badRequest("desktopUserId is required");

    const parsed = mailerBounceScanSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.issues);
    const opts = parsed.data;

    const poolAccounts = await prisma.desktopSmtpPoolAccount.findMany({
      where: { desktopUserId, active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        host: true,
        username: true,
        passwordEnc: true,
        proxyType: true,
        proxyHost: true,
        proxyPort: true,
        proxyUsername: true,
        proxyPasswordEnc: true,
      },
    });

    const accounts: ImapScanAccount[] = [];
    if (poolAccounts.length > 0) {
      accounts.push(...poolAccounts);
    } else {
      const single = await prisma.desktopSmtpConfig.findUnique({
        where: { desktopUserId },
        select: {
          id: true,
          host: true,
          username: true,
          passwordEnc: true,
        },
      });
      if (single) {
        accounts.push({
          id: single.id,
          host: single.host,
          username: single.username,
          passwordEnc: single.passwordEnc,
        });
      } else if (
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
      ) {
        accounts.push({
          id: "env",
          host: process.env.SMTP_HOST,
          username: process.env.SMTP_USER,
          passwordPlain: process.env.SMTP_PASS,
        });
      }
    }

    if (accounts.length === 0) {
      return errors.badRequest("No SMTP account available for IMAP bounce scan");
    }

    let checked = 0;
    let hard = 0;
    let soft = 0;
    let unknown = 0;
    const hardAddresses = new Set<string>();
    const accountResults: Array<{
      accountId: string;
      checked: number;
      hard: number;
      soft: number;
      unknown: number;
      addresses: string[];
      error?: string;
    }> = [];

    for (const account of accounts) {
      try {
        const result = await scanBouncesForAccount(account, opts);
        checked += result.checked;
        hard += result.hard;
        soft += result.soft;
        unknown += result.unknown;
        result.addresses.forEach((email) => hardAddresses.add(email));
        accountResults.push({
          accountId: account.id,
          checked: result.checked,
          hard: result.hard,
          soft: result.soft,
          unknown: result.unknown,
          addresses: result.addresses,
        });
      } catch (err) {
        accountResults.push({
          accountId: account.id,
          checked: 0,
          hard: 0,
          soft: 0,
          unknown: 0,
          addresses: [],
          error: err instanceof Error ? err.message : "Scan failed",
        });
      }
    }

    let added = 0;
    if (hardAddresses.size > 0) {
      const create = await prisma.unsubscribedEmail.createMany({
        data: Array.from(hardAddresses).map((email) => ({
          email,
          source: "bounce",
          desktopUserId,
        })),
        skipDuplicates: true,
      });
      added = create.count;
    }

    return success({
      checked,
      hard,
      soft,
      unknown,
      detectedHardAddresses: hardAddresses.size,
      addedToSuppression: added,
      accounts: accountResults,
    });
  } catch (err) {
    console.error("[Internal Bounce Scan] Error:", err);
    return errors.serverError();
  }
}
