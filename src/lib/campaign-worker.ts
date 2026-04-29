/**
 * Campaign Sending Worker — processes campaign send jobs from the queue.
 *
 * TypeScript rewrite of desktop Python `core/mailer.py` send_bulk logic:
 *   - Batch sending with throttling (delay between emails, pause between batches)
 *   - Personalization via [[column]] placeholders
 *   - Tracking pixel/click injection
 *   - Unsubscribe link injection
 *   - Retry on transient SMTP errors
 *   - Progress tracking (sentCount/failedCount updates)
 */

import { Worker, type Job } from "bullmq";
import nodemailer from "nodemailer";
import { createHash } from "crypto";
import {
  CAMPAIGN_QUEUE_NAME,
  getRedisConnection,
  type CampaignSendJobData,
} from "./campaign-queue";
import { decryptSecretValue } from "./secret-crypto";
import { nextDailyRunAfter } from "./campaign-schedule";
import {
  isHardBounceError,
  isSenderPolicyError,
  normalizeEmailAddress,
  resolvePreferredFromAddress,
} from "./mailer-sender";
import { createUnsubscribeToken } from "./unsubscribe-token";

// ── Prisma (dynamic import to avoid "server-only" issues in worker process) ──

async function getPrisma() {
  // Direct import of PrismaClient for standalone worker
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

// ============================================
// Config
// ============================================

const BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE || "50", 10);
const DELAY_MIN_MS = parseInt(process.env.CAMPAIGN_DELAY_MIN_MS || "200", 10);
const DELAY_MAX_MS = parseInt(process.env.CAMPAIGN_DELAY_MAX_MS || "1000", 10);
const BATCH_PAUSE_MS = parseInt(process.env.CAMPAIGN_BATCH_PAUSE_MS || "5000", 10);
const MAX_CONSECUTIVE_FAILURES = 5;
const SMTP_TIMEOUT_MS = 15_000;
const WARMUP_ENABLED = (process.env.CAMPAIGN_WARMUP_ENABLED || "false").toLowerCase() === "true";
const WARMUP_START = Math.max(1, parseInt(process.env.CAMPAIGN_WARMUP_START || "10", 10));
const WARMUP_INCREMENT = Math.max(0, parseInt(process.env.CAMPAIGN_WARMUP_INCREMENT || "10", 10));
const WARMUP_MAX = Math.max(0, parseInt(process.env.CAMPAIGN_WARMUP_MAX || "0", 10));

// ============================================
// Personalization + Tracking (ported from Python)
// ============================================

function personalize(template: string, row: Record<string, string>): string {
  return template.replace(/\[\[(.+?)\]\]/g, (match, key: string) => {
    const trimmed = key.trim();
    for (const [col, value] of Object.entries(row)) {
      if (col.trim().toLowerCase() === trimmed.toLowerCase()) {
        return escapeHtml(String(value));
      }
    }
    return match; // leave placeholder if no match
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectTracking(
  html: string,
  recipientEmail: string,
  campaignId: string,
  trackOpens: boolean,
  trackingUrl: string,
  trackClicks: boolean,
  clickTrackingUrl: string,
): string {
  const emailB64 = Buffer.from(recipientEmail).toString("base64");

  // Click tracking
  if (trackClicks && clickTrackingUrl) {
    html = html.replace(
      /href="(https?:\/\/[^"]+)"/gi,
      (match, originalUrl: string) => {
        const lower = originalUrl.toLowerCase();
        if (lower.includes("unsubscribe") || lower.includes("unsub") || lower.startsWith("mailto:")) {
          return match;
        }
        const urlB64 = Buffer.from(originalUrl).toString("base64");
        const params = new URLSearchParams({ url: urlB64, email: emailB64, cid: campaignId });
        return `href="${clickTrackingUrl}?${params.toString()}"`;
      },
    );
  }

  // Open tracking pixel
  if (trackOpens && trackingUrl) {
    const params = new URLSearchParams({ data: emailB64, cid: campaignId });
    const pixel = `<img src="${trackingUrl}?${params.toString()}" width="1" height="1" alt="" style="display:none;border:0;" />`;
    const bodyClose = html.toLowerCase().lastIndexOf("</body>");
    if (bodyClose !== -1) {
      html = html.slice(0, bodyClose) + pixel + html.slice(bodyClose);
    } else {
      html += pixel;
    }
  }

  return html;
}

function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  // Unescape common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function randomDelay(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string {
  return (baseUrl || "").trim().replace(/\/+$/, "");
}

/**
 * Base URL baked into outgoing emails (tracking + unsubscribe).
 *
 * `MAILER_PUBLIC_URL` is the forever-host for already-sent campaigns and must stay
 * stable across deployments. In production it is REQUIRED — no cross-product
 * fallback to freela's NEXTAUTH_URL. The fallback chain exists only for dev/test
 * where a single URL env is convenient.
 */
function resolveMailerPublicBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    const prodUrl = process.env.MAILER_PUBLIC_URL?.trim();
    if (!prodUrl) {
      throw new Error(
        "MAILER_PUBLIC_URL is required in production. It is the forever-host baked " +
          "into every outgoing tracking pixel and unsubscribe link. Set it explicitly " +
          "(e.g. https://freela.ge) on both the app and worker containers.",
      );
    }
    return normalizeBaseUrl(prodUrl);
  }
  return normalizeBaseUrl(
    process.env.MAILER_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL,
  );
}

function resolveTrackingUrl(
  explicitEnvUrl: string | undefined,
  fallbackPath: "/api/tracking/pixel" | "/api/tracking/click",
): string {
  const explicit = (explicitEnvUrl || "").trim();
  if (explicit) return explicit;
  const base = resolveMailerPublicBaseUrl();
  return base ? `${base}${fallbackPath}` : "";
}

function createUnsubscribeTokenSafe(
  recipientEmail: string,
  desktopUserId: string,
): string {
  try {
    return createUnsubscribeToken(recipientEmail, desktopUserId);
  } catch (error) {
    const normalized = recipientEmail.trim().toLowerCase();
    console.warn(
      `[Worker] Failed to create signed unsubscribe token for ${normalized}; using legacy fallback token.`,
      error,
    );
    return Buffer.from(normalized, "utf-8").toString("base64url");
  }
}

function resolveUnsubscribeUrl(token: string): string {
  const configured = (process.env.UNSUBSCRIBE_PAGE_URL || "").trim();
  if (configured) {
    if (/\[\[\s*Email_B64\s*\]\]/i.test(configured)) {
      return configured.replace(
        /\[\[\s*Email_B64\s*\]\]/gi,
        encodeURIComponent(token),
      );
    }
    const separator = configured.includes("?") ? "&" : "?";
    return `${configured}${separator}email=${encodeURIComponent(token)}`;
  }

  const base = resolveMailerPublicBaseUrl();
  return base ? `${base}/unsub?email=${encodeURIComponent(token)}` : "";
}

export function buildRecipientTemplateData(params: {
  emailColumn: string;
  recipientEmail: string;
  contactData?: Record<string, string>;
  desktopUserId: string;
}): Record<string, string> {
  const token = createUnsubscribeTokenSafe(
    params.recipientEmail,
    params.desktopUserId,
  );
  const unsubscribeUrl = resolveUnsubscribeUrl(token);

  return {
    [params.emailColumn]: params.recipientEmail,
    ...(params.contactData || {}),
    Email_B64: token,
    UNSUBSCRIBE_TOKEN: token,
    ...(unsubscribeUrl ? { UNSUBSCRIBE_URL: unsubscribeUrl } : {}),
  };
}

interface SmtpResolvedAccount {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  senderKey: string;
  fromEmail?: string | null;
  fromName?: string | null;
  proxyType?: string | null;
  proxyHost?: string | null;
  proxyPort?: number | null;
  proxyUsername?: string | null;
  proxyPassword?: string | null;
}

interface WarmupSenderState {
  senderKey: string;
  firstSeenAt: Date;
  lastSentDate: string | null;
  sentToday: number;
  totalSent: number;
}

function buildProxyUrl(account: SmtpResolvedAccount): string | null {
  if (!account.proxyType || !account.proxyHost || !account.proxyPort) return null;
  const user = account.proxyUsername
    ? encodeURIComponent(account.proxyUsername)
    : "";
  const pass = account.proxyPassword
    ? `:${encodeURIComponent(account.proxyPassword)}`
    : "";
  const auth = user ? `${user}${pass}@` : "";
  return `${account.proxyType}://${auth}${account.proxyHost}:${account.proxyPort}`;
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hashRecipientEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
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

// ============================================
// Job Processor
// ============================================

async function processCampaignSend(job: Job<CampaignSendJobData>): Promise<void> {
  const {
    campaignId,
    desktopUserId,
    dailyBatch,
    sliceOffset: jobSliceOffset,
    sliceLimit: jobSliceLimit,
  } = job.data;
  const prisma = await getPrisma();

  try {
    // 1. Load campaign + contact list
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        contactList: {
          select: { emailColumn: true },
        },
      },
    });

    // Helper: mark campaign FAILED with a user-visible error and bail.
    const failCampaignWith = async (message: string) => {
      console.error(`[Worker] Campaign ${campaignId} failing: ${message}`);
      await prisma.campaign
        .update({
          where: { id: campaignId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
          },
        })
        .catch(() => {});
    };

    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (campaign.desktopUserId !== desktopUserId) throw new Error("Ownership mismatch");
    if (campaign.status !== "QUEUED") throw new Error(`Campaign status is ${campaign.status}, expected QUEUED`);
    if (!campaign.contactListId) throw new Error("No contact list assigned");

    const unsubscribed = await prisma.unsubscribedEmail.findMany({
      where: { desktopUserId },
      select: { email: true },
    });
    const blockedEmails = Array.from(
      new Set(
        unsubscribed
          .map((item) => item.email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    const contactsWhere = {
      contactListId: campaign.contactListId,
      ...(blockedEmails.length > 0 ? { email: { notIn: blockedEmails } } : {}),
    };

    // 2. Load contacts count after suppression
    const totalEligibleContacts = await prisma.contact.count({ where: contactsWhere });
    const isDailyCampaign = campaign.scheduleMode === "DAILY";
    const isDailyRun =
      isDailyCampaign &&
      (dailyBatch === true ||
        typeof jobSliceOffset === "number" ||
        typeof jobSliceLimit === "number");

    if (totalEligibleContacts <= 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "COMPLETED",
          totalCount: 0,
          sentCount: 0,
          failedCount: 0,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      return;
    }

    const runSliceOffset = isDailyRun
      ? Math.max(0, jobSliceOffset ?? campaign.dailySentOffset)
      : 0;
    const runSliceLimit = isDailyRun
      ? Math.max(1, jobSliceLimit ?? campaign.dailyLimit ?? totalEligibleContacts)
      : totalEligibleContacts;
    const runTotalContacts = isDailyRun
      ? Math.max(0, Math.min(runSliceLimit, totalEligibleContacts - runSliceOffset))
      : totalEligibleContacts;

    if (runTotalContacts <= 0) {
      if (isDailyRun) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "COMPLETED",
            totalCount: campaign.dailyTotalCount ?? totalEligibleContacts,
            sentCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            dailySentOffset: totalEligibleContacts,
            scheduledAt: null,
            completedAt: new Date(),
          },
        });
      }
      return;
    }

    // 3. Mark as SENDING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "SENDING",
        startedAt: campaign.startedAt ?? new Date(),
        totalCount: isDailyCampaign
          ? campaign.dailyTotalCount ?? totalEligibleContacts
          : totalEligibleContacts,
        ...(isDailyCampaign && campaign.dailyTotalCount == null
          ? { dailyTotalCount: totalEligibleContacts }
          : {}),
      },
    });

    // 4. Resolve SMTP config
    //
    // Two modes:
    //   (a) Focused — campaign.sendingAccountId is set: use ONLY that pool
    //       account, no rotation, no fallback. If it is missing or inactive,
    //       fail the campaign with a clear log line.
    //   (b) Pool — campaign.sendingAccountId is null: rotate through the
    //       user's active pool, falling back to the single user SMTP config
    //       or the SMTP_* env. (Pre-existing behaviour kept for backward
    //       compatibility.)
    const userSmtp = await prisma.desktopSmtpConfig.findUnique({
      where: { desktopUserId },
      select: {
        host: true,
        port: true,
        secure: true,
        username: true,
        passwordEnc: true,
        fromEmail: true,
        fromName: true,
        trackOpens: true,
        trackClicks: true,
      },
    });

    let smtpAccounts: SmtpResolvedAccount[];
    let resolvedPool: SmtpResolvedAccount[] = [];

    if (campaign.sendingAccountId) {
      const focused = await prisma.desktopSmtpPoolAccount.findUnique({
        where: { id: campaign.sendingAccountId },
        select: {
          id: true,
          desktopUserId: true,
          active: true,
          host: true,
          port: true,
          secure: true,
          username: true,
          passwordEnc: true,
          fromEmail: true,
          fromName: true,
          proxyType: true,
          proxyHost: true,
          proxyPort: true,
          proxyUsername: true,
          proxyPasswordEnc: true,
        },
      });

      if (!focused || focused.desktopUserId !== desktopUserId || !focused.active) {
        await failCampaignWith("Selected sending account no longer available");
        return;
      }

      const focusedResolved: SmtpResolvedAccount = {
        id: focused.id,
        host: focused.host,
        port: focused.port,
        secure: focused.secure,
        username: focused.username,
        password: decryptSecretValue(focused.passwordEnc),
        senderKey: (focused.fromEmail || focused.username).trim().toLowerCase(),
        fromEmail: focused.fromEmail,
        fromName: focused.fromName,
        proxyType: focused.proxyType,
        proxyHost: focused.proxyHost,
        proxyPort: focused.proxyPort,
        proxyUsername: focused.proxyUsername,
        proxyPassword: focused.proxyPasswordEnc
          ? decryptSecretValue(focused.proxyPasswordEnc)
          : null,
      };

      console.log(
        `[Mailer] Focused Send: Using specific account ${focusedResolved.username} for Campaign ${campaignId}`,
      );

      smtpAccounts = [focusedResolved];
    } else {
      const smtpPoolAccounts = await prisma.desktopSmtpPoolAccount.findMany({
        where: { desktopUserId, active: true },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          host: true,
          port: true,
          secure: true,
          username: true,
          passwordEnc: true,
          fromEmail: true,
          fromName: true,
          proxyType: true,
          proxyHost: true,
          proxyPort: true,
          proxyUsername: true,
          proxyPasswordEnc: true,
        },
      });

      resolvedPool = smtpPoolAccounts.map((item) => ({
        id: item.id,
        host: item.host,
        port: item.port,
        secure: item.secure,
        username: item.username,
        password: decryptSecretValue(item.passwordEnc),
        senderKey: (item.fromEmail || item.username).trim().toLowerCase(),
        fromEmail: item.fromEmail,
        fromName: item.fromName,
        proxyType: item.proxyType,
        proxyHost: item.proxyHost,
        proxyPort: item.proxyPort,
        proxyUsername: item.proxyUsername,
        proxyPassword: item.proxyPasswordEnc
          ? decryptSecretValue(item.proxyPasswordEnc)
          : null,
      }));

      const fallbackPort = userSmtp?.port || parseInt(process.env.SMTP_PORT || "465", 10);
      const fallbackSecure = userSmtp?.secure ?? fallbackPort === 465;
      const fallbackAccount: SmtpResolvedAccount | null =
        (userSmtp?.host || process.env.SMTP_HOST) &&
        (userSmtp?.username || process.env.SMTP_USER) &&
        (userSmtp?.passwordEnc || process.env.SMTP_PASS)
          ? {
              id: "single",
              host: userSmtp?.host || process.env.SMTP_HOST || "",
              port: fallbackPort,
              secure: fallbackSecure,
              username: userSmtp?.username || process.env.SMTP_USER || "",
              password: userSmtp
                ? decryptSecretValue(userSmtp.passwordEnc)
                : process.env.SMTP_PASS || "",
              senderKey: (
                userSmtp?.fromEmail ||
                process.env.SMTP_FROM ||
                userSmtp?.username ||
                process.env.SMTP_USER ||
                ""
              )
                .trim()
                .toLowerCase(),
              fromEmail: userSmtp?.fromEmail || process.env.SMTP_FROM || null,
              fromName: userSmtp?.fromName || null,
            }
          : null;

      if (resolvedPool.length === 0 && !fallbackAccount) {
        await failCampaignWith("SMTP not configured for this account");
        return;
      }

      smtpAccounts = resolvedPool.length > 0 ? resolvedPool : [fallbackAccount!];
    }
    const transporters = new Map<string, nodemailer.Transporter>();
    const accountFailures = new Map<string, number>();
    const warmupState = new Map<string, WarmupSenderState>();
    const warmupTouched = new Set<string>();
    let rotationIndex = 0;

    if (WARMUP_ENABLED && smtpAccounts.length > 0) {
      const senderKeys = Array.from(
        new Set(
          smtpAccounts
            .map((item) => item.senderKey)
            .filter(Boolean),
        ),
      );

      if (senderKeys.length > 0) {
        const existingWarmup = await prisma.desktopWarmupSender.findMany({
          where: {
            desktopUserId,
            senderKey: { in: senderKeys },
          },
          select: {
            senderKey: true,
            firstSeenAt: true,
            lastSentDate: true,
            sentToday: true,
            totalSent: true,
          },
        });

        for (const state of existingWarmup) {
          warmupState.set(state.senderKey, {
            senderKey: state.senderKey,
            firstSeenAt: state.firstSeenAt,
            lastSentDate: state.lastSentDate,
            sentToday: state.sentToday,
            totalSent: state.totalSent,
          });
        }

        const now = new Date();
        for (const senderKey of senderKeys) {
          if (warmupState.has(senderKey)) continue;
          warmupState.set(senderKey, {
            senderKey,
            firstSeenAt: now,
            lastSentDate: null,
            sentToday: 0,
            totalSent: 0,
          });
        }
      }
    }

    // Tracking config
    const trackOpens = userSmtp?.trackOpens ?? process.env.TRACK_OPENS === "true";
    const trackingUrl = resolveTrackingUrl(
      process.env.TRACKING_PIXEL_URL,
      "/api/tracking/pixel",
    );
    const trackClicks = userSmtp?.trackClicks ?? process.env.TRACK_CLICKS === "true";
    const clickTrackingUrl = resolveTrackingUrl(
      process.env.CLICK_TRACKING_URL,
      "/api/tracking/click",
    );
    if (trackOpens && !trackingUrl) {
      console.warn("[Worker] Open tracking enabled but tracking pixel URL is empty.");
    }
    if (trackClicks && !clickTrackingUrl) {
      console.warn("[Worker] Click tracking enabled but click tracking URL is empty.");
    }

    const emailColumn = campaign.contactList?.emailColumn || "email";

    let sentCount = campaign.sentCount;
    let failedCount = campaign.failedCount;
    let bounceCount = campaign.bounceCount ?? 0;
    let processedInRun = 0;
    let consecutiveFailures = 0;
    let offset = isDailyRun ? runSliceOffset : 0;
    const runEndOffset = isDailyRun
      ? runSliceOffset + runTotalContacts
      : totalEligibleContacts;
    let stoppedByWarmup = false;
    let stoppedByConsecutiveFailures = false;
    const bouncedEmails = new Set<string>();
    const failedRecipients: Array<{ email: string; reason: string | null }> = [];

    const getWarmupRemaining = (senderKey: string): number => {
      if (!WARMUP_ENABLED || !senderKey) return Number.POSITIVE_INFINITY;
      const state = warmupState.get(senderKey);
      if (!state) return Number.POSITIVE_INFINITY;
      const now = new Date();
      const today = localDateKey(now);
      const sentToday = state.lastSentDate === today ? state.sentToday : 0;
      return Math.max(0, calcWarmupLimit(state.firstSeenAt, now) - sentToday);
    };

    const markWarmupSent = (senderKey: string): void => {
      if (!WARMUP_ENABLED || !senderKey) return;
      const state = warmupState.get(senderKey);
      if (!state) return;
      const today = localDateKey(new Date());
      if (state.lastSentDate !== today) {
        state.lastSentDate = today;
        state.sentToday = 0;
      }
      state.sentToday += 1;
      state.totalSent += 1;
      warmupTouched.add(senderKey);
    };

    const pickNextSmtpAccount = (): SmtpResolvedAccount | null => {
      if (smtpAccounts.length === 0) return null;
      for (let i = 0; i < smtpAccounts.length; i++) {
        const candidate = smtpAccounts[rotationIndex % smtpAccounts.length];
        rotationIndex++;
        if (!WARMUP_ENABLED || getWarmupRemaining(candidate.senderKey) > 0) {
          return candidate;
        }
      }
      return null;
    };

    // 5. Process contacts in batches
    while (offset < runEndOffset) {
      const contacts = await prisma.contact.findMany({
        where: contactsWhere,
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: Math.min(BATCH_SIZE, runEndOffset - offset),
      });

      if (contacts.length === 0) break;

      for (const contact of contacts) {
        // Check if campaign was paused/cancelled externally
        const currentStatus = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });
        if (currentStatus?.status !== "SENDING") {
          console.log(`[Worker] Campaign ${campaignId} status changed to ${currentStatus?.status}, stopping`);
          return;
        }

        // Build personalization data
        const rowData = buildRecipientTemplateData({
          emailColumn,
          recipientEmail: contact.email,
          contactData: (contact.data as Record<string, string>) || {},
          desktopUserId,
        });

        // Personalize subject and body
        const subject = personalize(campaign.subject, rowData);
        let htmlBody = personalize(campaign.html, rowData);

        // Inject tracking
        htmlBody = injectTracking(
          htmlBody,
          contact.email,
          campaignId,
          trackOpens,
          trackingUrl,
          trackClicks,
          clickTrackingUrl,
        );

        // Wrap in HTML boilerplate
        const fullHtml =
          '<!DOCTYPE html>\n<html><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
          "</head><body>\n" +
          htmlBody +
          "\n</body></html>";

        const plainText = htmlToPlainText(htmlBody);

        const smtpAccount = pickNextSmtpAccount();
        if (!smtpAccount) {
          stoppedByWarmup = true;
          break;
        }
        const senderName = campaign.senderName || smtpAccount.fromName || "";
        const accountUser = normalizeEmailAddress(smtpAccount.username);
        const smtpFrom = resolvePreferredFromAddress({
          campaignSenderEmail: campaign.senderEmail,
          accountFromEmail: smtpAccount.fromEmail,
          accountUsername: smtpAccount.username,
          envFromEmail: process.env.SMTP_FROM,
        });
        let activeFrom = smtpFrom;
        let switchedToAccountUser = false;

        let transporter = transporters.get(smtpAccount.id);
        if (!transporter) {
          const transportConfig: Record<string, unknown> = {
            host: smtpAccount.host,
            port: smtpAccount.port,
            secure: smtpAccount.secure,
            auth: { user: smtpAccount.username, pass: smtpAccount.password },
            connectionTimeout: SMTP_TIMEOUT_MS,
            socketTimeout: SMTP_TIMEOUT_MS,
          };
          const proxy = buildProxyUrl(smtpAccount);
          if (proxy) {
            transportConfig.proxy = proxy;
          }
          transporter = nodemailer.createTransport(transportConfig as any);
          transporters.set(smtpAccount.id, transporter);
          console.log(
            `[Mailer] Sending via ${smtpAccount.host} using account ${smtpAccount.username}`,
          );
        }

        // Send with retry
        let sent = false;
        let lastErrorMessage: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await transporter.sendMail({
              from: senderName ? `"${senderName}" <${activeFrom}>` : activeFrom,
              to: contact.email,
              subject,
              text: plainText,
              html: fullHtml,
            });
            sent = true;
            break;
          } catch (err) {
            lastErrorMessage =
              err instanceof Error ? err.message : String(err);

            if (
              !switchedToAccountUser &&
              accountUser &&
              normalizeEmailAddress(activeFrom) !== accountUser &&
              isSenderPolicyError(lastErrorMessage)
            ) {
              activeFrom = accountUser;
              switchedToAccountUser = true;
              continue;
            }

            if (attempt < 2) {
              await sleep(1000 * (attempt + 1));
            }
          }
        }

        if (sent) {
          sentCount++;
          processedInRun++;
          const recipientEmail = contact.email.trim().toLowerCase();
          await prisma.campaignRecipientActivity.upsert({
            where: {
              campaignId_emailHash: {
                campaignId,
                emailHash: hashRecipientEmail(recipientEmail),
              },
            },
            update: {
              email: recipientEmail,
              sender: normalizeEmailAddress(activeFrom),
              sentAt: new Date(),
            },
            create: {
              campaignId,
              email: recipientEmail,
              emailHash: hashRecipientEmail(recipientEmail),
              sender: normalizeEmailAddress(activeFrom),
              sentAt: new Date(),
            },
          });
          markWarmupSent(smtpAccount.senderKey);
          consecutiveFailures = 0;
          accountFailures.set(smtpAccount.id, Math.max(0, (accountFailures.get(smtpAccount.id) ?? 0) - 1));
        } else {
          failedCount++;
          processedInRun++;
          consecutiveFailures++;
          accountFailures.set(smtpAccount.id, (accountFailures.get(smtpAccount.id) ?? 0) + 1);
          const failedEmail = contact.email.trim().toLowerCase();
          if (isHardBounceError(lastErrorMessage)) {
            if (!bouncedEmails.has(failedEmail)) {
              bouncedEmails.add(failedEmail);
              bounceCount++;
            }
          }
          failedRecipients.push({
            email: failedEmail,
            reason: lastErrorMessage?.slice(0, 500) || null,
          });
        }

        // Update progress every 10 emails
        if (processedInRun % 10 === 0 || processedInRun === runTotalContacts) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { sentCount, failedCount, bounceCount },
          });
          await job.updateProgress(
            Math.round((processedInRun / runTotalContacts) * 100),
          );
        }

        // Abort on too many consecutive failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[Worker] Campaign ${campaignId}: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, aborting`);
          stoppedByConsecutiveFailures = true;
          break;
        }

        // Throttle delay between emails
        await sleep(randomDelay(DELAY_MIN_MS, DELAY_MAX_MS));
      }

      if (stoppedByWarmup) {
        break;
      }
      if (stoppedByConsecutiveFailures) {
        break;
      }
      offset += contacts.length;

      // Batch pause
      if (offset < runEndOffset) {
        await sleep(BATCH_PAUSE_MS);
      }
    }

    if (resolvedPool.length > 0 && accountFailures.size > 0) {
      const poolIds = resolvedPool.map((item) => item.id);
      for (const accountId of poolIds) {
        const failures = accountFailures.get(accountId) ?? 0;
        if (failures <= 0) continue;
        await prisma.desktopSmtpPoolAccount.updateMany({
          where: { id: accountId, desktopUserId },
          data: {
            failCount: { increment: failures },
            ...(failures >= MAX_CONSECUTIVE_FAILURES ? { active: false } : {}),
          },
        });
      }
    }

    if (bouncedEmails.size > 0) {
      await prisma.unsubscribedEmail.createMany({
        data: Array.from(bouncedEmails).map((email) => ({
          email,
          source: "bounce",
          desktopUserId,
        })),
        skipDuplicates: true,
      });
    }

    if (failedRecipients.length > 0) {
      await prisma.campaignFailedRecipient.createMany({
        data: failedRecipients.map((item) => ({
          campaignId,
          email: item.email,
          reason: item.reason,
        })),
        skipDuplicates: true,
      });
    }

    if (WARMUP_ENABLED && warmupTouched.size > 0) {
      for (const senderKey of warmupTouched) {
        const state = warmupState.get(senderKey);
        if (!state) continue;
        await prisma.desktopWarmupSender.upsert({
          where: {
            desktopUserId_senderKey: {
              desktopUserId,
              senderKey,
            },
          },
          update: {
            firstSeenAt: state.firstSeenAt,
            lastSentDate: state.lastSentDate,
            sentToday: state.sentToday,
            totalSent: state.totalSent,
          },
          create: {
            desktopUserId,
            senderKey,
            firstSeenAt: state.firstSeenAt,
            lastSentDate: state.lastSentDate,
            sentToday: state.sentToday,
            totalSent: state.totalSent,
          },
        });
      }
    }

    // 6. Finalize campaign status
    if (stoppedByConsecutiveFailures) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "FAILED",
          sentCount,
          failedCount,
          bounceCount,
          completedAt: new Date(),
        },
      });
    } else if (isDailyRun) {
      const newOffset = Math.min(totalEligibleContacts, runSliceOffset + processedInRun);
      const isFinished = newOffset >= totalEligibleContacts;
      if (isFinished) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "COMPLETED",
            totalCount: campaign.dailyTotalCount ?? totalEligibleContacts,
            sentCount,
            failedCount,
            bounceCount,
            dailySentOffset: newOffset,
            scheduledAt: null,
            completedAt: new Date(),
          },
        });
      } else {
        const nextRunAt = nextDailyRunAfter(
          campaign.scheduledAt ?? new Date(),
          campaign.dailySendTime,
        );
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "DRAFT",
            totalCount: campaign.dailyTotalCount ?? totalEligibleContacts,
            sentCount,
            failedCount,
            bounceCount,
            dailySentOffset: newOffset,
            scheduledAt: nextRunAt,
            completedAt: null,
          },
        });
      }
    } else {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: stoppedByWarmup ? "FAILED" : "COMPLETED",
          sentCount,
          failedCount,
          bounceCount,
          completedAt: new Date(),
        },
      });
    }

    console.log(
      `[Worker] Campaign ${campaignId} completed run: ${processedInRun} processed, ${sentCount} sent total, ${failedCount} failed total`,
    );
  } catch (err) {
    console.error(`[Worker] Campaign ${campaignId} error:`, err);

    // Mark as FAILED
    await prisma.campaign
      .update({
        where: { id: campaignId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
        },
      })
      .catch(() => {}); // best-effort

    throw err; // re-throw so BullMQ records the failure
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// Worker Lifecycle
// ============================================

let worker: Worker<CampaignSendJobData> | null = null;

export function startCampaignWorker(): Worker<CampaignSendJobData> | null {
  if (worker) return worker;

  const connection = getRedisConnection();
  if (!connection) {
    console.error("[Campaign Worker] Cannot start: REDIS_URL not configured");
    return null;
  }

  worker = new Worker<CampaignSendJobData>(
    CAMPAIGN_QUEUE_NAME,
    processCampaignSend,
    {
      connection,
      concurrency: 1, // one campaign at a time per worker
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Campaign Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Campaign Worker] Job ${job?.id} failed:`, err.message);
  });

  console.log("[Campaign Worker] Started, waiting for jobs...");
  return worker;
}

export async function stopCampaignWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log("[Campaign Worker] Stopped");
  }
}
