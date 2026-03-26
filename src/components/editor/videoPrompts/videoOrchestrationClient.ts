/**
 * videoOrchestrationClient — Frontend client for the video-orchestrator edge function.
 *
 * Provides typed methods for submitting generations, polling status,
 * and managing the async lifecycle from the UI layer.
 */

import { supabase } from "@/integrations/supabase/client";
import type { VideoProvider, VideoGenerationStatus } from "./videoGeneration.types";

// ── Types ─────────────────────────────────────────────────────────

export interface SubmitGenerationParams {
  generationId: string;
  projectId: string;
  sourceType: "gallery" | "external_upload";
  sourceShotId?: string | null;
  sourceUploadId?: string | null;
  sourceImageUrl: string;
  provider: VideoProvider;
  promptUsed: string;
  negativePrompt?: string;
  durationSec: number;
  aspectRatio: string;
}

export interface SubmitGenerationResult {
  success: boolean;
  generationId: string;
  providerJobId: string | null;
  status: VideoGenerationStatus;
  errorMessage?: string | null;
  providerErrorCode?: string | number | null;
}

export interface PollGenerationResult {
  generationId: string;
  status: VideoGenerationStatus;
  resultVideoUrl?: string | null;
  resultThumbnailUrl?: string | null;
  errorMessage?: string | null;
}

// ── Client ────────────────────────────────────────────────────────

async function callOrchestrator<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("video-orchestrator", {
    body,
  });

  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;

    if (response instanceof Response) {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          message = parsed.error ?? text;
        } catch {
          message = text;
        }
      }
    }

    throw new Error(message);
  }

  return data as T;
}

/** Submit a new video generation to a provider */
export async function submitVideoGeneration(
  params: SubmitGenerationParams,
): Promise<SubmitGenerationResult> {
  return callOrchestrator<SubmitGenerationResult>({
    action: "submit",
    ...params,
  });
}

/** Poll the status of a video generation */
export async function pollVideoGeneration(
  generationId: string,
): Promise<PollGenerationResult> {
  return callOrchestrator<PollGenerationResult>({
    action: "poll",
    generationId,
  });
}

// ── Polling loop helper ──────────────────────────────────────────

export interface PollOptions {
  /** Polling interval in ms (default 5000) */
  intervalMs?: number;
  /** Max polling attempts (default 120 = 10 min at 5s) */
  maxAttempts?: number;
  /** Callback on each poll */
  onProgress?: (result: PollGenerationResult) => void;
}

/**
 * Poll until a generation reaches a terminal status (completed or error).
 * Returns the final result.
 */
export async function pollUntilDone(
  generationId: string,
  options: PollOptions = {},
): Promise<PollGenerationResult> {
  const interval = options.intervalMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 120;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await pollVideoGeneration(generationId);
    options.onProgress?.(result);

    if (result.status === "completed" || result.status === "error") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return {
    generationId,
    status: "error",
    errorMessage: "Polling timeout — generation took too long",
  };
}
