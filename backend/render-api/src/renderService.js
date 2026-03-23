/**
 * RemotionRenderService — Bridges RenderJob → Remotion rendering.
 *
 * Bundles the composition once at startup, then renders individual
 * jobs by passing VideoPrompt data as inputProps.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPOSITION_ID = process.env.REMOTION_COMPOSITION_ID || "video-prompt";
const OUTPUT_DIR = process.env.REMOTION_OUTPUT_DIR || "./data/renders";
const TIMEOUT_MS = parseInt(process.env.REMOTION_TIMEOUT_MS || "300000", 10);
const SERVE_URL = process.env.REMOTION_SERVE_URL; // If pre-bundled externally

let _bundledUrl = null;
let _browser = null;

/**
 * Initialize: bundle the composition and open a browser instance.
 * Call once at startup.
 */
export async function initRenderer() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  if (SERVE_URL) {
    _bundledUrl = SERVE_URL;
    console.log(`[Remotion] Using pre-bundled serve URL: ${SERVE_URL}`);
  } else {
    const entryPoint = path.resolve(__dirname, "../remotion-composition/index.ts");
    console.log(`[Remotion] Bundling composition from ${entryPoint}...`);
    _bundledUrl = await bundle({
      entryPoint,
      webpackOverride: (config) => config,
    });
    console.log(`[Remotion] Bundle ready: ${_bundledUrl}`);
  }

  _browser = await openBrowser("chrome", {
    chromiumOptions: {
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    },
  });
  console.log("[Remotion] Browser instance ready");
}

/**
 * Render a single job. Returns the output file path.
 *
 * @param {import('./types.js').RenderJob} job
 * @returns {Promise<string>} Output file path
 */
export async function renderJob(job) {
  if (!_bundledUrl || !_browser) {
    throw new Error("Renderer not initialized. Call initRenderer() first.");
  }

  const outputPath = path.join(OUTPUT_DIR, `${job.id}.mp4`);

  // Build inputProps from job payload
  const inputProps = buildInputProps(job);

  // Select composition with dynamic metadata (duration, dimensions)
  const composition = await selectComposition({
    serveUrl: _bundledUrl,
    id: COMPOSITION_ID,
    inputProps,
    puppeteerInstance: _browser,
    timeoutInMilliseconds: TIMEOUT_MS,
  });

  console.log(`[Remotion] Rendering job ${job.id}: ${composition.durationInFrames} frames @ ${composition.fps}fps (${composition.width}x${composition.height})`);

  await renderMedia({
    composition,
    serveUrl: _bundledUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    puppeteerInstance: _browser,
    timeoutInMilliseconds: TIMEOUT_MS,
    concurrency: 1,
  });

  console.log(`[Remotion] Job ${job.id} rendered → ${outputPath}`);
  return outputPath;
}

/**
 * Gracefully close the browser.
 */
export async function shutdownRenderer() {
  if (_browser) {
    await _browser.close({ silent: false });
    _browser = null;
  }
}

/**
 * Extract Remotion inputProps from a RenderJob payload.
 */
function buildInputProps(job) {
  const p = job.payload || {};
  return {
    prompt: p.prompt ?? "",
    sceneTitle: p.sceneTitle ?? "",
    style: p.style ?? "cinematic",
    mood: p.mood ?? "",
    durationSec: p.durationSec ?? 5,
    aspectRatio: p.aspectRatio ?? "16:9",
    cameraMovement: p.cameraMovement ?? "static",
    sceneMotion: p.sceneMotion ?? "moderate",
    narrativeFragment: p.narrativeFragment ?? "",
  };
}
