import "server-only";

import dns from "dns/promises";

const SPAM_WORDS_HIGH = [
  "act now",
  "buy now",
  "free money",
  "no obligation",
  "winner",
  "congratulations",
  "you have been selected",
  "100% free",
  "click here immediately",
  "urgent action required",
  "limited time offer",
  "once in a lifetime",
  "risk-free",
  "no cost",
  "no fees",
  "no credit check",
  "cash bonus",
  "double your money",
  "earn extra cash",
  "fast cash",
  "million dollars",
  "make money",
  "work from home",
  "ბесплатно",
  "без обязательств",
  "заработок",
  "срочно",
  "поздравляем",
  "вы выиграли",
  "нажмите здесь",
  "ограниченное предложение",
  "без риска",
  "უფასო",
  "მოიგე",
  "გილოცავთ",
  "სასწრაფოდ",
  "შეზღუდული შეთავაზება",
];

const SPAM_WORDS_MEDIUM = [
  "discount",
  "special offer",
  "promotion",
  "deal",
  "cheap",
  "lowest price",
  "best price",
  "save big",
  "order now",
  "subscribe now",
  "don't miss",
  "exclusive",
  "guaranteed",
  "offer expires",
  "clearance",
  "bonus",
  "скидка",
  "акция",
  "распродажа",
  "предложение",
  "гарантия",
  "специальная цена",
  "ფასდაკლება",
  "აქცია",
  "შეთავაზება",
  "გარანტია",
];

const SHORTENER_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "adf.ly",
  "bl.ink",
  "lnkd.in",
  "shorte.st",
  "bc.vc",
  "j.mp",
  "v.gd",
  "cutt.ly",
];

export interface SpamCheckResult {
  name: string;
  description: string;
  score: number;
  passed: boolean;
  severity: "info" | "warning" | "danger";
}

export interface SpamReport {
  totalScore: number;
  maxScore: number;
  riskLevel: "low" | "medium" | "high";
  checks: SpamCheckResult[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const re = /href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  return links;
}

export function checkSpamScore(subject: string, html: string): SpamReport {
  const checks: SpamCheckResult[] = [];
  const bodyText = stripHtml(html || "");
  const subjectNorm = (subject || "").trim();
  const subjectLower = subjectNorm.toLowerCase();
  const bodyLower = bodyText.toLowerCase();
  const combined = `${subjectLower} ${bodyLower}`;
  const links = extractLinks(html || "");
  const hasUnsubscribe =
    /unsubscribe|unsub|გამოწერის გაუქმება/i.test(html || "") ||
    links.some((l) => /unsubscribe|unsub/i.test(l));

  if (!subjectNorm) {
    checks.push({
      name: "empty_subject",
      description: "Subject line is empty",
      score: 2,
      passed: false,
      severity: "danger",
    });
  } else {
    checks.push({
      name: "empty_subject",
      description: "Subject line is present",
      score: 0,
      passed: true,
      severity: "info",
    });
  }

  const subjAlpha = Array.from(subjectNorm).filter((c) => /[a-z]/i.test(c));
  if (subjAlpha.length > 5) {
    const capsRatio =
      subjAlpha.filter((c) => c === c.toUpperCase()).length / subjAlpha.length;
    if (capsRatio > 0.7) {
      checks.push({
        name: "caps_subject",
        description: "Subject is mostly uppercase",
        score: 1.5,
        passed: false,
        severity: "warning",
      });
    }
  }

  const ex = (subjectNorm.match(/!/g) ?? []).length;
  const q = (subjectNorm.match(/\?/g) ?? []).length;
  if (ex >= 3 || q >= 3) {
    checks.push({
      name: "punctuation_subject",
      description: `Excessive punctuation in subject (${ex}x !, ${q}x ?)`,
      score: 1.5,
      passed: false,
      severity: "warning",
    });
  }

  const highHits = SPAM_WORDS_HIGH.filter((w) => combined.includes(w));
  if (highHits.length > 0) {
    checks.push({
      name: "spam_words_high",
      description: `High-risk spam words found: ${highHits.slice(0, 5).join(", ")}`,
      score: Math.min(3, highHits.length),
      passed: false,
      severity: "danger",
    });
  }

  const mediumHits = SPAM_WORDS_MEDIUM.filter((w) => combined.includes(w));
  if (mediumHits.length > 0) {
    checks.push({
      name: "spam_words_medium",
      description: `Marketing words found: ${mediumHits.slice(0, 5).join(", ")}`,
      score: Math.min(1.5, mediumHits.length * 0.3),
      passed: false,
      severity: "warning",
    });
  }

  if (!bodyText) {
    checks.push({
      name: "empty_body",
      description: "Email body is empty",
      score: 2,
      passed: false,
      severity: "danger",
    });
  }

  const imgCount = (html.match(/<img\b/gi) ?? []).length;
  if (imgCount > 0 && bodyText.length < 100) {
    checks.push({
      name: "image_ratio",
      description: `Too many images (${imgCount}) with little text (${bodyText.length} chars)`,
      score: 2,
      passed: false,
      severity: "danger",
    });
  }

  const shorteners = links.filter((url) =>
    SHORTENER_DOMAINS.some((domain) => url.toLowerCase().includes(domain)),
  );
  if (shorteners.length > 0) {
    checks.push({
      name: "shortener_links",
      description: "URL shorteners detected",
      score: 1.5,
      passed: false,
      severity: "warning",
    });
  }

  if (!hasUnsubscribe) {
    checks.push({
      name: "unsubscribe",
      description: "No unsubscribe link found",
      score: 2,
      passed: false,
      severity: "danger",
    });
  }

  const hiddenCount =
    (html.match(/display\s*:\s*none/gi) ?? []).length +
    (html.match(/font-size\s*:\s*0/gi) ?? []).length;
  if (hiddenCount > 0) {
    checks.push({
      name: "hidden_text",
      description: `Hidden text detected (${hiddenCount} elements)`,
      score: 2,
      passed: false,
      severity: "danger",
    });
  }

  const totalScore = Math.min(
    10,
    checks.reduce((acc, item) => acc + item.score, 0),
  );

  const riskLevel: "low" | "medium" | "high" =
    totalScore <= 2 ? "low" : totalScore <= 5 ? "medium" : "high";

  return {
    totalScore,
    maxScore: 10,
    riskLevel,
    checks,
  };
}

export interface DeliverabilityCheckResult {
  name: "SPF" | "DKIM" | "DMARC" | "MX";
  status: "pass" | "warn" | "fail";
  message: string;
  fixHint?: string;
  rawRecord?: string;
}

export interface DeliverabilityReport {
  domain: string;
  score: number;
  riskLevel: "low" | "medium" | "high";
  passed: number;
  total: number;
  checks: DeliverabilityCheckResult[];
}

async function queryTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function queryMx(name: string): Promise<Array<{ exchange: string; priority: number }>> {
  try {
    const records = await dns.resolveMx(name);
    return records;
  } catch {
    return [];
  }
}

async function queryCname(name: string): Promise<string | null> {
  try {
    const values = await dns.resolveCname(name);
    return values[0] || null;
  } catch {
    return null;
  }
}

function extractDomain(senderEmailOrDomain: string): string {
  const raw = senderEmailOrDomain.trim().toLowerCase();
  if (raw.includes("@")) return raw.split("@")[1] || raw;
  return raw;
}

export async function checkDeliverability(
  senderEmailOrDomain: string,
  dkimSelectors?: string[],
): Promise<DeliverabilityReport> {
  const domain = extractDomain(senderEmailOrDomain);
  const checks: DeliverabilityCheckResult[] = [];

  const mx = await queryMx(domain);
  if (mx.length === 0) {
    checks.push({
      name: "MX",
      status: "fail",
      message: "No MX records found",
      fixHint: "Add MX records in DNS for your mail provider",
    });
  } else {
    checks.push({
      name: "MX",
      status: "pass",
      message: `MX records found (${mx.length})`,
      rawRecord: mx
        .slice(0, 3)
        .map((m) => `${m.exchange} (prio ${m.priority})`)
        .join(", "),
    });
  }

  const txt = await queryTxt(domain);
  const spf = txt.find((r) => r.toLowerCase().startsWith("v=spf1"));
  if (!spf) {
    checks.push({
      name: "SPF",
      status: "fail",
      message: "SPF record not found",
      fixHint: "Add TXT record: v=spf1 ... ~all",
    });
  } else if (spf.includes("+all")) {
    checks.push({
      name: "SPF",
      status: "fail",
      message: "SPF uses +all (insecure)",
      fixHint: "Replace +all with ~all or -all",
      rawRecord: spf,
    });
  } else if (spf.includes("?all")) {
    checks.push({
      name: "SPF",
      status: "warn",
      message: "SPF uses neutral policy (?all)",
      fixHint: "Use ~all or -all for stronger policy",
      rawRecord: spf,
    });
  } else {
    checks.push({
      name: "SPF",
      status: "pass",
      message: "SPF record found",
      rawRecord: spf,
    });
  }

  const selectors =
    dkimSelectors && dkimSelectors.length > 0
      ? dkimSelectors
      : [
          "default",
          "google",
          "selector1",
          "selector2",
          "mail",
          "dkim",
          "k1",
          "s1",
          "s2",
          "hostinger",
          "zoho",
          "protonmail",
        ];
  const foundSelectors: string[] = [];
  for (const sel of selectors) {
    const key = `${sel}._domainkey.${domain}`;
    const txtRecords = await queryTxt(key);
    if (txtRecords.some((r) => /v=DKIM1|k=rsa/i.test(r))) {
      foundSelectors.push(sel);
      continue;
    }
    const cname = await queryCname(key);
    if (cname) {
      foundSelectors.push(sel);
    }
  }

  if (foundSelectors.length === 0) {
    checks.push({
      name: "DKIM",
      status: "fail",
      message: "DKIM record not found for common selectors",
      fixHint: "Enable DKIM in your mail provider DNS settings",
    });
  } else {
    checks.push({
      name: "DKIM",
      status: "pass",
      message: `DKIM found (selectors: ${foundSelectors.slice(0, 4).join(", ")})`,
    });
  }

  const dmarcRecords = await queryTxt(`_dmarc.${domain}`);
  const dmarc = dmarcRecords.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) {
    checks.push({
      name: "DMARC",
      status: "warn",
      message: "DMARC record not found",
      fixHint: "Add TXT at _dmarc: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain",
    });
  } else if (/p\s*=\s*none/i.test(dmarc)) {
    checks.push({
      name: "DMARC",
      status: "warn",
      message: "DMARC policy is none (monitoring only)",
      fixHint: "Move to p=quarantine or p=reject after validation",
      rawRecord: dmarc,
    });
  } else {
    checks.push({
      name: "DMARC",
      status: "pass",
      message: "DMARC record found",
      rawRecord: dmarc,
    });
  }

  const scoreWeights: Record<DeliverabilityCheckResult["name"], number> = {
    MX: 15,
    SPF: 25,
    DKIM: 35,
    DMARC: 25,
  };
  let score = 0;
  for (const check of checks) {
    const w = scoreWeights[check.name] || 0;
    if (check.status === "pass") score += w;
    if (check.status === "warn") score += Math.round(w / 2);
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const riskLevel: "low" | "medium" | "high" =
    score >= 80 ? "low" : score >= 50 ? "medium" : "high";

  return {
    domain,
    score,
    riskLevel,
    passed,
    total: checks.length,
    checks,
  };
}

