/**
 * renderPipelineClient — Communicates with the OVH RenderJobsAPI
 * via a Supabase edge function proxy to avoid exposing secrets.
 */

import { supabase } from "@/integrations/supabase/client";
import type { VideoPrompt } from "./types";

// ── Types ────────────────────────────────────────────────────────

export interface RenderJob {
  id: string;
  projectId: string;
  videoPromptIds: string[];
  status: "queued" | "processing" | "failed" | "completed";
  payload: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  resultUrl: string | null;
}

export interface SubmitRenderResult {
  success: boolean;
  job?: RenderJob;
  error?: string;
}

// ── API calls via edge function ──────────────────────────────────

/**
 * Submit one or more VideoPrompts as a render job.
 */
export async function submitRenderJob(
  projectId: string,
  prompts: VideoPrompt[],
): Promise<SubmitRenderResult> {
  try {
    // Build the payload from the first prompt (single) or composite
    const payload = prompts.length === 1
      ? buildSinglePayload(prompts[0])
      : buildBatchPayload(prompts);

    const { data, error } = await supabase.functions.invoke("render-proxy", {
      body: {
        action: "create",
        projectId,
        videoPromptIds: prompts.map((p) => p.id),
        payload,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, job: data as RenderJob };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

/**
 * Poll the status of a render job.
 */
export async function getRenderJobStatus(jobId: string): Promise<RenderJob | null> {
  try {
    const { data, error } = await supabase.functions.invoke("render-proxy", {
      body: {
        action: "status",
        jobId,
      },
    });

    if (error) {
      console.error("getRenderJobStatus error:", error);
      return null;
    }

    return data as RenderJob;
  } catch {
    return null;
  }
}

// ── Payload builders ─────────────────────────────────────────────

function buildSinglePayload(prompt: VideoPrompt): Record<string, any> {
  return {
    prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt,
    sceneTitle: prompt.sceneTitle,
    narrativeFragment: prompt.narrativeFragment,
    durationSec: prompt.durationSec,
    aspectRatio: prompt.aspectRatio,
    style: prompt.style,
    cameraMovement: prompt.cameraMovement,
    sceneMotion: prompt.sceneMotion,
    mood: prompt.mood,
    renderConstraints: prompt.renderConstraints,
  };
}

function buildBatchPayload(prompts: VideoPrompt[]): Record<string, any> {
  return {
    mode: "batch",
    segments: prompts.map((p) => buildSinglePayload(p)),
    totalDurationSec: prompts.reduce((sum, p) => sum + p.durationSec, 0),
  };
}
