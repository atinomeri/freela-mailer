import { ensureCampaignSchedulerStarted } from "@/lib/campaign-scheduler";
import { ensureCampaignWorkerStarted } from "@/lib/campaign-worker-init";

declare global {
  var __freelaCampaignRuntimeStarted: boolean | undefined;
  var __freelaCampaignRuntimeDisabledLogged: boolean | undefined;
}

/**
 * Whether the Next.js app process itself should run the BullMQ worker and
 * scheduler in-process. When a standalone `mailer-worker` container is
 * deployed, set `ENABLE_IN_PROCESS_CAMPAIGN_WORKER=false` so the web process
 * only enqueues jobs and never consumes them. Default stays `true` to preserve
 * current single-container behavior (safe rollback path).
 */
function isInProcessRuntimeEnabled(): boolean {
  const raw = (process.env.ENABLE_IN_PROCESS_CAMPAIGN_WORKER ?? "").trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return true;
}

/**
 * Ensure campaign worker and scheduler are running in this process.
 * No-ops (and returns false) when the in-process runtime is disabled via
 * ENABLE_IN_PROCESS_CAMPAIGN_WORKER=false.
 */
export function ensureCampaignRuntimeStarted(): boolean {
  if (!isInProcessRuntimeEnabled()) {
    if (!globalThis.__freelaCampaignRuntimeDisabledLogged) {
      globalThis.__freelaCampaignRuntimeDisabledLogged = true;
      console.log(
        "[Campaign Runtime] In-process worker/scheduler disabled via ENABLE_IN_PROCESS_CAMPAIGN_WORKER=false",
      );
    }
    return false;
  }

  if (globalThis.__freelaCampaignRuntimeStarted) return true;

  const workerStarted = ensureCampaignWorkerStarted();
  const schedulerStarted = ensureCampaignSchedulerStarted();
  const started = workerStarted || schedulerStarted;

  if (started) {
    globalThis.__freelaCampaignRuntimeStarted = true;
  }

  return started;
}

