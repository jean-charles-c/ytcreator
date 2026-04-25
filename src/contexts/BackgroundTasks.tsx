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
export type TaskType = "script" | "script-v2" | "revision" | "segmentation" | "storyboard" | "export-mp4" | "export-xml" | "image-gen";
export type TaskStatus = "running" | "done" | "error";

export interface BackgroundTask {
  projectId: string;
  type: TaskType;
  status: TaskStatus;
  error?: string;
  /** Script streaming text (live) */
  streamedText?: string;
  /** v2 intention note (extracted from <intention> block) */
  intentionNote?: string;
  /** Storyboard progress */
  completedScenes?: number;
  totalScenes?: number;
  /** Export progress */
  exportProgress?: ExportProgress;
  /** Image gen progress */
  completedShots?: number;
  successShots?: number;
  totalShots?: number;
  /** Image gen model used */
  imageGenModel?: string;
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
  /** Output quality (1K/2K/4K). Only used when model is a Kie engine (prefix "kie:"). */
  quality?: "1K" | "2K" | "4K";
  /** Maps shotId → effective sensitive level (1-4). Omitted shots have no constraint. */
  sensitiveLevels?: Record<string, number>;
  /** Maps shotId → visual style id. Omitted shots have no style constraint. */
  visualStyles?: Record<string, string>;
  /** Maps shotId → custom full prompt (user-edited). Omitted shots use server-built prompt. */
  customPrompts?: Record<string, string>;
}

interface BackgroundTasksContextValue {
  tasks: Record<string, BackgroundTask>;
  startScriptGeneration: (params: ScriptGenParams) => void;
  startScriptGenerationV2: (params: ScriptGenV2Params) => void;
  triggerRevision: (params: RevisionParams) => void;
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
  charMin: number;
  charMax: number;
  narrativeStyle?: string;
  existingScript?: string | null;
  isRegenerate?: boolean;
  shortSentencePct?: number;
}

export interface ScriptGenV2Params {
  projectId: string;
  analysis: any;
  extractedText: string;
  scriptLanguage: string;
  charMin: number;
  charMax: number;
  narrativeForm: string;
  narrativeStyleVoice?: string;
  globalContext?: any;
  onIntentionNote?: (note: string) => void;
}

export interface RevisionParams {
  projectId: string;
  script: string;
  scriptLanguage: string;
}

export interface SegmentationParams {
  projectId: string;
  onContextReady?: (ctx: any) => void;
}

export interface StoryboardParams {
  projectId: string;
  sceneIds: string[];
  segmentOnly?: boolean;
  promptOnly?: boolean;
  visualStyle?: string;
  aspectRatio?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STORYBOARD_SCENE_DELAY_MS = 1500;
const STORYBOARD_RETRY_DELAYS_MS = [4000, 8000, 12000];
const STORYBOARD_CONCURRENCY = 3;

const isRateLimitMessage = (message?: string) =>
  !!message && /rate limit exceeded|limite de requêtes atteinte/i.test(message);

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
              charMin: params.charMin,
              charMax: params.charMax,
              narrativeStyle: params.narrativeStyle,
              shortSentencePct: params.shortSentencePct ?? 0,
              existingScript: params.existingScript || null,
              isRegenerate: params.isRegenerate || false,
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

  // ─── Script Generation V2 ──────────────────────────────────────────
  const startScriptGenerationV2 = useCallback((params: ScriptGenV2Params) => {
    const key = taskKey(params.projectId, "script-v2");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "script-v2",
      status: "running",
      streamedText: "",
      intentionNote: "",
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-script-v2`,
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
              extractedText: params.extractedText,
              language: params.scriptLanguage,
              charMin: params.charMin,
              charMax: params.charMax,
              narrativeForm: params.narrativeForm,
              narrativeStyleVoice: params.narrativeStyleVoice || "",
              globalContext: params.globalContext || null,
            }),
            signal: ac.signal,
          }
        );
        if (!resp.ok || !resp.body) throw new Error("Erreur de génération du script v2");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let intentionFull = "";
        let intentionDone = false;
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

                // Extract intention note from <intention>...</intention>
                if (!intentionDone) {
                  const intentionMatch = full.match(/<intention>([\s\S]*?)(<\/intention>|$)/);
                  if (intentionMatch) {
                    intentionFull = intentionMatch[1];
                    if (full.includes("</intention>")) {
                      intentionDone = true;
                      params.onIntentionNote?.(intentionFull.trim());
                    }
                  }
                }

                // Display text: strip intention block
                const displayText = full.replace(/<intention>[\s\S]*?<\/intention>\s*/gi, "")
                  .replace(/<intention>[\s\S]*/gi, "");
                updateTask(key, { streamedText: displayText, intentionNote: intentionFull });
              }
            } catch { /* skip bad chunk */ }
          }
        }

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

        // Extract final intention note
        const finalIntentionMatch = full.match(/<intention>([\s\S]*?)<\/intention>/i);
        const finalIntentionNote = finalIntentionMatch ? finalIntentionMatch[1].trim() : intentionFull.trim();

        // Clean script: remove intention block
        const finalScript = full.replace(/<intention>[\s\S]*?<\/intention>\s*/gi, "").trim();
        if (!finalScript) throw new Error("Le flux AI n'a retourné aucun texte exploitable.");

        // Save to Supabase
        await (supabase as any).from("project_scriptcreator_state").update({
          script_v2_raw: finalScript,
          intention_note: finalIntentionNote || null,
          narrative_form: params.narrativeForm,
        }).eq("project_id", params.projectId);

        updateTask(key, { status: "done", streamedText: finalScript, intentionNote: finalIntentionNote });
        toast.success(`Script v2 généré — ${finalScript.length.toLocaleString()} caractères`);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Génération v2 annulée");
          removeTask(key);
          return;
        }
        console.error("Background script-v2 generation error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de génération du script v2");
      }
    })();
  }, []);

  // ─── Revision (critical pass on v2 script) ────────────────────────
  const triggerRevision = useCallback((params: RevisionParams) => {
    const key = taskKey(params.projectId, "revision");
    abortControllers.current[key]?.abort();

    const ac = new AbortController();
    abortControllers.current[key] = ac;

    setTask(key, {
      projectId: params.projectId,
      type: "revision",
      status: "running",
      streamedText: "",
    });

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revise-script`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "x-supabase-client-platform": "web",
            },
            body: JSON.stringify({
              script: params.script,
              language: params.scriptLanguage,
            }),
            signal: ac.signal,
          }
        );
        if (!resp.ok || !resp.body) throw new Error("Erreur de révision du script");

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
                updateTask(key, { streamedText: full });
              }
            } catch { /* skip bad chunk */ }
          }
        }

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

        const finalRevised = full.trim();
        if (!finalRevised) throw new Error("La révision n'a retourné aucun texte.");

        // Save revised version to Supabase
        await (supabase as any).from("project_scriptcreator_state").update({
          script_v2_revised: finalRevised,
        }).eq("project_id", params.projectId);

        updateTask(key, { status: "done", streamedText: finalRevised });
        toast.success(`Révision critique terminée — ${finalRevised.length.toLocaleString()} caractères`);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          toast.info("Révision annulée");
          removeTask(key);
          return;
        }
        console.error("Background revision error:", e);
        updateTask(key, { status: "error", error: e?.message || "Erreur inconnue" });
        toast.error(e?.message || "Erreur de révision");
      }
    })();
  }, []);

  // ─── Segmentation (with mandatory context analysis first) ────────
  const startSegmentation = useCallback((params: SegmentationParams & { onContextReady?: (ctx: any) => void }) => {
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
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };

        // ── Step 1: Analyse contextuelle globale ──────────────────
        console.log("=== Step 1: Analyse contextuelle globale ===");
        toast.info("Analyse contextuelle du script en cours...");
        const ctxResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-context`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ project_id: params.projectId }),
            signal: ac.signal,
          }
        );
        const ctxData = await ctxResponse.json();
        if (!ctxResponse.ok || ctxData?.error) {
          console.warn("Context analysis failed:", ctxData?.error);
          toast.warning("Analyse contextuelle échouée — segmentation directe");
        } else {
          console.log("ContexteGlobal built:", ctxData.global_context?.sujet_principal);
          toast.success("Contexte global analysé");
          params.onContextReady?.(ctxData.global_context);
        }

        if (ac.signal.aborted) { toast.info("Segmentation annulée"); removeTask(key); return; }

        // ── Step 2: Segmentation ──────────────────────────────────
        console.log("=== Step 2: Segmentation ===");
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/segment-narration`,
          {
            method: "POST",
            headers,
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
        const getValidToken = async (): Promise<string> => {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s?.access_token) {
            // Refresh if expiring within 60s
            const expiresAt = s.expires_at ?? 0;
            if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
              const { data: { session: refreshed } } = await supabase.auth.refreshSession();
              if (refreshed?.access_token) return refreshed.access_token;
            }
            return s.access_token;
          }
          throw new Error("Session expirée — veuillez vous reconnecter");
        };

        let totalShots = 0;
        const failedSceneIds: string[] = [];
        let rateLimitedScenes = 0;
        let completedCount = 0;

        const processScene = async (sid: string, indexInBatch: number) => {
          if (ac.signal.aborted) return;
          // Stagger starts within a batch to avoid hitting the gateway simultaneously
          if (indexInBatch > 0) await sleep(indexInBatch * 400);

          let sceneFailed = false;
          let sceneSawRateLimit = false;

          for (let attempt = 0; attempt <= STORYBOARD_RETRY_DELAYS_MS.length; attempt++) {
            if (ac.signal.aborted) return;

            try {
              const token = await getValidToken();
              // Per-scene timeout (140s) — edge function hard limit is 150s.
              // We abort just before, so we can retry instead of getting a 504 IDLE_TIMEOUT.
              const timeoutCtrl = new AbortController();
              const onParentAbort = () => timeoutCtrl.abort();
              ac.signal.addEventListener("abort", onParentAbort);
              const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error("scene_timeout")), 140_000);
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-storyboard`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    "x-supabase-client-platform": "web",
                  },
                  body: JSON.stringify({ project_id: params.projectId, scene_id: sid, segment_only: params.segmentOnly ?? false, prompt_only: params.promptOnly ?? false, visual_style: params.visualStyle, aspect_ratio: params.aspectRatio }),
                  signal: timeoutCtrl.signal,
                }
              ).finally(() => {
                clearTimeout(timeoutId);
                ac.signal.removeEventListener("abort", onParentAbort);
              });

              const data = await response.json().catch(() => null);
              const message = data?.error || (!response.ok ? "Erreur" : undefined);
              const isRateLimited = response.status === 429 || isRateLimitMessage(message);
              const isTimeout = response.status === 504 || /idle_timeout|timeout/i.test(message ?? "");

              if (!response.ok || message) {
                if ((isRateLimited || isTimeout) && attempt < STORYBOARD_RETRY_DELAYS_MS.length) {
                  sceneSawRateLimit = true;
                  await sleep(STORYBOARD_RETRY_DELAYS_MS[attempt]);
                  continue;
                }
                throw new Error(message || "Erreur");
              }

              if (sceneSawRateLimit) rateLimitedScenes += 1;
              totalShots += data?.shots_count ?? 0;
              sceneFailed = false;
              break;
            } catch (sceneError: any) {
              // Parent abort (user cancel) → propagate. Per-scene timeout abort → retry.
              if (sceneError?.name === "AbortError" && ac.signal.aborted) throw sceneError;
              const isClientTimeout = sceneError?.name === "AbortError" || /timeout/i.test(sceneError?.message ?? "");

              const shouldRetry = attempt < STORYBOARD_RETRY_DELAYS_MS.length
                && (sceneError instanceof TypeError || isRateLimitMessage(sceneError?.message) || isClientTimeout);

              if (shouldRetry) {
                if (isRateLimitMessage(sceneError?.message)) sceneSawRateLimit = true;
                await sleep(STORYBOARD_RETRY_DELAYS_MS[attempt]);
                continue;
              }

              console.error(`Storyboard scene failed: ${sid}`, sceneError);
              failedSceneIds.push(sid);
              sceneFailed = true;
              break;
            }
          }

          if (sceneSawRateLimit && !sceneFailed) {
            console.info(`Storyboard scene recovered after rate limiting: ${sid}`);
          }

          completedCount += 1;
          updateTask(key, { completedScenes: completedCount });
        };

        // Process in batches of STORYBOARD_CONCURRENCY for parallelism
        for (let i = 0; i < params.sceneIds.length; i += STORYBOARD_CONCURRENCY) {
          if (ac.signal.aborted) return;
          const batch = params.sceneIds.slice(i, i + STORYBOARD_CONCURRENCY);
          await Promise.all(batch.map((sid, idx) => processScene(sid, idx)));
          // Pause between batches to let the gateway breathe
          if (i + STORYBOARD_CONCURRENCY < params.sceneIds.length) {
            await sleep(STORYBOARD_SCENE_DELAY_MS);
          }
        }

        updateTask(key, { status: "done" });
        const completionLabel = params.segmentOnly ? "shots découpés" : "prompts générés";
        if (failedSceneIds.length > 0) {
          toast.warning(`${totalShots} ${completionLabel}, ${failedSceneIds.length} scène(s) à relancer${rateLimitedScenes > 0 ? " — limite temporaire détectée" : ""}`);
        } else {
          toast.success(`${totalShots} ${completionLabel} sur ${params.sceneIds.length} scènes`);
        }

        // Trigger auto-detect object↔shot links after prompt generation (not segment-only)
        if (!params.segmentOnly && failedSceneIds.length === 0 && totalShots > 0) {
          window.dispatchEvent(new CustomEvent("storyboard-prompts-complete", { detail: { projectId: params.projectId } }));
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
        // Refresh image URLs from DB to pick up regenerated shots
        const { data: dbShots } = await supabase
          .from("shots")
          .select("id, image_url, description, source_sentence, source_sentence_fr, shot_type")
          .eq("project_id", params.projectId);
        if (dbShots?.length) {
          for (const seg of params.timeline.videoTrack.segments) {
            const fresh = dbShots.find((s) => s.id === seg.id);
            if (fresh) {
              seg.imageUrl = fresh.image_url ?? null;
              seg.description = fresh.description;
              seg.sentence = fresh.source_sentence ?? "";
              seg.sentenceFr = fresh.source_sentence_fr ?? null;
              seg.shotType = fresh.shot_type;
            }
          }
        }

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
        let exportTimeline = params.timeline;
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

            // ── Pre-export order consistency guard ──
            const timelineSegmentIds = params.timeline.videoTrack.segments.map((s) => s.id);
            const manifestShotIds = manifestEntries.map((e) => e.shotId);
            const timelineFiltered = timelineSegmentIds.filter((id) => new Set(manifestShotIds).has(id));
            if (timelineFiltered.length === manifestShotIds.length) {
              const orderMismatches: number[] = [];
              for (let i = 0; i < manifestShotIds.length; i++) {
                if (manifestShotIds[i] !== timelineFiltered[i]) {
                  orderMismatches.push(i + 1);
                  if (orderMismatches.length >= 5) break;
                }
              }
              if (orderMismatches.length > 0) {
                console.warn(
                  `[Export Guard] Manifest/timeline order divergence detected at positions: ${orderMismatches.join(", ")}. ` +
                  `Export will use manifest order (text-position based) for correct audio sync.`
                );
              }
            }

            // Refresh image URLs from DB to pick up regenerated shots
            const shotImageMap = new Map<string, string | null>();
            const shotDescMap = new Map<string, string>();
            const shotSentenceMap = new Map<string, string | null>();
            const shotSentenceFrMap = new Map<string, string | null>();
            const shotTypeMap = new Map<string, string>();
            for (const shot of dbShots) {
              shotImageMap.set(shot.id, shot.image_url);
              shotDescMap.set(shot.id, shot.description);
              shotSentenceMap.set(shot.id, shot.source_sentence);
              shotSentenceFrMap.set(shot.id, shot.source_sentence_fr);
              shotTypeMap.set(shot.id, shot.shot_type);
            }

            // ── Cross-project guard: build a clean copy for export only ──
            // Do NOT mutate the original timeline — just create a scoped copy
            const validShotIds = new Set(dbShots.map((s) => s.id));
            const scopedSegments = params.timeline.videoTrack.segments
              .filter((seg) => validShotIds.has(seg.id))
              .map((seg) => {
                const copy = { ...seg };
                if (shotImageMap.has(copy.id)) copy.imageUrl = shotImageMap.get(copy.id) ?? null;
                if (shotDescMap.has(copy.id)) copy.description = shotDescMap.get(copy.id)!;
                if (shotSentenceMap.has(copy.id)) copy.sentence = shotSentenceMap.get(copy.id) ?? "";
                if (shotSentenceFrMap.has(copy.id)) copy.sentenceFr = shotSentenceFrMap.get(copy.id) ?? null;
                if (shotTypeMap.has(copy.id)) copy.shotType = shotTypeMap.get(copy.id)!;
                return copy;
              });

            exportTimeline = {
              ...params.timeline,
              videoTrack: {
                ...params.timeline.videoTrack,
                segments: scopedSegments,
              },
              segmentCount: scopedSegments.length,
            };
          } else {
            throw new Error("Export XML bloqué — audio sélectionné introuvable pour construire le manifest timing exact.");
          }
        } catch (error) {
          throw error instanceof Error ? error : new Error("Export XML bloqué — impossible de valider le manifest timing exact.");
        }

        const blob = await exportTimelineToXmlZip(exportTimeline, params.fps, (p) => {
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

  // ─── Image Generation (batch) — self-healing loop ────────────────────
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
      successShots: 0,
      totalShots: total,
      imageGenModel: params.model,
    });

    (async () => {
      const MAX_ROUNDS = 5; // max auto-restart rounds
      let round = 0;
      let remainingShotIds = [...params.shotIds];
      let globalSuccess = 0;

      try {

        while (round < MAX_ROUNDS && remainingShotIds.length > 0) {
          if (ac.signal.aborted) break;
          round++;

          if (round > 1) {
            console.log(`[image-gen] Auto-restart round ${round} — ${remainingShotIds.length} shots remaining`);
            toast.info(`Relance automatique (round ${round}) — ${remainingShotIds.length} visuel(s) restant(s)`);
            // Wait before restarting
            await new Promise((r) => setTimeout(r, 10_000));
            if (ac.signal.aborted) break;
          }

          const MAX_RETRIES = 3;
          const SHOT_TIMEOUT_MS = 120_000;
          const KIE_START_TIMEOUT_MS = 45_000;
          const KIE_POLL_TIMEOUT_MS = 30_000;
          const KIE_POLL_INTERVAL_MS = 8_000;
          const KIE_MAX_POLL_ATTEMPTS = 60;
          const failedThisRound: string[] = [];

          for (let i = 0; i < remainingShotIds.length; i++) {
            if (ac.signal.aborted) break;
            if (i > 0 || round > 1) await new Promise((r) => setTimeout(r, 8000));
            if (ac.signal.aborted) break;

            let succeeded = false;
            for (let attempt = 1; attempt <= MAX_RETRIES && !succeeded; attempt++) {
              if (ac.signal.aborted) break;

              try {
                const getFreshAccessToken = async () => {
                  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
                  if (refreshed.session?.access_token) {
                    return refreshed.session.access_token;
                  }

                  const { data: currentSessionData } = await supabase.auth.getSession();
                  const currentSession = currentSessionData.session;
                  const nowInSeconds = Math.floor(Date.now() / 1000);
                  const currentTokenIsValid = Boolean(
                    currentSession?.access_token &&
                    currentSession?.expires_at &&
                    currentSession.expires_at > nowInSeconds + 30,
                  );

                  if (!refreshError && currentTokenIsValid) {
                    return currentSession!.access_token;
                  }

                  throw new Error("Session expired, please log in again");
                };

                const accessToken = await getFreshAccessToken();

                const callGenerateShotImage = async (token: string, extraBody: Record<string, unknown> = {}, timeoutMs = SHOT_TIMEOUT_MS) => {
                  const shotAc = new AbortController();
                  const onParentAbort = () => shotAc.abort();
                  ac.signal.addEventListener("abort", onParentAbort, { once: true });
                  const timer = setTimeout(() => shotAc.abort(), timeoutMs);

                  try {
                    // Route to Kie edge function when model uses the "kie:" prefix
                    const isKie = typeof params.model === "string" && params.model.startsWith("kie:");
                    const kieModelId = isKie ? params.model.slice(4) : null;
                    const endpoint = isKie ? "generate-shot-image-kie" : "generate-shot-image";
                    return await fetch(
                      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                          ...(isKie && !extraBody.mode ? { "x-kie-async": "1" } : {}),
                        },
                        body: JSON.stringify({
                          shot_id: remainingShotIds[i],
                          model: isKie ? kieModelId : params.model,
                          aspect_ratio: params.aspectRatio,
                          ...extraBody,
                          ...(isKie ? { quality: params.quality ?? "1K" } : {}),
                          ...(params.sensitiveLevels?.[remainingShotIds[i]] != null
                            ? { sensitive_level: params.sensitiveLevels[remainingShotIds[i]] }
                            : {}),
                          ...(params.visualStyles?.[remainingShotIds[i]] != null
                            ? { visual_style: params.visualStyles[remainingShotIds[i]] }
                            : {}),
                          ...(params.customPrompts?.[remainingShotIds[i]]
                            ? { custom_prompt: params.customPrompts[remainingShotIds[i]] }
                            : {}),
                        }),
                        signal: shotAc.signal,
                      }
                    );
                  } finally {
                    clearTimeout(timer);
                    ac.signal.removeEventListener("abort", onParentAbort);
                  }
                };

                let response = await callGenerateShotImage(accessToken);

                if (response.status === 401 && attempt < MAX_RETRIES) {
                  response = await callGenerateShotImage(await getFreshAccessToken());
                }

                const data = await response.json();
                if (data?.auth_expired) {
                  throw new Error("Session expired, please log in again");
                } else if (data?.safety_blocked) {
                  console.warn(`Shot ${remainingShotIds[i]}: bloqué par filtre de sécurité`);
                  succeeded = true;
                } else if (response.ok && data.image_url) {
                  globalSuccess++;
                  succeeded = true;
                } else if (response.status === 401) {
                  throw new Error("Session expired, please log in again");
                } else if (response.status === 429 || response.status === 402) {
                  console.warn(`Shot ${remainingShotIds[i]}: ${response.status}, waiting before retry (${attempt}/${MAX_RETRIES})`);
                  await new Promise((r) => setTimeout(r, attempt * 15_000));
                } else {
                  console.warn(`Shot ${remainingShotIds[i]}: HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES})`);
                  if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, attempt * 5000));
                }
              } catch (shotErr: any) {
                if (ac.signal.aborted) break;
                const message = shotErr?.message || "";
                if (message.includes("Session expired")) {
                  throw shotErr;
                }
                console.error(`Shot ${remainingShotIds[i]} attempt ${attempt}/${MAX_RETRIES}:`, shotErr);
                if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, attempt * 5000));
              }
            }

            if (!succeeded) failedThisRound.push(remainingShotIds[i]);
            // processed = how many shots we've attempted in this round so far
            const processedThisRound = i + 1;
            const stillPending = remainingShotIds.length - processedThisRound;
            updateTask(key, {
              completedShots: processedThisRound + (total - remainingShotIds.length),
              successShots: globalSuccess,
            });
          }

          remainingShotIds = failedThisRound;

          // If no failures or all done, break
          if (failedThisRound.length === 0) break;
        }

        if (ac.signal.aborted) {
          toast.info(`Génération stoppée — ${globalSuccess} visuel(s) créé(s)`);
          removeTask(key);
          return;
        }

        updateTask(key, { status: "done", completedShots: total, successShots: globalSuccess });

        if (remainingShotIds.length > 0) {
          toast.warning(`${globalSuccess}/${total} visuels générés — ${remainingShotIds.length} en échec après ${MAX_ROUNDS} relances`);
        } else {
          toast.success(`${globalSuccess} visuel(s) généré(s) sur ${total} — tous traités ✓`);
        }

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
    <BackgroundTasksContext.Provider value={{ tasks, startScriptGeneration, startScriptGenerationV2, triggerRevision, startSegmentation, startStoryboard, startExportMp4, startExportXml, startImageGen, stopTask, getTask, subscribe }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

const NOOP = () => {};
const NOOP_UNSUB = () => NOOP;
const FALLBACK: BackgroundTasksContextValue = {
  tasks: {},
  startScriptGeneration: NOOP as any,
  startScriptGenerationV2: NOOP as any,
  triggerRevision: NOOP as any,
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
