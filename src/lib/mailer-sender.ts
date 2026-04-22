export function normalizeEmailAddress(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const angleMatch = raw.match(/<\s*([^<>]+)\s*>/);
  const email = (angleMatch?.[1] || raw).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function isSenderPolicyError(message: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("sender address rejected") ||
    m.includes("not owned by user") ||
    m.includes("authentication") ||
    m.includes("auth failed") ||
    m.includes("invalid login") ||
    m.includes("relay access denied") ||
    m.includes("unauthorized sender") ||
    m.includes("sender rejected") ||
    m.includes("spf") ||
    m.includes("dkim") ||
    m.includes("dmarc")
  );
}

export function isHardBounceError(message: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();

  // Sender/auth/policy failures are not recipient hard-bounces.
  if (isSenderPolicyError(m)) {
    return false;
  }

  // Common hard-bounce phrases
  if (
    m.includes("user unknown") ||
    m.includes("unknown user") ||
    m.includes("no such user") ||
    m.includes("recipient address rejected") ||
    m.includes("mailbox unavailable") ||
    m.includes("invalid recipient") ||
    m.includes("does not exist") ||
    m.includes("account disabled") ||
    m.includes("unrouteable address")
  ) {
    return true;
  }

  // SMTP permanent recipient failures (mainly 5.1.x)
  if (
    /status:\s*5\.1\.\d+/.test(m) ||
    /smtp;\s*5\.1\.\d+/.test(m) ||
    (/\b(550|551|552|553)\b/.test(m) &&
      /(recipient|mailbox|user|address)/.test(m) &&
      !m.includes("sender"))
  ) {
    return true;
  }

  return false;
}

export function resolvePreferredFromAddress(input: {
  campaignSenderEmail: string | null | undefined;
  accountFromEmail: string | null | undefined;
  accountUsername: string | null | undefined;
  envFromEmail?: string | null | undefined;
}): string {
  const campaignSender = normalizeEmailAddress(input.campaignSenderEmail);
  const accountFrom = normalizeEmailAddress(input.accountFromEmail);
  const accountUser = normalizeEmailAddress(input.accountUsername);

  const allowedAccountSenders = new Set<string>();
  if (accountFrom) allowedAccountSenders.add(accountFrom);
  if (accountUser) allowedAccountSenders.add(accountUser);

  if (campaignSender && allowedAccountSenders.has(campaignSender)) {
    return campaignSender;
  }

  return (
    input.accountFromEmail ||
    input.envFromEmail ||
    input.accountUsername ||
    ""
  );
}
