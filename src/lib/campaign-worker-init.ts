import { startCampaignWorker } from "./campaign-worker";

declare global {
  var __freelaCampaignWorkerStarted: boolean | undefined;
}

/**
 * Start campaign worker lazily inside the app process.
 * Safe to call many times; worker starts once per process.
 */
export function ensureCampaignWorkerStarted(): boolean {
  if (globalThis.__freelaCampaignWorkerStarted) return true;

  const worker = startCampaignWorker();
  const started = Boolean(worker);
  if (started) {
    globalThis.__freelaCampaignWorkerStarted = true;
  }
  return started;
}
