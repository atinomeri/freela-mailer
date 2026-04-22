import "server-only";

import { decryptSecretValue } from "@/lib/secret-crypto";

export interface ImapScanAccount {
  id: string;
  host: string;
  username: string;
  passwordEnc?: string;
  passwordPlain?: string;
  proxyType?: string | null;
  proxyHost?: string | null;
  proxyPort?: number | null;
  proxyUsername?: string | null;
  proxyPasswordEnc?: string | null;
}

export interface BounceScanSummary {
  checked: number;
  hard: number;
  soft: number;
  unknown: number;
  addresses: string[];
}

const EMAIL_RE =
  /([a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})/g;

export function deriveImapHost(smtpHost: string): string {
  const lower = smtpHost.toLowerCase();
  if (lower.startsWith("smtp.")) {
    return `imap.${smtpHost.slice(5)}`;
  }
  if (lower.includes("smtp")) {
    return lower.replace("smtp", "imap");
  }
  return smtpHost;
}

function classifyBounce(rawSource: string): "hard" | "soft" | "unknown" {
  const source = rawSource.toLowerCase();
  if (/status:\s*5\.\d+\.\d+/.test(source) || /action:\s*failed/.test(source)) {
    return "hard";
  }
  if (/status:\s*4\.\d+\.\d+/.test(source) || /action:\s*delayed/.test(source)) {
    return "soft";
  }
  return "unknown";
}

function extractBounceAddresses(rawSource: string): string[] {
  const hits = new Set<string>();
  const dsnRe =
    /(?:final-recipient|original-recipient)\s*:\s*rfc822;\s*([^\s<>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = dsnRe.exec(rawSource)) !== null) {
    const email = (m[1] || "").trim().toLowerCase();
    if (email) hits.add(email);
  }

  if (hits.size === 0) {
    let any: RegExpExecArray | null;
    while ((any = EMAIL_RE.exec(rawSource)) !== null) {
      const email = (any[1] || "").trim().toLowerCase();
      if (email) hits.add(email);
    }
  }

  return Array.from(hits);
}

function buildProxy(account: ImapScanAccount): string | undefined {
  if (!account.proxyType || !account.proxyHost || !account.proxyPort) {
    return undefined;
  }
  const user = account.proxyUsername
    ? encodeURIComponent(account.proxyUsername)
    : "";
  const pass = account.proxyPasswordEnc
    ? `:${encodeURIComponent(decryptSecretValue(account.proxyPasswordEnc))}`
    : "";
  const auth = user ? `${user}${pass}@` : "";
  return `${account.proxyType}://${auth}${account.proxyHost}:${account.proxyPort}`;
}

export async function scanBouncesForAccount(
  account: ImapScanAccount,
  options: { mailbox: string; maxMessages: number; markAsSeen: boolean },
): Promise<BounceScanSummary> {
  const { ImapFlow } = await import("imapflow");

  const host = deriveImapHost(account.host);
  const password = account.passwordPlain
    ? account.passwordPlain
    : account.passwordEnc
      ? decryptSecretValue(account.passwordEnc)
      : "";
  if (!password) {
    throw new Error(`No IMAP password available for account ${account.id}`);
  }
  const proxy = buildProxy(account);

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: {
      user: account.username,
      pass: password,
    },
    proxy,
    logger: false,
  } as any);

  const result: BounceScanSummary = {
    checked: 0,
    hard: 0,
    soft: 0,
    unknown: 0,
    addresses: [],
  };

  try {
    await client.connect();
    await client.mailboxOpen(options.mailbox);

    const search = await client.search({ seen: false, from: "MAILER-DAEMON" });
    const ids = Array.from(search || []).slice(0, options.maxMessages);

    for await (const msg of client.fetch(ids, { uid: true, source: true })) {
      result.checked += 1;
      const source = msg.source ? msg.source.toString("utf-8") : "";
      const classification = classifyBounce(source);
      if (classification === "hard") result.hard += 1;
      else if (classification === "soft") result.soft += 1;
      else result.unknown += 1;

      if (classification === "hard") {
        const extracted = extractBounceAddresses(source);
        for (const item of extracted) {
          result.addresses.push(item);
        }
      }

      if (options.markAsSeen) {
        await client.messageFlagsAdd(msg.uid, ["\\Seen"]);
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  result.addresses = Array.from(
    new Set(result.addresses.map((v) => v.trim().toLowerCase()).filter(Boolean)),
  );
  return result;
}
