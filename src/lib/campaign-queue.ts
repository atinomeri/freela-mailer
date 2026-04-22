/**
 * Campaign Sending Queue — BullMQ-based background job processing
 *
 * Separate from the general `job-queue.ts` because campaign sending
 * has its own concurrency, throttling, and retry semantics.
 */

import { Queue, type ConnectionOptions } from "bullmq";
import { logInfo, logDebug } from "./logger";
import { requireMailerPublicUrl } from "./mailer-env";

// ============================================
// Job Types
// ============================================

export interface CampaignSendJobData {
  campaignId: string;
  desktopUserId: string;
  dailyBatch?: boolean;
  sliceOffset?: number;
  sliceLimit?: number;
}

// ============================================
// Queue Setup
// ============================================

const QUEUE_NAME = "campaign-sending";

function getRedisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password || undefined,
    };
  } catch {
    return null;
  }
}

let queue: Queue<CampaignSendJobData> | null = null;

export function getCampaignQueue(): Queue<CampaignSendJobData> | null {
  if (queue) return queue;

  const connection = getRedisConnection();
  if (!connection) {
    logDebug("Campaign queue disabled: REDIS_URL not configured");
    return null;
  }

  queue = new Queue<CampaignSendJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 200 },
      attempts: 1, // campaign-level retry is handled inside the worker
    },
  });

  logInfo("Campaign queue initialized", { queueName: QUEUE_NAME });
  return queue;
}

// ============================================
// Producer
// ============================================

export async function enqueueCampaignSend(
  campaignId: string,
  desktopUserId: string,
  options?: Pick<CampaignSendJobData, "dailyBatch" | "sliceOffset" | "sliceLimit">,
): Promise<string | null> {
  // Preflight: refuse to enqueue if the forever-host URL is missing in prod.
  // Otherwise the worker would build tracking/unsub links with an empty base
  // and ship broken emails. Throws — caller surfaces a 500 which is correct.
  requireMailerPublicUrl();

  const q = getCampaignQueue();
  if (!q) return null;

  const job = await q.add(
    "send-campaign",
    { campaignId, desktopUserId, ...options },
    { jobId: `campaign-${campaignId}` }, // prevent duplicate jobs
  );

  logInfo("Campaign enqueued", { campaignId, jobId: job.id });
  return job.id ?? null;
}

export { QUEUE_NAME as CAMPAIGN_QUEUE_NAME };
export { getRedisConnection };
