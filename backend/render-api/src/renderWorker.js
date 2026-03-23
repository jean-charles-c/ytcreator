/**
 * RenderWorker — Background job processor.
 *
 * Polls the job store for queued jobs and processes them
 * through the RemotionRenderService. Updates job status
 * throughout the lifecycle: queued → processing → completed/failed.
 */

import { renderJob } from "./renderService.js";

const POLL_INTERVAL_MS = parseInt(process.env.RENDER_POLL_INTERVAL_MS || "5000", 10);
const MAX_CONCURRENT = parseInt(process.env.RENDER_MAX_CONCURRENT || "1", 10);
const PUBLIC_RENDER_URL = process.env.PUBLIC_RENDER_URL || "";

let activeCount = 0;

/**
 * Start the background worker loop.
 * @param {import('./jobStore.js').JobStore} store
 */
export function startWorker(store) {
  console.log(`[Worker] Started — polling every ${POLL_INTERVAL_MS}ms, max concurrent: ${MAX_CONCURRENT}`);

  setInterval(async () => {
    if (activeCount >= MAX_CONCURRENT) return;

    try {
      const jobs = await store.list(null);
      const queued = jobs.filter((j) => j.status === "queued");
      if (queued.length === 0) return;

      // Process oldest first
      const job = queued[queued.length - 1];
      activeCount++;

      console.log(`[Worker] Processing job ${job.id} (${queued.length} in queue)`);

      // Update status to processing
      job.status = "processing";
      job.updatedAt = new Date().toISOString();
      await store.save(job);

      try {
        const outputPath = await renderJob(job);

        // Build result URL
        const resultUrl = PUBLIC_RENDER_URL
          ? `${PUBLIC_RENDER_URL}/renders/${job.id}.mp4`
          : outputPath;

        job.status = "completed";
        job.resultUrl = resultUrl;
        job.errorMessage = null;
        job.updatedAt = new Date().toISOString();
        await store.save(job);

        console.log(`[Worker] Job ${job.id} completed → ${resultUrl}`);
      } catch (err) {
        console.error(`[Worker] Job ${job.id} failed:`, err);

        job.status = "failed";
        job.errorMessage = err.message || "Unknown render error";
        job.updatedAt = new Date().toISOString();
        await store.save(job);
      } finally {
        activeCount--;
      }
    } catch (err) {
      console.error("[Worker] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}
