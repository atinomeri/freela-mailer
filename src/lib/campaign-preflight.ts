export type CampaignPreflightStatus = "GOOD" | "WARNING" | "CRITICAL";

export interface CampaignPreflightInput {
  senderEmail?: string;
  subject: string;
  previewText?: string;
  html: string;
  recipientsCount: number;
}

export interface CampaignPreflightResult {
  status: CampaignPreflightStatus;
  recommendations: string[];
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

export function runCampaignPreflight(input: CampaignPreflightInput): CampaignPreflightResult {
  const recommendations: string[] = [];
  const criticalFindings: string[] = [];
  const warningFindings: string[] = [];

  const subject = input.subject.trim();
  const previewText = (input.previewText || "").trim();
  const html = input.html.trim();
  const contentText = extractText(html);

  if (!input.senderEmail || !input.senderEmail.includes("@")) {
    criticalFindings.push("Add a valid sender email before sending.");
  }

  if (subject.length < 3) {
    criticalFindings.push("Add a clearer subject line.");
  }

  if (contentText.length < 30) {
    criticalFindings.push("Add more message content.");
  }

  if (!hasUnsubscribeHint(html)) {
    warningFindings.push("Add an unsubscribe option to improve deliverability.");
  }

  if (previewText.length > 0 && previewText.length < 15) {
    warningFindings.push("Preview text is too short. Add a bit more context.");
  }

  if (previewText.length === 0) {
    warningFindings.push("Add preview text to improve open rates.");
  }

  const spamHits = SPAM_PATTERNS.filter((pattern) => pattern.test(`${subject} ${contentText}`)).length;
  if (spamHits >= 2) {
    warningFindings.push("Reduce sales-heavy wording in subject and content.");
  }

  if (input.recipientsCount <= 0) {
    criticalFindings.push("Select an audience before sending.");
  }

  if (input.recipientsCount > 50_000) {
    warningFindings.push("Large audience detected. Consider sending in smaller batches.");
  }

  if (criticalFindings.length > 0) {
    recommendations.push(...criticalFindings.slice(0, 3));
    return { status: "CRITICAL", recommendations };
  }

  if (warningFindings.length > 0) {
    recommendations.push(...warningFindings.slice(0, 3));
    return { status: "WARNING", recommendations };
  }

  recommendations.push("Ready to send.");
  return { status: "GOOD", recommendations };
}
