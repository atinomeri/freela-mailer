import { checkDeliverability, checkSpamScore } from "@/lib/mailer-preflight";

export type CampaignPreflightStatus = "GOOD" | "WARNING" | "CRITICAL";
export type CampaignPreflightCheckStatus = "good" | "warning" | "critical";

export interface CampaignPreflightCheck {
  key: "sending_account" | "domain_setup" | "sender_alignment" | "unsubscribe" | "content";
  status: CampaignPreflightCheckStatus;
  title: string;
  message: string;
  details?: string;
}

export interface CampaignPreflightInput {
  senderEmail?: string;
  sendingAccountId?: string;
  subject: string;
  previewText?: string;
  html: string;
  recipientsCount: number;
  activeSendingAccountsCount?: number;
  sendingAccount?: {
    active: boolean;
    failCount: number;
    username: string;
    fromEmail?: string | null;
    linkedStatus?: "NOT_TESTED" | "CONNECTED" | "FAILED" | "NEEDS_ATTENTION" | "PAUSED" | "TESTING" | null;
    linkedLastTestSuccess?: boolean | null;
  } | null;
}

export interface CampaignPreflightResult {
  status: CampaignPreflightStatus;
  recommendations: string[];
  checks: CampaignPreflightCheck[];
}

const SPAM_PATTERNS = [
  /free\s+money/i,
  /guaranteed/i,
  /act\s+now/i,
  /urgent/i,
  /limited\s+time/i,
  /winner/i,
  /!!!+/,
];

function extractText(html: string): string {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasUnsubscribeHint(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("unsubscribe") ||
    lower.includes("unsub") ||
    lower.includes("{{unsubscribe") ||
    lower.includes("[[unsubscribe") ||
    lower.includes("unsubscribe_url")
  );
}

function countLinks(html: string): number {
  return (html.match(/<a\b[^>]*href=/gi) ?? []).length;
}

function countImages(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

function emailDomain(value?: string | null): string | null {
  const email = (value || "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  return email.split("@").pop() || null;
}

function toStatus(hasCritical: boolean, hasWarning: boolean): CampaignPreflightStatus {
  if (hasCritical) return "CRITICAL";
  if (hasWarning) return "WARNING";
  return "GOOD";
}

function normalizeCheckStatus(status: "pass" | "warn" | "fail" | undefined): CampaignPreflightCheckStatus {
  if (status === "pass") return "good";
  return "warning";
}

export async function runCampaignPreflight(input: CampaignPreflightInput): Promise<CampaignPreflightResult> {
  const checks: CampaignPreflightCheck[] = [];

  const subject = input.subject.trim();
  const previewText = (input.previewText || "").trim();
  const html = input.html.trim();
  const contentText = extractText(html);
  const activeSendingAccountsCount = input.activeSendingAccountsCount ?? 0;
  const account = input.sendingAccount ?? null;

  if (account) {
    const linkedStatus = account.linkedStatus;
    const failed =
      !account.active ||
      account.failCount >= 5 ||
      linkedStatus === "FAILED" ||
      linkedStatus === "PAUSED" ||
      account.linkedLastTestSuccess === false;
    const notTested = linkedStatus === "NOT_TESTED" || linkedStatus === "TESTING";

    if (failed) {
      checks.push({
        key: "sending_account",
        status: "critical",
        title: "Sending account needs attention",
        message: "Test or replace this sending account before sending.",
      });
    } else if (notTested) {
      checks.push({
        key: "sending_account",
        status: "warning",
        title: "Sending account not tested",
        message: "Send a test from this account before a real campaign.",
      });
    } else {
      checks.push({
        key: "sending_account",
        status: "good",
        title: "Sending account is ready",
        message: "This account is active for sending.",
      });
    }
  } else if (input.sendingAccountId) {
    checks.push({
      key: "sending_account",
      status: "critical",
      title: "Sending account not found",
      message: "Choose one of your own sending accounts.",
    });
  } else if (activeSendingAccountsCount > 0) {
    checks.push({
      key: "sending_account",
      status: "warning",
      title: "No specific sending account selected",
      message: "We can use an active account, but choosing one gives clearer results.",
    });
  } else {
    checks.push({
      key: "sending_account",
      status: "critical",
      title: "Add a sending account",
      message: "Add and test a sending account before sending campaigns.",
    });
  }

  if (!input.senderEmail || !input.senderEmail.includes("@")) {
    checks.push({
      key: "sender_alignment",
      status: "critical",
      title: "Sender email is missing",
      message: "Add a valid sender email before sending.",
    });
  } else {
    const fromDomain = emailDomain(input.senderEmail);
    const accountDomain = emailDomain(account?.fromEmail) || emailDomain(account?.username);
    if (accountDomain && fromDomain && accountDomain !== fromDomain) {
      checks.push({
        key: "sender_alignment",
        status: "warning",
        title: "Sender domain is different",
        message: "Use the same domain as the sending account for better Gmail and Yahoo trust.",
        details: `${fromDomain} vs ${accountDomain}`,
      });
    } else {
      checks.push({
        key: "sender_alignment",
        status: "good",
        title: "Sender domain matches",
        message: "The visible sender matches the selected account domain.",
      });
    }
  }

  if (input.senderEmail && input.senderEmail.includes("@")) {
    const report = await checkDeliverability(input.senderEmail).catch(() => null);
    if (report) {
      const spf = report.checks.find((item) => item.name === "SPF");
      const dkim = report.checks.find((item) => item.name === "DKIM");
      const dmarc = report.checks.find((item) => item.name === "DMARC");
      const statuses = [spf?.status, dkim?.status, dmarc?.status];
      const status: CampaignPreflightCheckStatus = statuses.every((item) => item === "pass")
        ? "good"
        : "warning";
      checks.push({
        key: "domain_setup",
        status,
        title: status === "good" ? "Sender domain is prepared" : "Improve sender domain setup",
        message:
          status === "good"
            ? "The sender domain has the key records mail providers expect."
            : "Ask your mail provider to check SPF, DKIM, and DMARC for this domain.",
        details: [
          `SPF: ${normalizeCheckStatus(spf?.status)}`,
          `DKIM: ${normalizeCheckStatus(dkim?.status)}`,
          `DMARC: ${normalizeCheckStatus(dmarc?.status)}`,
        ].join(" · "),
      });
    } else {
      checks.push({
        key: "domain_setup",
        status: "warning",
        title: "Domain check could not finish",
        message: "Try again, or check the sender domain in your mail provider.",
      });
    }
  }

  if (!hasUnsubscribeHint(html)) {
    checks.push({
      key: "unsubscribe",
      status: "warning",
      title: "Add unsubscribe link",
      message: "Add a clear unsubscribe option to reduce spam complaints.",
    });
  } else {
    checks.push({
      key: "unsubscribe",
      status: "good",
      title: "Unsubscribe link found",
      message: "Recipients have a clear way to opt out.",
    });
  }

  const contentWarnings: string[] = [];
  const spamReport = checkSpamScore(subject, html);
  const linkCount = countLinks(html);
  const imageCount = countImages(html);

  if (subject.length < 6) {
    contentWarnings.push("Use a clearer subject line.");
  }
  if (previewText.length === 0) {
    contentWarnings.push("Add preview text.");
  } else if (previewText.length < 15) {
    contentWarnings.push("Make preview text a little longer.");
  }
  if (contentText.length < 30) {
    contentWarnings.push("Add more message content.");
  }
  if (linkCount > 10) {
    contentWarnings.push("Reduce the number of links.");
  }
  if (imageCount > 5 || (imageCount > 0 && contentText.length < 100)) {
    contentWarnings.push("Balance images with more text.");
  }
  const spamHits = SPAM_PATTERNS.filter((pattern) => pattern.test(`${subject} ${contentText}`)).length;
  if (spamHits >= 2 || spamReport.riskLevel === "high") {
    contentWarnings.push("Reduce spam-like wording.");
  }
  if (input.recipientsCount <= 0) {
    contentWarnings.push("Select an audience before sending.");
  }
  if (input.recipientsCount > 50_000) {
    contentWarnings.push("Consider sending large audiences in smaller batches.");
  }

  checks.push({
    key: "content",
    status: contentWarnings.length > 0 ? "warning" : "good",
    title: contentWarnings.length > 0 ? "Content can be improved" : "Content looks good",
    message:
      contentWarnings.length > 0
        ? contentWarnings.slice(0, 2).join(" ")
        : "Subject, content, links, and images look reasonable.",
    details: contentWarnings.length > 2 ? contentWarnings.slice(2).join(" ") : undefined,
  });

  const hasCritical = checks.some((item) => item.status === "critical");
  const hasWarning = checks.some((item) => item.status === "warning");
  const status = toStatus(hasCritical, hasWarning);
  const recommendations = checks
    .filter((item) => item.status !== "good")
    .map((item) => item.message)
    .slice(0, 5);

  return {
    status,
    recommendations: recommendations.length > 0 ? recommendations : ["Ready to send."],
    checks,
  };
}
