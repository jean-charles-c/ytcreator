// BackgroundTasks context – provides background task management
import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  exportTimelineToMp4,
  abortExport,
  type ExportFps,
  type ExportProgress,
} from "@/components/editor/videoExportEngine";
import { exportTimelineToXmlZip } from "@/components/editor/xmlExportEngine";
import type { Timeline, ShotTimepoint } from "@/components/editor/timelineAssembly";
import type { Chapter, ChapterListState } from "@/components/editor/chapterTypes";
import { buildManifest } from "@/components/editor/visualPromptTypes";
import { buildManifestTiming } from "@/components/editor/manifestTiming";

// ─── Types ──────────────────────────────────────────────────────────
export type TaskType = "script" | "segmentation" | "storyboard" | "export-mp4" | "export-xml" | "image-gen";
export type TaskStatus = "running" | "done" | "error";

export interface BackgroundTask {
  projectId: string;
  type: TaskType;
  status: TaskStatus;
  error?: string;
  /** Script streaming text (live) */
  streamedText?: string;
  /** Storyboard progress */
  completedScenes?: number;
  totalScenes?: number;
  /** Export progress */
  exportProgress?: ExportProgress;
  /** Image gen progress */
  completedShots?: number;
  successShots?: number;
  totalShots?: number;
}

type Listener = (task: BackgroundTask) => void;

export interface ExportMp4Params {
  projectId: string;
  timeline: Timeline;
  fps: ExportFps;
}

export interface ExportXmlParams {
  projectId: string;
  timeline: Timeline;
  fps: ExportFps;
  musicTracks?: { url: string; name: string }[];
}

export interface ImageGenParams {
  projectId: string;
  shotIds: string[];
  model: string;
  aspectRatio: string;
}

interface BackgroundTasksContextValue {
  tasks: Record<string, BackgroundTask>;
  startScriptGeneration: (params: ScriptGenParams) => void;
  startSegmentation: (params: SegmentationParams) => void;
  startStoryboard: (params: StoryboardParams) => void;
  startExportMp4: (params: ExportMp4Params) => void;
  startExportXml: (params: ExportXmlParams) => void;
  startImageGen: (params: ImageGenParams) => void;
  stopTask: (projectId: string, type: TaskType) => void;
  getTask: (projectId: string, type: TaskType) => BackgroundTask | undefined;
  subscribe: (projectId: string, type: TaskType, listener: Listener) => () => void;
}

export interface ScriptGenParams {
  projectId: string;
  analysis: any;
  extractedText: string;
  scriptLanguage: string;
  targetChars: number;
  narrativeStyle?: string;
  existingScript?: string | null;
  isRegenerate?: boolean;
}

export interface SegmentationParams {
  projectId: string;
}

export interface StoryboardParams {
  projectId: string;
  sceneIds: string[];
}

const BackgroundTasksContext = createContext<BackgroundTasksContextValue | null>(null);

// ─── SSE helpers (duplicated from PdfDocumentaryTab for independence) ─
const extractTextFromStreamPayload = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as any;
  if (typeof data.error === "string") throw new Error(data.error);

  const normalizeContent = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      return (part as any).text ?? (part as any).content ?? "";
    }).join("");
  };

  const choice = data.choices?.[0];
  const deltaText = normalizeContent(choice?.delta?.content);
  if (deltaText) return deltaText;
  const messageText = normalizeContent(choice?.message?.content);
  if (messageText) return messageText;
  if (typeof choice?.text === "string") return choice.text;
  if (Array.isArray(data.output)) {
    return data.output.flatMap((item: any) => item.content ?? []).map((part: any) => part.text ?? "").join("");
  }
  return "";
};

const readSseEventData = (rawEvent: string): string | null => {
  const dataLines = rawEvent.split("\n").map((l) => l.trimEnd()).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  return dataLines.join("\n").trim();
};

// ─── Provider ───────────────────────────────────────────────────────
export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, BackgroundTask>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const listeners = useRef<Record<string, Set<Listener>>>({});

  const taskKey = (projectId: string, type: TaskType) => `${projectId}:${type}`;

  const updateTask = (key: string, update: Partial<BackgroundTask>) => {
    setTasks((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const updated = { ...existing, ...update };
      // Notify listeners
      listeners.current[key]?.forEach((fn) => fn(updated));
      return { ...prev, [key]: updated };
    });
  };

  const setTask = (key: string, task: BackgroundTask) => {
    setTasks((prev) => ({ ...prev, [key]: task }));
    listeners.current[key]?.forEach((fn) => fn(task));
  };

  const removeTask = (key: string) => {
    setTasks((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    delete abortControllers.current[key];
  };

  const subscribe = useCallback((projectId: string, type: TaskType, listener: Listener) => {
    const key = taskKey(projectId, type);
    if (!listeners.current[key]) listeners.current[key] = new Set();
    listeners.current[key].add(listener);
    return () => {
      listeners.current[key]?.delete(listener);
    };
  }, []);

  const getTask = useCallback((projectId: string, type: TaskType) => {
    return tasks[taskKey(projectId, type)];
  }, [tasks]);

  const stopTask = useCallback((projectId: string, type: TaskType) => {
    const key = taskKey(projectId, type);
    abortControllers.current[key]?.abort();
    removeTask(key);
  }, []);

  // ─── Script Generation ─────────────────────────────────────────────
  const startScriptGeneration = useCallback((params: ScriptGenParams) => {
    const key = taskKey(params.projectId, "script");
    // Abort any existing
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "script",
      status: "running",
      streamedText: "",
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;

        // Step 1: Generate documentary structure
        const { data: structData, error: structError } = await supabase.functions.invoke("documentary-structure", {
          body: { analysis: params.analysis, text: params.extractedText },
        });
        if (ac.signal.aborted) return;
        if (structError || structData?.error) throw new Error("Erreur de génération de la structure");
        const sections = structData.sections;

        // Save structure to project_scriptcreator_state
        await (supabase as any).from("project_scriptcreator_state").update({
          doc_structure: sections,
        }).eq("project_id", params.projectId);

        // Step 2: Stream script
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-script`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "x-supabase-client-platform": "web",
            },
            body: JSON.stringify({
              analysis: params.analysis,
              structure: sections,
              text: params.extractedText,
              language: params.scriptLanguage,
              targetChars: params.targetChars,
              narrativeStyle: params.narrativeStyle,
            }),
            signal: ac.signal,
          }
        );
        if (!resp.ok || !resp.body) throw new Error("Erreur de génération du script");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let done = false;

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });

          let eventBoundaryIndex: number;
          while ((eventBoundaryIndex = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, eventBoundaryIndex);
            buffer = buffer.slice(eventBoundaryIndex + 2);
            if (!rawEvent.trim()) continue;
            if (rawEvent.split("\n").every((line) => line.trimStart().startsWith(":"))) continue;
            const eventData = readSseEventData(rawEvent);
            if (!eventData) continue;
            if (eventData === "[DONE]") { done = true; break; }

            try {
              const parsed = JSON.parse(eventData);
              const content = extractTextFromStreamPayload(parsed);
              if (content) {
                full += content;
                const displayText = full.replace(/<plan>[\s\S]*?<\/plan>\s*/gi, "").replace(/<plan>[\s\S]*/gi, "");
                updateTask(key, { streamedText: displayText });
              }
            } catch { /* skip bad chunk */ }
          }
        }

        // Process trailing buffer
        if (buffer.trim()) {
          const eventData = readSseEventData(buffer);
          if (eventData && eventData !== "[DONE]") {
            try {
              const parsed = JSON.parse(eventData);
              const content = extractTextFromStreamPayload(parsed);
              if (content) full += content;
            } catch { /* skip */ }
          }
        }

        full = full.replace(/<plan>[\s\S]*?<\/plan>\s*/gi, "").trim();
        if (!full.trim()) throw new Error("Le flux AI n'a retourné aucun texte exploitable.");

        // Save to Supabase
        await (supabase as any).from("project_scriptcreator_state").update({
          generated_script: full,
          doc_structure: sections,
        }).eq("project_id", params.projectId);

        // Also update narration on the project
        await supabase.from("projects").update({ narration: full }).eq("id", params.projectId);

        updateTask(key, { status: "done", streamedText: full });
        toast.success(`Script généré — ${full.length.toLocaleString()} caractères`);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Génération du script annulée");
          removeTask(key);
          return;
        }
        console.error("Background script generation error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de génération du script");
      }
    })();
  }, []);

  // ─── Segmentation ──────────────────────────────────────────────────
  const startSegmentation = useCallback((params: SegmentationParams) => {
    const key = taskKey(params.projectId, "segmentation");
    // Skip if already running
    if (tasks[key]?.status === "running") return;
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "segmentation",
      status: "running",
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/segment-narration`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ project_id: params.projectId }),
            signal: ac.signal,
          }
        );
        const data = await response.json();
        if (!response.ok || data?.error) throw new Error(data?.error || "Erreur de segmentation");

        updateTask(key, { status: "done" });
        const { data: sceneData } = await supabase.from("scenes").select("*").eq("project_id", params.projectId).order("scene_order", { ascending: true });
        toast.success(`${sceneData?.length ?? 0} scènes générées`);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Segmentation annulée");
          removeTask(key);
          return;
        }
        console.error("Background segmentation error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de segmentation");
      }
    })();
  }, []);

  // ─── Storyboard ────────────────────────────────────────────────────
  const startStoryboard = useCallback((params: StoryboardParams) => {
    const key = taskKey(params.projectId, "storyboard");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "storyboard",
      status: "running",
      completedScenes: 0,
      totalScenes: params.sceneIds.length,
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;

        // Delete existing shots
        await supabase.from("shots").delete().eq("project_id", params.projectId);

        let totalShots = 0;
        const failedSceneIds: string[] = [];

        for (let i = 0; i < params.sceneIds.length; i++) {
          if (ac.signal.aborted) return;
          const sid = params.sceneIds[i];
          try {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-storyboard`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  "x-supabase-client-platform": "web",
                },
                body: JSON.stringify({ project_id: params.projectId, scene_id: sid }),
                signal: ac.signal,
              }
            );
            const data = await response.json();
            if (!response.ok || data?.error) throw new Error(data?.error || "Erreur");
            totalShots += data?.shots_count ?? 0;
          } catch (sceneError: any) {
            if (sceneError?.name === "AbortError") throw sceneError;
            console.error(`Storyboard scene failed: ${sid}`, sceneError);
            failedSceneIds.push(sid);
          }
          updateTask(key, { completedScenes: i + 1 });
        }

        updateTask(key, { status: "done" });
        if (failedSceneIds.length > 0) {
          toast.warning(`${totalShots} shots générés, ${failedSceneIds.length} scène(s) à relancer`);
        } else {
          toast.success(`${totalShots} shots générés sur ${params.sceneIds.length} scènes`);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Génération des shots annulée");
          removeTask(key);
          return;
        }
        console.error("Background storyboard error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de génération du storyboard");
      }
    })();
  }, []);

  // ─── Export MP4 ────────────────────────────────────────────────────
  const startExportMp4 = useCallback((params: ExportMp4Params) => {
    const key = taskKey(params.projectId, "export-mp4");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "export-mp4",
      status: "running",
      exportProgress: { phase: "loading", percent: 0, message: "Démarrage de l'export MP4…" },
    });

    (async () => {
      try {
        const onProgress = (p: ExportProgress) => {
          if (ac.signal.aborted) return;
          updateTask(key, { exportProgress: p });
        };

        const blob = await exportTimelineToMp4(params.timeline, onProgress, { fps: params.fps });
        if (ac.signal.aborted) return;

        // Upload to storage
        const fileName = `${params.projectId}/${Date.now()}_${params.fps}fps.mp4`;
        const { error: uploadError } = await supabase.storage
          .from("video-exports")
          .upload(fileName, blob, { contentType: "video/mp4" });

        if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("video-exports")
          .getPublicUrl(fileName);

        // Save to DB
        const { data: stateData } = await supabase
          .from("project_scriptcreator_state")
          .select("timeline_state")
          .eq("project_id", params.projectId)
          .single();
        const currentState = (stateData?.timeline_state as any) ?? {};
        const existingExports = Array.isArray(currentState.exports) ? currentState.exports : [];

        const entry = {
          id: crypto.randomUUID(),
          type: "mp4" as const,
          storagePath: fileName,
          publicUrl: urlData.publicUrl,
          date: new Date().toLocaleString("fr-FR"),
          fps: params.fps,
          sizeMb: (blob.size / (1024 * 1024)).toFixed(1),
        };
        const newExports = [entry, ...existingExports];
        await supabase
          .from("project_scriptcreator_state")
          .update({ timeline_state: { ...currentState, exports: newExports } as any })
          .eq("project_id", params.projectId);

        updateTask(key, {
          status: "done",
          exportProgress: { phase: "done", percent: 100, message: "Export MP4 terminé !" },
        });
        toast.success("Export MP4 terminé !");
      } catch (e: any) {
        if (ac.signal.aborted || e?.message === "Export annulé") {
          toast.info("Export MP4 annulé");
          removeTask(key);
          return;
        }
        console.error("Background MP4 export error:", e);
        updateTask(key, {
          status: "error",
          error: e?.message || "Erreur inconnue",
          exportProgress: { phase: "error", percent: 0, message: e?.message || "Erreur inconnue" },
        });
        toast.error("Échec de l'export MP4.");
      }
    })();
  }, []);

  // ─── Export XML ────────────────────────────────────────────────────
  const startExportXml = useCallback((params: ExportXmlParams) => {
    const key = taskKey(params.projectId, "export-xml");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "export-xml",
      status: "running",
      exportProgress: { phase: "preparing", percent: 10, message: "Génération du XML…" },
    });

    (async () => {
      try {
        // Load validated chapters and build manifest timing for deterministic export
        let chapters: Chapter[] | undefined;
        let manifestEntries: import("@/components/editor/manifestTiming").ManifestTimingEntry[] | undefined;

        try {
          const { data: stateData } = await supabase
            .from("project_scriptcreator_state")
            .select("timeline_state")
            .eq("project_id", params.projectId)
            .single();
          const chapterState = (stateData?.timeline_state as any)?.chapterState as ChapterListState | null;
          if (chapterState?.chapters?.length) {
            chapters = chapterState.chapters;
          }
        } catch { /* no chapters — export without markers */ }

        // Build manifest timing from scenes/shots + the exact audio currently selected in the timeline
        try {
          const [{ data: dbScenes }, { data: dbShots }, { data: selectedAudio }] = await Promise.all([
            supabase.from("scenes").select("*").eq("project_id", params.projectId),
            supabase.from("shots").select("*").eq("project_id", params.projectId),
            supabase.from("vo_audio_history").select("*").eq("id", params.timeline.audioTrack.audioId).maybeSingle(),
          ]);

          if (dbScenes?.length && dbShots?.length && selectedAudio) {
            const manifest = buildManifest(params.projectId, dbScenes, dbShots);
            const timepoints = (selectedAudio.shot_timepoints as unknown as ShotTimepoint[] | null) ?? null;
            const duration = selectedAudio.duration_estimate ?? 0;
            const timing = buildManifestTiming(manifest, timepoints, duration);
            if (timing.issues.some((issue) => issue.level === "error") || timing.entries.length === 0) {
              throw new Error(timing.issues[0]?.message ?? "Export XML bloqué — manifest timing exact invalide.");
            }
            manifestEntries = timing.entries;
          } else {
            throw new Error("Export XML bloqué — audio sélectionné introuvable pour construire le manifest timing exact.");
          }
        } catch (error) {
          throw error instanceof Error ? error : new Error("Export XML bloqué — impossible de valider le manifest timing exact.");
        }

        const blob = await exportTimelineToXmlZip(params.timeline, params.fps, (p) => {
          if (ac.signal.aborted) return;
          updateTask(key, {
            exportProgress: {
              phase: p.phase as any,
              percent: p.percent,
              message: p.message,
            },
          });
        }, chapters, manifestEntries, params.musicTracks);
        if (ac.signal.aborted) return;

        const fileName = `${params.projectId}/${Date.now()}_${params.fps}fps.zip`;
        const { error: uploadError } = await supabase.storage
          .from("video-exports")
          .upload(fileName, blob, { contentType: "application/zip" });

        if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("video-exports")
          .getPublicUrl(fileName);

        // Save export entry to DB (preserve existing timeline data)
        const { data: stateData } = await supabase
          .from("project_scriptcreator_state")
          .select("timeline_state")
          .eq("project_id", params.projectId)
          .single();
        const currentState = (stateData?.timeline_state as any) ?? {};
        const existingExports = Array.isArray(currentState.exports) ? currentState.exports : [];

        const entry = {
          id: crypto.randomUUID(),
          type: "xml" as const,
          storagePath: fileName,
          publicUrl: urlData.publicUrl,
          date: new Date().toLocaleString("fr-FR"),
          fps: params.fps,
          sizeMb: (blob.size / (1024 * 1024)).toFixed(2),
        };
        const newExports = [entry, ...existingExports];
        // Only update the exports array, preserve rest of timeline_state
        await supabase
          .from("project_scriptcreator_state")
          .update({ timeline_state: { ...currentState, exports: newExports } as any })
          .eq("project_id", params.projectId);

        updateTask(key, {
          status: "done",
          exportProgress: { phase: "done", percent: 100, message: "Export XML terminé !" },
        });
        toast.success("Export XML terminé !");
      } catch (e: any) {
        if (ac.signal.aborted) {
          toast.info("Export XML annulé");
          removeTask(key);
          return;
        }
        console.error("Background XML export error:", e);
        updateTask(key, {
          status: "error",
          error: e?.message || "Erreur inconnue",
          exportProgress: { phase: "error", percent: 0, message: e?.message || "Erreur inconnue" },
        });
        toast.error("Échec de l'export XML.");
      }
    })();
  }, []);

  // ─── Image Generation (batch) ───────────────────────────────────────
  const startImageGen = useCallback((params: ImageGenParams) => {
    const key = taskKey(params.projectId, "image-gen");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    const total = params.shotIds.length;
    setTask(key, {
      projectId: params.projectId,
      type: "image-gen",
      status: "running",
      completedShots: 0,
      totalShots: total,
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        let count = 0;

        for (let i = 0; i < params.shotIds.length; i++) {
          if (ac.signal.aborted) break;
          if (i > 0) await new Promise((r) => setTimeout(r, 8000));
          if (ac.signal.aborted) break;

          try {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-shot-image`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({
                  shot_id: params.shotIds[i],
                  model: params.model,
                  aspect_ratio: params.aspectRatio,
                }),
                signal: ac.signal,
              }
            );
            const data = await response.json();
            if (response.ok && data.image_url) count++;
          } catch (shotErr: any) {
            if (shotErr?.name === "AbortError") break;
            console.error(`Image gen failed for shot ${params.shotIds[i]}:`, shotErr);
          }
          updateTask(key, { completedShots: i + 1 });
        }

        if (ac.signal.aborted) {
          toast.info(`Génération stoppée — ${count} visuel(s) créé(s)`);
          removeTask(key);
          return;
        }

        updateTask(key, { status: "done", completedShots: total });
        toast.success(`${count} visuel(s) généré(s)`);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Génération des visuels annulée");
          removeTask(key);
          return;
        }
        console.error("Background image gen error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de génération des visuels");
      }
    })();
  }, []);

  return (
    <BackgroundTasksContext.Provider value={{ tasks, startScriptGeneration, startSegmentation, startStoryboard, startExportMp4, startExportXml, startImageGen, stopTask, getTask, subscribe }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

const NOOP = () => {};
const NOOP_UNSUB = () => NOOP;
const FALLBACK: BackgroundTasksContextValue = {
  tasks: {},
  startScriptGeneration: NOOP as any,
  startSegmentation: NOOP as any,
  startStoryboard: NOOP as any,
  startExportMp4: NOOP as any,
  startExportXml: NOOP as any,
  startImageGen: NOOP as any,
  stopTask: NOOP,
  getTask: () => undefined,
  subscribe: NOOP_UNSUB as any,
};

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTasksContext);
  return ctx ?? FALLBACK;
}
