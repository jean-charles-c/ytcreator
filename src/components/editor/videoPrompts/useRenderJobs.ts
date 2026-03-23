/**
 * useRenderJobs — Hook for managing render job submissions and polling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  submitRenderJob,
  getRenderJobStatus,
  type RenderJob,
  type SubmitRenderResult,
} from "./renderPipelineClient";
import type { VideoPrompt } from "./types";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 4000;

export function useRenderJobs(projectId: string) {
  const [jobs, setJobs] = useState<Map<string, RenderJob>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      for (const timer of pollTimers.current.values()) {
        clearInterval(timer);
      }
    };
  }, []);

  const startPolling = useCallback((jobId: string) => {
    if (pollTimers.current.has(jobId)) return;

    const timer = setInterval(async () => {
      const job = await getRenderJobStatus(jobId);
      if (!job) return;

      setJobs((prev) => {
        const next = new Map(prev);
        next.set(jobId, job);
        return next;
      });

      // Stop polling on terminal states
      if (job.status === "completed" || job.status === "failed") {
        clearInterval(pollTimers.current.get(jobId));
        pollTimers.current.delete(jobId);

        if (job.status === "completed") {
          toast.success("Rendu vidéo terminé !");
        } else {
          toast.error(`Rendu échoué : ${job.errorMessage || "Erreur inconnue"}`);
        }
      }
    }, POLL_INTERVAL_MS);

    pollTimers.current.set(jobId, timer);
  }, []);

  const submit = useCallback(
    async (prompts: VideoPrompt[]): Promise<SubmitRenderResult> => {
      setSubmitting(true);
      try {
        const result = await submitRenderJob(projectId, prompts);

        if (result.success && result.job) {
          setJobs((prev) => {
            const next = new Map(prev);
            next.set(result.job!.id, result.job!);
            return next;
          });
          startPolling(result.job.id);
          toast.success(`Job de rendu créé (${prompts.length} prompt${prompts.length > 1 ? "s" : ""})`);
        } else {
          toast.error(`Erreur : ${result.error}`);
        }

        return result;
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, startPolling],
  );

  // Get the latest job for a specific prompt
  const getJobForPrompt = useCallback(
    (promptId: string): RenderJob | null => {
      for (const job of jobs.values()) {
        if (job.videoPromptIds.includes(promptId)) return job;
      }
      return null;
    },
    [jobs],
  );

  return {
    jobs,
    submitting,
    submit,
    getJobForPrompt,
    activeJobCount: Array.from(jobs.values()).filter(
      (j) => j.status === "queued" || j.status === "processing",
    ).length,
  };
}
