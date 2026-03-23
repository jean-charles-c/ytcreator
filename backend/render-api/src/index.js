/**
 * RenderJobsAPI — Minimal Express backend for video render job management.
 * Designed to run on OVH (Docker). No Remotion yet (Étape 9).
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { JobStore } from "./jobStore.js";
import { validateCreatePayload } from "./validation.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);
const API_KEY = process.env.VIDEO_PIPELINE_API_KEY;
const WEBHOOK_SECRET = process.env.OVH_RENDER_WEBHOOK_SECRET;
const STORAGE_PATH = process.env.RENDER_JOBS_STORAGE_PATH || "./data/jobs";

const store = new JobStore(STORAGE_PATH);

// ── Middleware ────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Secret"],
}));
app.use(express.json({ limit: "2mb" }));

// ── Auth middleware ───────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!API_KEY) {
    // No key configured → skip auth (dev mode)
    return next();
  }
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

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "render-jobs-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    jobCount: store.count(),
  });
});

// Create a render job
app.post("/render-jobs", requireAuth, async (req, res) => {
  try {
    const validation = validateCreatePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid payload",
        details: validation.errors,
      });
    }

    /** @type {import('./types.js').RenderJob} */
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

// Get a render job by ID
app.get("/render-jobs/:id", requireAuth, async (req, res) => {
  try {
    const job = await store.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Not found", message: `Job ${req.params.id} not found` });
    }
    res.json(job);
  } catch (err) {
    console.error("[GET /render-jobs/:id] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List jobs for a project
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

// Update job status (webhook from render pipeline or internal)
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
    if (!job) {
      return res.status(404).json({ error: "Not found" });
    }

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

// ── Start ─────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎬 RenderJobsAPI running on port ${PORT}`);
  console.log(`   Storage: ${STORAGE_PATH}`);
  console.log(`   Auth: ${API_KEY ? "enabled" : "disabled (dev mode)"}`);
});
