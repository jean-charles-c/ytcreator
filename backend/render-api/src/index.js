/**
 * RenderJobsAPI — Express backend for video render job management.
 * Includes Remotion render worker for background processing.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "crypto";
import path from "path";
import { JobStore } from "./jobStore.js";
import { validateCreatePayload } from "./validation.js";
import { initRenderer, shutdownRenderer } from "./renderService.js";
import { startWorker } from "./renderWorker.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);
const API_KEY = process.env.VIDEO_PIPELINE_API_KEY;
const WEBHOOK_SECRET = process.env.OVH_RENDER_WEBHOOK_SECRET;
const STORAGE_PATH = process.env.RENDER_JOBS_STORAGE_PATH || "./data/jobs";
const OUTPUT_DIR = process.env.REMOTION_OUTPUT_DIR || "./data/renders";
const ENABLE_RENDERER = process.env.ENABLE_RENDERER !== "false";

const store = new JobStore(STORAGE_PATH);

// ── Middleware ────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Secret"],
}));
app.use(express.json({ limit: "2mb" }));

// Serve rendered files
app.use("/renders", express.static(path.resolve(OUTPUT_DIR)));

// ── Auth middleware ───────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!API_KEY) return next();
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid or missing API key" });
  }
  next();
}

function requireWebhookSecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next();
  const secret = req.headers["x-webhook-secret"];
  if (secret !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid webhook secret" });
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "render-jobs-api",
    version: "2.0.0",
    renderer: ENABLE_RENDERER ? "active" : "disabled",
    timestamp: new Date().toISOString(),
    jobCount: store.count(),
  });
});

app.post("/render-jobs", requireAuth, async (req, res) => {
  try {
    const validation = validateCreatePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: "Invalid payload", details: validation.errors });
    }

    const job = {
      id: randomUUID(),
      projectId: req.body.projectId,
      videoPromptIds: req.body.videoPromptIds,
      status: "queued",
      payload: req.body.payload ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: null,
      resultUrl: null,
    };

    await store.save(job);
    res.status(201).json(job);
  } catch (err) {
    console.error("[POST /render-jobs] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/render-jobs/:id", requireAuth, async (req, res) => {
  try {
    const job = await store.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    res.json(job);
  } catch (err) {
    console.error("[GET /render-jobs/:id] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/render-jobs", requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;
    const jobs = await store.list(projectId || null);
    res.json({ jobs, total: jobs.length });
  } catch (err) {
    console.error("[GET /render-jobs] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/render-jobs/:id/status", requireWebhookSecret, async (req, res) => {
  try {
    const { status, errorMessage, resultUrl } = req.body;
    const validStatuses = ["queued", "processing", "failed", "completed"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }
    const job = await store.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });

    job.status = status;
    job.updatedAt = new Date().toISOString();
    if (errorMessage !== undefined) job.errorMessage = errorMessage;
    if (resultUrl !== undefined) job.resultUrl = resultUrl;

    await store.save(job);
    res.json(job);
  } catch (err) {
    console.error("[PATCH /render-jobs/:id/status] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Download endpoint for rendered videos
app.get("/render-jobs/:id/download", requireAuth, async (req, res) => {
  try {
    const job = await store.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    if (job.status !== "completed") {
      return res.status(409).json({ error: "Job not completed", status: job.status });
    }
    const filePath = path.resolve(OUTPUT_DIR, `${job.id}.mp4`);
    res.download(filePath, `render-${job.id}.mp4`);
  } catch (err) {
    console.error("[GET /render-jobs/:id/download] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Start ─────────────────────────────────────────────────────────

async function start() {
  if (ENABLE_RENDERER) {
    try {
      console.log("[Startup] Initializing Remotion renderer...");
      await initRenderer();
      startWorker(store);
      console.log("[Startup] Render worker started");
    } catch (err) {
      console.error("[Startup] Renderer init failed:", err.message);
      console.log("[Startup] API will run without automatic rendering");
    }
  } else {
    console.log("[Startup] Renderer disabled (ENABLE_RENDERER=false)");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎬 RenderJobsAPI v2 running on port ${PORT}`);
    console.log(`   Storage: ${STORAGE_PATH}`);
    console.log(`   Renders: ${OUTPUT_DIR}`);
    console.log(`   Auth: ${API_KEY ? "enabled" : "disabled (dev mode)"}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Shutdown] Closing renderer...");
  await shutdownRenderer();
  process.exit(0);
});

start();
