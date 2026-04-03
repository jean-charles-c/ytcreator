import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Film,
  FileText,
  Layers,
  Clapperboard,
  Download,
  Play,
  Save,
  Loader2,
  RotateCcw,
  Square,
  CheckCircle2,
  Menu,
  X,
  Youtube,
  Mic,
  Search,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  ArrowUpDown,
  AlertTriangle,
  Languages,
  Undo2,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { useBackgroundTasks } from "@/contexts/BackgroundTasks";
import SceneBlock from "@/components/editor/SceneBlock";
import ShotCard from "@/components/editor/ShotCard";
import VisualGallery from "@/components/editor/VisualGallery";
import FragmentedSceneView from "@/components/editor/FragmentedSceneView";
import { buildManifest, validateManifest, computeMerge, computeDeleteRedistribution, computeSplit, type ManifestAction } from "@/components/editor/visualPromptTypes";
import ManifestTimingPanel from "@/components/editor/ManifestTimingPanel";
import QaPanel from "@/components/editor/QaPanel";
import WhisperAlignmentEditor from "@/components/editor/WhisperAlignmentEditor";
import SegmentationQaPanel from "@/components/editor/SegmentationQaPanel";
import ObjectRegistryPanel, { type RecurringObject, IDENTITY_TEMPLATES } from "@/components/editor/ObjectRegistryPanel";
import PdfDocumentaryTab from "@/components/editor/PdfDocumentaryTab";
import SeoTab from "@/components/editor/SeoTab";
import ContentPublishTab from "@/components/editor/ContentPublishTab";
import VoiceOverStudio from "@/components/editor/VoiceOverStudio";
import RsearchEngineTab from "@/components/editor/RsearchEngineTab";
import VideoEditTab from "@/components/editor/VideoEditTab";
import VideoPromptsTab from "@/components/editor/VideoPromptsTab";
import { ScopeOverrideControl, useSensitiveMode } from "@/components/editor/sensitiveMode";
import { useVisualStyle, VisualStyleSelector } from "@/components/editor/visualStyle";
import { applyFrenchTypography } from "@/components/editor/frenchTypography";
import { reorderShotsByReadingPosition } from "@/components/editor/shotAlignment";
import { convertNumbersToFrench, hasDigits } from "@/components/editor/numberToFrenchText";

type Tab = "rsearch" | "script-creator" | "segmentation" | "storyboard" | "videoprompts" | "seo" | "cp" | "vo" | "videoedit" | "export";
type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

const tabItems: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "rsearch", label: "RsearchEngine", icon: Search },
  { key: "script-creator", label: "ScriptCreator", icon: FileText },
  { key: "segmentation", label: "Segmentation", icon: Layers },
  { key: "storyboard", label: "VisualPrompts", icon: Clapperboard },
  { key: "videoprompts", label: "VideoPrompts", icon: Film },
  { key: "seo", label: "SEO", icon: Youtube },
  { key: "cp", label: "CP", icon: Save },
  { key: "vo", label: "VO", icon: Mic },
  { key: "videoedit", label: "VidéoEdit", icon: Film },
  { key: "export", label: "Export", icon: Download },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
];

const SEO_FALLBACK = { titles: null, description: null, tags: null } as {
  titles: any[] | null;
  description: string | null;
  tags: string | null;
};

const normalizeSeoResults = (raw: unknown): { titles: any[] | null; description: string | null; tags: string | null } => {
  if (!raw) return SEO_FALLBACK;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return SEO_FALLBACK;
    }
  }

  if (!parsed || typeof parsed !== "object") return SEO_FALLBACK;

  const candidate = parsed as {
    titles?: unknown;
    description?: unknown;
    tags?: unknown;
  };

  return {
    titles: Array.isArray(candidate.titles) ? candidate.titles : null,
    description: typeof candidate.description === "string" ? candidate.description : null,
    tags: typeof candidate.tags === "string" ? candidate.tags : null,
  };
};

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startSegmentation: bgStartSegmentation, startStoryboard: bgStartStoryboard, startImageGen: bgStartImageGen, getTask, subscribe, stopTask } = useBackgroundTasks();
  const isNew = id === "new";

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState("en");
  const [narration, setNarration] = useState("");
  const [projectId, setProjectId] = useState<string | null>(isNew ? null : id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>("rsearch");
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(!isNew);
  const [showSetup, setShowSetup] = useState(isNew);
  const [globalContext, setGlobalContext] = useState<any>(null);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedMusicTracks, setSelectedMusicTracks] = useState<{ url: string; name: string }[]>([]);
  const [qaExportAllowed, setQaExportAllowed] = useState(true);
  const [qaCounts, setQaCounts] = useState<{ errors: number; warnings: number }>({ errors: 0, warnings: 0 });
  const [qaIssues, setQaIssues] = useState<{ level: string; sceneOrder?: number; shotOrder?: number }[]>([]);
  const storyAbortRef = useRef<AbortController | null>(null);
  const [regeneratingShots, setRegeneratingShots] = useState<Record<string, boolean>>({});

  const storyboardManifest = useMemo(
    () => projectId ? buildManifest(projectId, scenes, shots) : null,
    [projectId, scenes, shots],
  );

  const handleQaReportChange = useCallback((report: { errors: number; warnings: number; issues: { level: string; sceneOrder?: number; shotOrder?: number }[] }) => {
    setQaCounts((prev) => (prev.errors === report.errors && prev.warnings === report.warnings ? prev : { errors: report.errors, warnings: report.warnings }));
    setQaIssues(report.issues);
  }, []);

  // Derive loading states from background tasks
  const segmenting = projectId ? getTask(projectId, "segmentation")?.status === "running" : false;
  const generatingStoryboard = projectId ? getTask(projectId, "storyboard")?.status === "running" : false;

  // Versioning for segmentation
  const [sceneVersions, setSceneVersions] = useState<{ id: number; scenes: Scene[] }[]>([]);
  const [currentSceneVersionId, setCurrentSceneVersionId] = useState<number | null>(null);
  const [previewSceneVersionId, setPreviewSceneVersionId] = useState<number | null>(null);

  // Versioning for storyboard
  const [shotVersions, setShotVersions] = useState<{ id: number; shots: Shot[] }[]>([]);
  const [currentShotVersionId, setCurrentShotVersionId] = useState<number | null>(null);
  const [previewShotVersionId, setPreviewShotVersionId] = useState<number | null>(null);

  // ── Sensitive mode (hierarchy: global → scene → shot) ──────
  const sensitiveMode = useSensitiveMode();
  const visualStyle = useVisualStyle();

  const [pdfAnalysis, setPdfAnalysis] = useState<any>(() => {
    try {
      const v = sessionStorage.getItem(`sc_analysis_${id}`);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  const [pdfExtractedText, setPdfExtractedText] = useState<string | null>(() => sessionStorage.getItem(`sc_text_${id}`) || null);
  const [pdfPageCount, setPdfPageCount] = useState(() => {
    try {
      return Number(sessionStorage.getItem(`sc_pages_${id}`)) || 0;
    } catch {
      return 0;
    }
  });
  const [pdfFileName, setPdfFileName] = useState<string | null>(() => sessionStorage.getItem(`sc_fname_${id}`) || null);
  const [pdfDocStructure, setPdfDocStructure] = useState<any[] | null>(() => {
    try {
      const v = sessionStorage.getItem(`sc_struct_${id}`);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  const [generatedScript, setGeneratedScript] = useState<string | null>(() => sessionStorage.getItem(`sc_script_${id}`) || null);
  const [seoResults, setSeoResults] = useState<{ titles: any[] | null; description: string | null; tags: string | null }>(() => {
    return normalizeSeoResults(sessionStorage.getItem(`sc_seo_${id}`));
  });

  // Versioning for script (ScriptCreator)
  const [scriptVersions, setScriptVersions] = useState<{ id: number; content: string }[]>([]);
  const [currentScriptVersionId, setCurrentScriptVersionId] = useState<number | null>(null);

  const scriptCreatorHydratedRef = useRef(false);
  const lastSavedScriptCreatorSnapshotRef = useRef("");
  const scriptCreatorSaveTimeoutRef = useRef<number | null>(null);

  // Rehydrate local state whenever route project id changes
  useEffect(() => {
    if (!id || isNew) return;

    try {
      const analysisRaw = sessionStorage.getItem(`sc_analysis_${id}`);
      const structRaw = sessionStorage.getItem(`sc_struct_${id}`);

      setPdfAnalysis(analysisRaw ? JSON.parse(analysisRaw) : null);
      setPdfExtractedText(sessionStorage.getItem(`sc_text_${id}`) || null);
      setPdfPageCount(Number(sessionStorage.getItem(`sc_pages_${id}`)) || 0);
      setPdfFileName(sessionStorage.getItem(`sc_fname_${id}`) || null);
      setPdfDocStructure(structRaw ? JSON.parse(structRaw) : null);
      setGeneratedScript(sessionStorage.getItem(`sc_script_${id}`) || null);
      setSeoResults(normalizeSeoResults(sessionStorage.getItem(`sc_seo_${id}`)));
    } catch {
      setPdfAnalysis(null);
      setPdfExtractedText(null);
      setPdfPageCount(0);
      setPdfFileName(null);
      setPdfDocStructure(null);
      setGeneratedScript(null);
      setSeoResults(SEO_FALLBACK);
    }
  }, [id, isNew]);

  // Load existing project + scenes + shots + ScriptCreator persisted state
  useEffect(() => {
    if (isNew || !id) return;

    const load = async () => {
      setLoadingProject(true);
      scriptCreatorHydratedRef.current = false;

      const [projectRes, scenesRes, shotsRes, scriptCreatorRes] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).single(),
        supabase.from("scenes").select("*").eq("project_id", id).order("scene_order", { ascending: true }),
        supabase.from("shots").select("*").eq("project_id", id).order("shot_order", { ascending: true }),
        (supabase as any).from("project_scriptcreator_state").select("*").eq("project_id", id).maybeSingle(),
      ]);

      if (projectRes.error || !projectRes.data) {
        toast.error("Projet introuvable");
        navigate("/dashboard");
        return;
      }

      setTitle(projectRes.data.title);
      setSubject(projectRes.data.subject ?? "");
      setScriptLanguage(projectRes.data.script_language);
      setNarration(projectRes.data.narration ?? "");
      setProjectId(projectRes.data.id);
      setShowSetup(false);

      if (scenesRes.data) setScenes(scenesRes.data);
      if (shotsRes.data && scenesRes.data) {
        const { reordered, updates } = reorderShotsByReadingPosition(shotsRes.data, scenesRes.data);
        setShots(reordered);
        // Persist corrected order to DB in background
        if (updates.length > 0) {
          console.log(`Reordering ${updates.length} shots to match reading order`);
          Promise.all(updates.map((u) => supabase.from("shots").update({ shot_order: u.shot_order }).eq("id", u.id)));
        }
      } else if (shotsRes.data) {
        setShots(shotsRes.data);
      }

      const scriptCreatorState = scriptCreatorRes?.data;
      if (scriptCreatorState) {
        setPdfAnalysis(scriptCreatorState.analysis ?? null);
        setPdfExtractedText(scriptCreatorState.extracted_text ?? null);
        setPdfPageCount(Number(scriptCreatorState.page_count) || 0);
        setPdfFileName(scriptCreatorState.file_name ?? null);
        setPdfDocStructure(Array.isArray(scriptCreatorState.doc_structure) ? scriptCreatorState.doc_structure : null);
        setGeneratedScript(typeof scriptCreatorState.generated_script === "string" ? scriptCreatorState.generated_script : null);
        setSeoResults(normalizeSeoResults(scriptCreatorState.seo_results));

        let nextGlobalContext = scriptCreatorState.global_context ?? null;
        if (nextGlobalContext?.objets_recurrents) {
          const upgradedObjects = applyIdentityTemplates(nextGlobalContext.objets_recurrents as RecurringObject[]);
          nextGlobalContext = { ...nextGlobalContext, objets_recurrents: upgradedObjects };

          const previousSerialized = JSON.stringify(scriptCreatorState.global_context?.objets_recurrents ?? []);
          const nextSerialized = JSON.stringify(upgradedObjects);
          if (projectRes.data.id && previousSerialized !== nextSerialized) {
            await (supabase as any).from("project_scriptcreator_state").upsert(
              {
                project_id: projectRes.data.id,
                global_context: nextGlobalContext,
              },
              { onConflict: "project_id" }
            );
          }
        }
        setGlobalContext(nextGlobalContext);

        // Restore script versions
        if (Array.isArray(scriptCreatorState.script_versions) && scriptCreatorState.script_versions.length > 0) {
          setScriptVersions(scriptCreatorState.script_versions);
          const maxId = Math.max(...scriptCreatorState.script_versions.map((v: any) => v.id));
          setCurrentScriptVersionId(maxId);
        } else if (typeof scriptCreatorState.generated_script === "string" && scriptCreatorState.generated_script.trim()) {
          setScriptVersions([{ id: 1, content: scriptCreatorState.generated_script }]);
          setCurrentScriptVersionId(1);
        }

        // Restore scene versions
        if (Array.isArray(scriptCreatorState.scene_versions) && scriptCreatorState.scene_versions.length > 0) {
          setSceneVersions(scriptCreatorState.scene_versions);
          const maxId = Math.max(...scriptCreatorState.scene_versions.map((v: any) => v.id));
          setCurrentSceneVersionId(maxId);
        }

        // Restore shot versions
        if (Array.isArray(scriptCreatorState.shot_versions) && scriptCreatorState.shot_versions.length > 0) {
          setShotVersions(scriptCreatorState.shot_versions);
          const maxId = Math.max(...scriptCreatorState.shot_versions.map((v: any) => v.id));
          setCurrentShotVersionId(maxId);
        }

        // Restore shot object overrides
        if (scriptCreatorState.timeline_state && typeof scriptCreatorState.timeline_state === 'object') {
          const ts = scriptCreatorState.timeline_state as any;
          if (ts.shotObjectOverrides && typeof ts.shotObjectOverrides === 'object') {
            setShotObjectOverrides(ts.shotObjectOverrides);
          }
        }

        lastSavedScriptCreatorSnapshotRef.current = JSON.stringify({
          file_name: scriptCreatorState.file_name ?? null,
          page_count: Number(scriptCreatorState.page_count) || 0,
          extracted_text: scriptCreatorState.extracted_text ?? null,
          analysis: scriptCreatorState.analysis ?? null,
          doc_structure: Array.isArray(scriptCreatorState.doc_structure) ? scriptCreatorState.doc_structure : null,
          generated_script: typeof scriptCreatorState.generated_script === "string" ? scriptCreatorState.generated_script : null,
          seo_results: normalizeSeoResults(scriptCreatorState.seo_results),
          script_versions: Array.isArray(scriptCreatorState.script_versions) ? scriptCreatorState.script_versions : [],
          scene_versions: Array.isArray(scriptCreatorState.scene_versions) ? scriptCreatorState.scene_versions : [],
          shot_versions: Array.isArray(scriptCreatorState.shot_versions) ? scriptCreatorState.shot_versions : [],
        });
      }

      scriptCreatorHydratedRef.current = true;
      setLoadingProject(false);
    };

    load();
  }, [id, isNew, navigate]);

  const storageProjectId = id ?? projectId;

  // Persist ScriptCreator state to sessionStorage
  useEffect(() => {
    if (!storageProjectId) return;
    try {
      if (pdfAnalysis) sessionStorage.setItem(`sc_analysis_${storageProjectId}`, JSON.stringify(pdfAnalysis));
      else sessionStorage.removeItem(`sc_analysis_${storageProjectId}`);
    } catch {
      // quota exceeded
    }
  }, [storageProjectId, pdfAnalysis]);

  useEffect(() => {
    if (!storageProjectId) return;
    try {
      if (pdfExtractedText) sessionStorage.setItem(`sc_text_${storageProjectId}`, pdfExtractedText);
      else sessionStorage.removeItem(`sc_text_${storageProjectId}`);
    } catch {
      // quota exceeded
    }
  }, [storageProjectId, pdfExtractedText]);

  useEffect(() => {
    if (!storageProjectId) return;
    sessionStorage.setItem(`sc_pages_${storageProjectId}`, String(pdfPageCount));
  }, [storageProjectId, pdfPageCount]);

  useEffect(() => {
    if (!storageProjectId) return;
    if (pdfFileName) sessionStorage.setItem(`sc_fname_${storageProjectId}`, pdfFileName);
    else sessionStorage.removeItem(`sc_fname_${storageProjectId}`);
  }, [storageProjectId, pdfFileName]);

  useEffect(() => {
    if (!storageProjectId) return;
    try {
      if (pdfDocStructure) sessionStorage.setItem(`sc_struct_${storageProjectId}`, JSON.stringify(pdfDocStructure));
      else sessionStorage.removeItem(`sc_struct_${storageProjectId}`);
    } catch {
      // quota exceeded
    }
  }, [storageProjectId, pdfDocStructure]);

  useEffect(() => {
    if (!storageProjectId) return;
    try {
      if (generatedScript) sessionStorage.setItem(`sc_script_${storageProjectId}`, generatedScript);
      else sessionStorage.removeItem(`sc_script_${storageProjectId}`);
    } catch {
      // quota exceeded
    }
  }, [storageProjectId, generatedScript]);

  useEffect(() => {
    if (!storageProjectId) return;
    try {
      sessionStorage.setItem(`sc_seo_${storageProjectId}`, JSON.stringify(seoResults));
    } catch {
      // quota exceeded
    }
  }, [storageProjectId, seoResults]);

  // Persist ScriptCreator state to backend (debounced)
  useEffect(() => {
    if (!projectId || showSetup || loadingProject || !scriptCreatorHydratedRef.current) return;

    const payload = {
      file_name: pdfFileName ?? null,
      page_count: Number(pdfPageCount) || 0,
      extracted_text: pdfExtractedText ?? null,
      analysis: pdfAnalysis ?? null,
      doc_structure: pdfDocStructure ?? null,
      generated_script: generatedScript ?? null,
      seo_results: seoResults,
      script_versions: scriptVersions,
      scene_versions: sceneVersions,
      shot_versions: shotVersions,
    };

    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedScriptCreatorSnapshotRef.current) return;

    if (scriptCreatorSaveTimeoutRef.current) {
      window.clearTimeout(scriptCreatorSaveTimeoutRef.current);
    }

    scriptCreatorSaveTimeoutRef.current = window.setTimeout(async () => {
      const { error } = await (supabase as any)
        .from("project_scriptcreator_state")
        .upsert({ project_id: projectId, ...payload }, { onConflict: "project_id" });

      if (!error) {
        lastSavedScriptCreatorSnapshotRef.current = snapshot;
      } else {
        console.error("ScriptCreator backend persistence error:", error);
      }
    }, 900);

    return () => {
      if (scriptCreatorSaveTimeoutRef.current) {
        window.clearTimeout(scriptCreatorSaveTimeoutRef.current);
      }
    };
  }, [
    projectId,
    showSetup,
    loadingProject,
    pdfFileName,
    pdfPageCount,
    pdfExtractedText,
    pdfAnalysis,
    pdfDocStructure,
    generatedScript,
    seoResults,
    scriptVersions,
    sceneVersions,
    shotVersions,
  ]);

  useEffect(() => {
    return () => {
      if (scriptCreatorSaveTimeoutRef.current) {
        window.clearTimeout(scriptCreatorSaveTimeoutRef.current);
      }
    };
  }, []);

  // Save / create project
  const saveProject = useCallback(async () => {
    if (!user) return;
    if (!title.trim()) { toast.error("Veuillez saisir un titre."); return; }
    setSaving(true);
    if (projectId) {
      const { error } = await supabase.from("projects").update({ title: title.trim(), subject: subject.trim() || null, script_language: scriptLanguage, narration: narration.trim() || null }).eq("id", projectId);
      setSaving(false);
      if (error) { toast.error("Erreur de sauvegarde"); return; }
      toast.success("Projet sauvegardé");
    } else {
      const { data, error } = await supabase.from("projects").insert({ user_id: user.id, title: title.trim(), subject: subject.trim() || null, script_language: scriptLanguage, narration: narration.trim() || null }).select().single();
      setSaving(false);
      if (error || !data) { toast.error("Erreur de création"); return; }
      setProjectId(data.id);
      setShowSetup(false);
      toast.success("Projet créé");
      navigate(`/editor/${data.id}`, { replace: true });
    }
  }, [user, projectId, title, subject, scriptLanguage, narration, navigate]);

  // Subscribe to background tasks for segmentation & storyboard
  useEffect(() => {
    if (!projectId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribe(projectId, "segmentation", async (task) => {
      if (task.status === "done" || task.status === "error") {
        // Always try to fetch scenes from DB — even on error, the server may have saved results
        const { data: sceneData } = await supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_order", { ascending: true });
        if (sceneData && sceneData.length > 0) {
          if (scenes.length > 0) {
            setSceneVersions((prev) => {
              const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
              if (prev.length === 0) {
                const newId = nextId + 1;
                setCurrentSceneVersionId(newId);
                return [{ id: nextId, scenes: [...scenes] }, { id: newId, scenes: sceneData }];
              }
              setCurrentSceneVersionId(nextId);
              return [...prev, { id: nextId, scenes: sceneData }];
            });
          } else {
            setSceneVersions([{ id: 1, scenes: sceneData }]);
            setCurrentSceneVersionId(1);
          }
          setScenes(sceneData);
          setShots([]);
          if (task.status === "error") {
            toast.info(`${sceneData.length} scènes récupérées malgré l'erreur.`);
          }
        }
      }
    }));

    unsubs.push(subscribe(projectId, "storyboard", async (task) => {
      if (task.status === "done" || task.completedScenes !== undefined) {
        // Re-fetch shots from DB
        const { data: shotData } = await supabase.from("shots").select("*").eq("project_id", projectId).order("scene_id", { ascending: true }).order("shot_order", { ascending: true });
        if (shotData) {
          const { reordered } = reorderShotsByReadingPosition(shotData as Shot[], scenes);
          setShots(reordered);
          if (task.status === "done") {
            setShotVersions((prev) => {
              const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
              setCurrentShotVersionId(nextId);
              return [...prev, { id: nextId, shots: shotData }];
            });
          }
        }
        setRegeneratingSceneId(null);
      }
    }));

    return () => unsubs.forEach((fn) => fn());
  }, [projectId, subscribe, scenes]);

  // Segment narration (delegates to background)
  const runSegmentation = useCallback(async () => {
    if (!projectId) return;
    // Prevent double-launch if already running
    if (getTask(projectId, "segmentation")?.status === "running") {
      setActiveTab("segmentation");
      return;
    }
    if (narration.trim()) {
      await supabase.from("projects").update({ narration: narration.trim() }).eq("id", projectId);
    }
    setActiveTab("segmentation");
    setPreviewSceneVersionId(null);
    bgStartSegmentation({
      projectId,
      onContextReady: (ctx: any) => setGlobalContext(ctx),
    });
  }, [projectId, narration, bgStartSegmentation, getTask]);

  const stopSegmentation = useCallback(() => {
    if (projectId) stopTask(projectId, "segmentation");
  }, [projectId, stopTask]);

  // Generate storyboard (all or single scene)
  const runStoryboard = useCallback(async (sceneId?: string, options?: { segmentOnly?: boolean; promptOnly?: boolean }) => {
    if (!projectId) return;
    const segmentOnly = options?.segmentOnly ?? false;
    const promptOnly = options?.promptOnly ?? false;
    if (sceneId) {
      // Single scene regeneration — keep local (not background)
      setRegeneratingSceneId(sceneId);
      try {
        const session = (await supabase.auth.getSession()).data.session;
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
            body: JSON.stringify({
              project_id: projectId,
              scene_id: sceneId,
              sensitive_level: sensitiveMode.resolveScene(sceneId).effectiveLevel ?? undefined,
              segment_only: segmentOnly,
              prompt_only: promptOnly,
            }),
          }
        );
        const data = await response.json();
        if (!response.ok || data?.error) throw new Error(data?.error || "Erreur de génération");
        const { data: shotData } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
        if (shotData) {
          const { reordered } = reorderShotsByReadingPosition(shotData as Shot[], scenes);
          setShots(reordered);
        }
        toast.success(`${data?.shots_count ?? 0} shots ${segmentOnly ? "découpés" : "générés"}`);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Erreur inattendue");
      }
      setRegeneratingSceneId(null);
    } else {
      // Full storyboard — delegate to background
      if (shots.length > 0) {
        setShotVersions((prev) => {
          const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
          if (prev.length === 0) return [{ id: nextId, shots: [...shots] }];
          return [...prev, { id: nextId, shots: [...shots] }];
        });
      }
      setPreviewShotVersionId(null);
      setActiveTab("storyboard");
      const sceneIds = scenes.map((s) => s.id);
      if (sceneIds.length === 0) {
        toast.error("Aucune scène à traiter");
        return;
      }
      bgStartStoryboard({ projectId, sceneIds, segmentOnly, promptOnly });
    }
  }, [projectId, scenes, shots, bgStartStoryboard]);

  const stopStoryboard = useCallback(() => {
    if (projectId) stopTask(projectId, "storyboard");
    storyAbortRef.current?.abort();
    storyAbortRef.current = null;
  }, [projectId, stopTask]);

  const getShotsForScene = (sceneId: string) => shots.filter((s) => s.scene_id === sceneId);

  // --- Object Registry ---
  const handleObjectRegistryChange = useCallback(async (objects: RecurringObject[]) => {
    const updated = { ...globalContext, objets_recurrents: objects };
    setGlobalContext(updated);
    if (projectId) {
      await (supabase as any).from("project_scriptcreator_state").upsert(
        { project_id: projectId, global_context: updated },
        { onConflict: "project_id" }
      );
    }
  }, [globalContext, projectId]);

  const [isContextAnalyzing, setIsContextAnalyzing] = useState(false);
  // Apply identity templates to objects that lack proper lock clauses
  const applyIdentityTemplates = useCallback((objects: RecurringObject[]): RecurringObject[] => {
    return objects.map(obj => {
      const hasLockClause = obj.identity_prompt && (
        obj.identity_prompt.includes("IDENTITY LOCK") ||
        obj.identity_prompt.includes("PERIOD LOCK") ||
        obj.identity_prompt.includes("NO TEMPORAL DRIFT") ||
        obj.identity_prompt.includes("NO OBJECT DRIFT")
      );
      // Force regeneration if identity prompt still has old placeholders
      const hasOldPlaceholders = obj.identity_prompt && (
        obj.identity_prompt.includes("[period feature 1]") ||
        obj.identity_prompt.includes("[feature 1]") ||
        obj.identity_prompt.includes("MANDATORY PERIOD-SPECIFIC FEATURES") ||
        obj.identity_prompt.includes("MANDATORY VISUAL FEATURES")
      );
      if (hasLockClause && !hasOldPlaceholders) return obj;
      const templateFn = IDENTITY_TEMPLATES[obj.type] || IDENTITY_TEMPLATES.object;
      return { ...obj, identity_prompt: templateFn(obj.nom, obj.epoque, obj.reference_images) };
    });
  }, []);

  const handleReanalyzeContext = useCallback(async () => {
    if (!projectId) return;
    setIsContextAnalyzing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-context`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ project_id: projectId }),
        }
      );
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast.error("Analyse contextuelle échouée : " + (data?.error || "Erreur inconnue"));
        return;
      }
      // Apply identity templates to all objects
      const ctx = data.global_context;
      if (ctx?.objets_recurrents) {
        ctx.objets_recurrents = applyIdentityTemplates(ctx.objets_recurrents);
      }
      setGlobalContext(ctx);
      const objCount = ctx?.objets_recurrents?.length || 0;
      toast.success(`Analyse contextuelle terminée — ${objCount} objet(s) récurrent(s) détecté(s)`);
    } catch (e: any) {
      toast.error("Erreur : " + (e.message || "Erreur inconnue"));
    } finally {
      setIsContextAnalyzing(false);
    }
  }, [projectId, applyIdentityTemplates]);

  const handleSearchMoreRecurrences = useCallback(async (excludeNames: string[]) => {
    if (!projectId) return;
    setIsContextAnalyzing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-context`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ project_id: projectId, exclude_names: excludeNames, search_more: true }),
        }
      );
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast.error("Recherche échouée : " + (data?.error || "Erreur inconnue"));
        return;
      }
      // Apply identity templates to new objects
      const ctx = data.global_context;
      if (ctx?.objets_recurrents) {
        ctx.objets_recurrents = applyIdentityTemplates(ctx.objets_recurrents);
      }
      setGlobalContext(ctx);
      const newCount = data.new_objects_count || 0;
      if (newCount > 0) {
        toast.success(`${newCount} nouvelle(s) récurrence(s) trouvée(s)`);
      } else {
        toast.info("Aucune nouvelle récurrence trouvée");
      }
    } catch (e: any) {
      toast.error("Erreur : " + (e.message || "Erreur inconnue"));
    } finally {
      setIsContextAnalyzing(false);
    }
  }, [projectId]);

  // --- Object linking to shots ---
  const allRecurringObjects = useMemo(() => 
    (globalContext?.objets_recurrents as RecurringObject[]) || [], 
    [globalContext]
  );

  // Per-shot object overrides: { shotId: { added: [objId], removed: [objId] } }
  const [shotObjectOverrides, setShotObjectOverrides] = useState<Record<string, { added: string[]; removed: string[] }>>({});

  const getLinkedObjectsForShot = useCallback((_sceneOrder: number, shotId?: string): RecurringObject[] => {
    if (!shotId) return [];
    // Direct shot-level linking from mentions_shots
    const shotLinked = allRecurringObjects.filter(obj => (obj.mentions_shots || []).includes(shotId));
    // Apply per-shot overrides on top
    const overrides = shotObjectOverrides[shotId];
    if (!overrides) return shotLinked;
    let result = shotLinked.filter(obj => !overrides.removed.includes(obj.id));
    const addedObjects = allRecurringObjects.filter(obj => overrides.added.includes(obj.id) && !shotLinked.some(s => s.id === obj.id));
    result = [...result, ...addedObjects];
    return result;
  }, [allRecurringObjects, shotObjectOverrides]);

  // Persist shot object overrides to DB
  const persistShotObjectOverrides = useCallback(async (overrides: Record<string, { added: string[]; removed: string[] }>) => {
    if (!projectId) return;
    const { error } = await (supabase as any)
      .from("project_scriptcreator_state")
      .upsert({ project_id: projectId, timeline_state: { shotObjectOverrides: overrides } }, { onConflict: "project_id" });
    if (error) console.error("Failed to persist shot object overrides:", error);
  }, [projectId]);

  const handleLinkObjectToShot = useCallback((shotId: string, objectId: string) => {
    setShotObjectOverrides(prev => {
      const current = prev[shotId] || { added: [], removed: [] };
      let next: typeof prev;
      if (current.removed.includes(objectId)) {
        next = { ...prev, [shotId]: { ...current, removed: current.removed.filter(id => id !== objectId) } };
      } else if (!current.added.includes(objectId)) {
        next = { ...prev, [shotId]: { ...current, added: [...current.added, objectId] } };
      } else {
        return prev;
      }
      persistShotObjectOverrides(next);
      return next;
    });
  }, [persistShotObjectOverrides]);

  const handleUnlinkObjectFromShot = useCallback((shotId: string, objectId: string) => {
    setShotObjectOverrides(prev => {
      const current = prev[shotId] || { added: [], removed: [] };
      let next: typeof prev;
      if (current.added.includes(objectId)) {
        next = { ...prev, [shotId]: { ...current, added: current.added.filter(id => id !== objectId) } };
      } else if (!current.removed.includes(objectId)) {
        next = { ...prev, [shotId]: { ...current, removed: [...current.removed, objectId] } };
      } else {
        return prev;
      }
      persistShotObjectOverrides(next);
      return next;
    });
  }, [persistShotObjectOverrides]);

  // Sync mentions_shots from recurring objects → shotObjectOverrides for VisualPrompts
  useEffect(() => {
    if (!allRecurringObjects.length || !shots.length || !scenes.length) return;
    setShotObjectOverrides(prev => {
      const next = { ...prev };
      let changed = false;
      for (const obj of allRecurringObjects) {
        if (!obj.mentions_shots) continue;
        for (const shotId of obj.mentions_shots) {
          const shot = shots.find(s => s.id === shotId);
          if (!shot) continue;
          const current = next[shotId] || { added: [], removed: [] };
          if (!current.added.includes(obj.id)) {
            next[shotId] = { ...current, added: [...current.added, obj.id], removed: current.removed.filter(id => id !== obj.id) };
            changed = true;
          }
        }
      }
      if (changed) {
        persistShotObjectOverrides(next);
      }
      return changed ? next : prev;
    });
  }, [allRecurringObjects, shots, persistShotObjectOverrides]);

  // --- Scene editing callbacks ---
  const handleSceneUpdate = (updated: Scene) => {
    setScenes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleSceneDelete = async (sceneId: string) => {
    await supabase.from("shots").delete().eq("scene_id", sceneId);
    await supabase.from("scenes").delete().eq("id", sceneId);
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    setShots((prev) => prev.filter((s) => s.scene_id !== sceneId));
    toast.success("Scène supprimée");
  };

  const handleMergeWithNext = async (sceneId: string) => {
    if (!projectId) return;

    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0 || idx >= scenes.length - 1) return;

    const previousScenes = scenes;
    const previousShots = shots;
    const current = scenes[idx];
    const next = scenes[idx + 1];
    const stripTags = (t: string) => t.replace(/\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION|TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\]\]\s*/gi, "").trim();
    const mergedText = `${stripTags(current.source_text)} ${stripTags(next.source_text)}`.trim();
    const mergedTitle = current.title;
    const mergedVisual = [current.visual_intention, next.visual_intention].filter(Boolean).join(" / ") || null;
    const mergedTextFr = [current.source_text_fr, next.source_text_fr].filter(Boolean).join(" ").trim() || null;

    try {
      const { data: updatedScene, error: updateError } = await supabase
        .from("scenes")
        .update({ source_text: mergedText, title: mergedTitle, visual_intention: mergedVisual, source_text_fr: mergedTextFr })
        .eq("id", current.id)
        .select("id")
        .single();

      if (updateError || !updatedScene) {
        throw updateError ?? new Error("La scène source n'a pas pu être mise à jour");
      }

      const { error: deleteShotsError } = await supabase
        .from("shots")
        .delete()
        .eq("scene_id", next.id);

      if (deleteShotsError) throw deleteShotsError;

      const { data: deletedScenes, error: deleteSceneError } = await supabase
        .from("scenes")
        .delete()
        .eq("id", next.id)
        .select("id");

      if (deleteSceneError) throw deleteSceneError;
      if (!deletedScenes || deletedScenes.length === 0) {
        throw new Error("La scène suivante n'a pas été supprimée");
      }

      const reorderedScenes = previousScenes
        .filter((s) => s.id !== next.id)
        .map((s, i) => ({ id: s.id, scene_order: i + 1 }));

      const reorderResults = await Promise.all(
        reorderedScenes.map((s) =>
          supabase.from("scenes").update({ scene_order: s.scene_order }).eq("id", s.id)
        )
      );

      const reorderError = reorderResults.find((result) => result.error)?.error;
      if (reorderError) throw reorderError;

      const [{ data: freshScenes, error: freshScenesError }, { data: freshShots, error: freshShotsError }] = await Promise.all([
        supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_order", { ascending: true }),
        supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true }),
      ]);

      if (freshScenesError) throw freshScenesError;
      if (freshShotsError) throw freshShotsError;

      setScenes(freshScenes ?? []);
      const { reordered: reorderedShots } = reorderShotsByReadingPosition((freshShots ?? []) as Shot[], freshScenes ?? []);
      setShots(reorderedShots);
      setPreviewSceneVersionId(null);
      toast.success("Scènes fusionnées");
    } catch (err: any) {
      setScenes(previousScenes);
      setShots(previousShots);
      console.error("Merge error:", err);
      toast.error(err?.message || "Erreur lors de la fusion");
    }
  };

  const handleSplit = async (sceneId: string, text1: string, text2: string) => {
    if (!projectId) return;
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const scene = scenes[idx];
    // Update current scene with text1
    await supabase.from("scenes").update({ source_text: text1 }).eq("id", scene.id);
    // Insert new scene after current
    const { data: newScene } = await supabase.from("scenes").insert({
      project_id: projectId,
      scene_order: scene.scene_order + 1,
      title: `${scene.title} (suite)`,
      source_text: text2,
      visual_intention: null,
    }).select().single();
    // Reorder scenes after
    const updated = [...scenes];
    updated[idx] = { ...scene, source_text: text1 };
    if (newScene) updated.splice(idx + 1, 0, newScene);
    const reordered = updated.map((s, i) => ({ ...s, scene_order: i + 1 }));
    for (const s of reordered) {
      await supabase.from("scenes").update({ scene_order: s.scene_order }).eq("id", s.id);
    }
    setScenes(reordered);
    toast.success("Scène scindée");
  };

  const handleToggleValidated = async (sceneId: string, validated: boolean) => {
    await supabase.from("scenes").update({ validated }).eq("id", sceneId);
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, validated } : s)));
    toast.success(validated ? "Scène validée" : "Validation retirée");
  };

  const handleShotUpdate = (updated: Shot) => {
    setShots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleShotDelete = async (shotId: string) => {
    try {
      const deletedShot = shots.find((s) => s.id === shotId);
      if (!deletedShot) return;

      const sceneShotCount = shots.filter((s) => s.scene_id === deletedShot.scene_id).length;
      if (sceneShotCount <= 1) {
        toast.warning("Impossible de supprimer le dernier plan d'une scène. Il doit rester au moins un plan par scène.");
        return;
      }

      const scene = scenes.find((sc) => sc.id === deletedShot.scene_id);
      if (!scene) return;

      const sceneShots = shots.filter((s) => s.scene_id === deletedShot.scene_id);
      const redistribution = computeDeleteRedistribution(sceneShots, shotId, scene);

      const { error } = await supabase.from("shots").delete().eq("id", shotId);
      if (error) { toast.error("Erreur de suppression"); return; }

      if (redistribution) {
        for (const u of redistribution.updates) {
          await supabase
            .from("shots")
            .update({ source_sentence: u.source_sentence, source_sentence_fr: u.source_sentence_fr })
            .eq("id", u.id);
        }

        const updateMap = new Map(redistribution.updates.map((u) => [u.id, u]));
        setShots((prev) =>
          prev
            .filter((s) => s.id !== shotId)
            .map((s) => {
              const upd = updateMap.get(s.id);
              return upd
                ? { ...s, source_sentence: upd.source_sentence, source_sentence_fr: upd.source_sentence_fr }
                : s;
            })
        );

        setManifestHistory((prev) => [...prev, redistribution.action]);
      } else {
        setShots((prev) => prev.filter((s) => s.id !== shotId));
      }

      toast.success("Shot supprimé — fragments redistribués");
    } catch (e) {
      console.error("Delete exception:", e);
      toast.error("Erreur de suppression");
    }
  };

  const handleShotMergeWithNext = async (shotId: string) => {
    try {
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) return;

      const scene = scenes.find((sc) => sc.id === shot.scene_id);
      if (!scene) return;

      const sceneShots = shots.filter((s) => s.scene_id === shot.scene_id);
      const mergeResult = computeMerge(sceneShots, shotId, scene);
      if (!mergeResult) {
        toast.warning("Ce shot est le dernier de sa scène, pas de shot suivant à fusionner.");
        return;
      }

      const { survivorUpdate, absorbedId, action } = mergeResult;

      // Update the surviving shot
      const { error: updateError } = await supabase
        .from("shots")
        .update({ source_sentence: survivorUpdate.source_sentence, source_sentence_fr: survivorUpdate.source_sentence_fr })
        .eq("id", survivorUpdate.id);
      if (updateError) { toast.error("Erreur lors de la fusion"); return; }

      // Delete the absorbed shot
      const { error: deleteError } = await supabase.from("shots").delete().eq("id", absorbedId);
      if (deleteError) { toast.error("Erreur lors de la suppression du shot fusionné"); return; }

      // Reorder remaining shots in the scene
      const remainingSceneShots = sceneShots
        .filter((s) => s.id !== absorbedId)
        .sort((a, b) => a.shot_order - b.shot_order);
      for (let i = 0; i < remainingSceneShots.length; i++) {
        if (remainingSceneShots[i].shot_order !== i + 1) {
          await supabase.from("shots").update({ shot_order: i + 1 }).eq("id", remainingSceneShots[i].id);
        }
      }

      // Update local state
      setShots((prev) => {
        const updated = prev
          .filter((s) => s.id !== absorbedId)
          .map((s) =>
            s.id === survivorUpdate.id
              ? { ...s, source_sentence: survivorUpdate.source_sentence, source_sentence_fr: survivorUpdate.source_sentence_fr }
              : s
          );
        // Fix shot_order locally
        const sceneId = shot.scene_id;
        const sceneGroup = updated.filter((s) => s.scene_id === sceneId).sort((a, b) => a.shot_order - b.shot_order);
        const orderMap = new Map<string, number>();
        sceneGroup.forEach((s, i) => orderMap.set(s.id, i + 1));
        return updated.map((s) => orderMap.has(s.id) ? { ...s, shot_order: orderMap.get(s.id)! } : s);
      });

      setManifestHistory((prev) => [...prev, action]);
      toast.success("Shots fusionnés — fragments combinés");
    } catch (e) {
      console.error("Merge exception:", e);
      toast.error("Erreur lors de la fusion");
    }
  };

  const handleShotSplit = async (shotId: string, splitIndex: number) => {
    try {
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) return;

      const scene = scenes.find((sc) => sc.id === shot.scene_id);
      if (!scene) return;

      const sceneShots = shots.filter((s) => s.scene_id === shot.scene_id);
      const splitResult = computeSplit(sceneShots, shotId, splitIndex, scene);
      if (!splitResult) {
        toast.warning("Impossible de scinder ce shot.");
        return;
      }

      const { originalUpdate, newShot, orderUpdates, action } = splitResult;

      // Update original shot text
      const { error: updateError } = await supabase
        .from("shots")
        .update({ source_sentence: originalUpdate.source_sentence, source_sentence_fr: originalUpdate.source_sentence_fr })
        .eq("id", originalUpdate.id);
      if (updateError) { toast.error("Erreur lors de la scission"); return; }

      // Shift orders of subsequent shots
      for (const ou of orderUpdates) {
        await supabase.from("shots").update({ shot_order: ou.shot_order }).eq("id", ou.id);
      }

      // Insert new shot
      const { data: insertedShot, error: insertError } = await supabase
        .from("shots")
        .insert({
          scene_id: shot.scene_id,
          project_id: shot.project_id,
          shot_order: newShot.shot_order,
          shot_type: newShot.shot_type,
          description: newShot.description,
          source_sentence: newShot.source_sentence,
          source_sentence_fr: newShot.source_sentence_fr,
        })
        .select()
        .single();
      if (insertError || !insertedShot) { toast.error("Erreur lors de la création du nouveau shot"); return; }

      // Update local state
      setShots((prev) => {
        const updated = prev.map((s) => {
          if (s.id === originalUpdate.id) {
            return { ...s, source_sentence: originalUpdate.source_sentence, source_sentence_fr: originalUpdate.source_sentence_fr };
          }
          const ou = orderUpdates.find((o) => o.id === s.id);
          if (ou) return { ...s, shot_order: ou.shot_order };
          return s;
        });
        return [...updated, insertedShot].sort((a, b) => {
          if (a.scene_id !== b.scene_id) return 0;
          return a.shot_order - b.shot_order;
        });
      });

      setManifestHistory((prev) => [...prev, action]);
      toast.success("Shot scindé en deux !");
    } catch (e) {
      console.error("Split exception:", e);
      toast.error("Erreur lors de la scission");
    }
  };

  const handleShotRegenerate = async (shotId: string) => {
    setRegeneratingShots((prev) => ({ ...prev, [shotId]: true }));
    try {
      const session = (await supabase.auth.getSession()).data.session;
      // Resolve effective sensitive level for this shot
      const parentScene = shots.find((s) => s.id === shotId);
      const sceneId = parentScene?.scene_id;
      const effectiveLevel = sceneId
        ? sensitiveMode.resolveShot(sceneId, shotId).effectiveLevel
        : null;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-shot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            shot_id: shotId,
            ...(effectiveLevel != null ? { sensitive_level: effectiveLevel } : {}),
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || data?.error) throw new Error(data?.error || "Erreur");
      if (data.shot) {
        setShots((prev) => prev.map((s) => (s.id === data.shot.id ? data.shot : s)));
        toast.success("Prompt regénéré");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur de regénération");
    } finally {
      setRegeneratingShots((prev) => ({ ...prev, [shotId]: false }));
    }
  };

  // --- Image generation handlers ---
  // generatingSceneImages removed — all image gen routes through bgStartImageGen
  const [imageModel, setImageModel] = useState("google/gemini-2.5-flash-image");
  const [imageAspectRatio, setImageAspectRatio] = useState("16:9");
  const [shotImageModelOverrides, setShotImageModelOverrides] = useState<Record<string, string>>({});
  const [sceneImageModelOverrides, setSceneImageModelOverrides] = useState<Record<string, string>>({});
  const [galleryOpen, setGalleryOpen] = useState(false);
   const [openSceneIds, setOpenSceneIds] = useState<string[]>([]);
   const [imageOpenShots, setImageOpenShots] = useState<Set<string>>(new Set());
   const [showWarnings, setShowWarnings] = useState(false);
  const [manifestHistory, setManifestHistory] = useState<ManifestAction[]>([]);

  const IMAGE_MODELS = [
    { value: "google/gemini-2.5-flash-image", label: "Nano Banana", price: "0.02 $" },
    { value: "google/gemini-3.1-flash-image-preview", label: "Nano Banana 2", price: "0.06 $" },
    { value: "google/gemini-3-pro-image-preview", label: "Nano Banana Pro", price: "0.10 $" },
  ];

  const ASPECT_RATIOS = [
    { value: "16:9", label: "16:9 (Paysage)" },
    { value: "9:16", label: "9:16 (Portrait)" },
    { value: "1:1", label: "1:1 (Carré)" },
    { value: "4:3", label: "4:3 (Standard)" },
    { value: "3:2", label: "3:2 (Photo)" },
  ];

  const handleGenerateShotImage = async (shotId: string) => {
    if (!projectId || generatingAllImages) return;
    // Resolve effective sensitive level for this shot
    const parentScene = shots.find((s) => s.id === shotId);
    const sceneId = parentScene?.scene_id;
    const effectiveLevel = sceneId
      ? sensitiveMode.resolveShot(sceneId, shotId).effectiveLevel
      : null;
    const effectiveStyle = sceneId
      ? visualStyle.resolveShot(sceneId, shotId).effectiveStyleId
      : null;
    const shotModel = shotImageModelOverrides[shotId] || imageModel;
    bgStartImageGen({
      projectId,
      shotIds: [shotId],
      model: shotModel,
      aspectRatio: imageAspectRatio,
      ...(effectiveLevel != null ? { sensitiveLevels: { [shotId]: effectiveLevel } } : {}),
      ...(effectiveStyle != null ? { visualStyles: { [shotId]: effectiveStyle } } : {}),
    });
  };

  const imageGenTask = getTask(projectId ?? "", "image-gen");
  const generatingAllImages = imageGenTask?.status === "running";

  /** Build a map of shotId → effective sensitive level for a list of shots */
  const buildSensitiveLevelsMap = (shotList: typeof shots) => {
    const map: Record<string, number> = {};
    for (const s of shotList) {
      const resolved = sensitiveMode.resolveShot(s.scene_id, s.id);
      if (resolved.effectiveLevel != null) {
        map[s.id] = resolved.effectiveLevel;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  };

  /** Build a map of shotId → effective visual style for a list of shots */
  const buildVisualStylesMap = (shotList: typeof shots) => {
    const map: Record<string, string> = {};
    for (const s of shotList) {
      const resolved = visualStyle.resolveShot(s.scene_id, s.id);
      if (resolved.effectiveStyleId != null) {
        map[s.id] = resolved.effectiveStyleId;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  };

  // ── Re-translate all shot fragments ──
  const [retranslating, setRetranslating] = useState(false);
  const handleRetranslateFragments = async () => {
    if (!projectId || retranslating) return;
    const fragmentsToTranslate = shots
      .filter((s: any) => s.source_sentence && s.source_sentence.trim())
      .map((s: any) => ({ id: s.id, text: s.source_sentence.trim() }));
    if (fragmentsToTranslate.length === 0) {
      toast.info("Aucun fragment à traduire.");
      return;
    }
    setRetranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-fragments", {
        body: { fragments: fragmentsToTranslate, sourceLanguage: scriptLanguage },
      });
      if (error) throw error;
      const translations: Array<{ id: string; translated: string }> = data?.translations ?? [];
      if (translations.length === 0) {
        toast.warning("Aucune traduction retournée.");
        setRetranslating(false);
        return;
      }
      // Update DB
      for (const t of translations) {
        await supabase.from("shots").update({ source_sentence_fr: t.translated }).eq("id", t.id);
      }
      // Update local state
      setShots((prev: any[]) =>
        prev.map((s) => {
          const found = translations.find((t) => t.id === s.id);
          return found ? { ...s, source_sentence_fr: found.translated } : s;
        })
      );
      toast.success(`${translations.length} fragment(s) retraduit(s) avec succès.`);
    } catch (e: any) {
      console.error("Retranslate error:", e);
      toast.error("Erreur lors de la retraduction : " + (e.message || "Erreur inconnue"));
    } finally {
      setRetranslating(false);
    }
  };

  // ── Re-translate a single shot fragment ──
  const handleRetranslateSingleShot = async (shotId: string) => {
    const shot = shots.find((s: any) => s.id === shotId);
    if (!shot?.source_sentence) return;
    try {
      const { data, error } = await supabase.functions.invoke("translate-fragments", {
        body: { fragments: [{ id: shotId, text: shot.source_sentence.trim() }], sourceLanguage: scriptLanguage },
      });
      if (error) throw error;
      const translations: Array<{ id: string; translated: string }> = data?.translations ?? [];
      if (translations.length > 0) {
        const t = translations[0];
        await supabase.from("shots").update({ source_sentence_fr: t.translated }).eq("id", t.id);
        setShots((prev: any[]) => prev.map((s) => s.id === t.id ? { ...s, source_sentence_fr: t.translated } : s));
        toast.success("Fragment retraduit ✓");
      } else {
        toast.warning("Pas de traduction retournée.");
      }
    } catch (e: any) {
      toast.error("Erreur retraduction : " + (e.message || "Erreur"));
    }
  };

  // ── Convert numbers to French words in scenes + shots (reversible) ──
  const [convertingNumbers, setConvertingNumbers] = useState(false);
  const [numberConversionBackup, setNumberConversionBackup] = useState<{
    scenes: { id: string; source_text: string | null; source_text_fr: string | null }[];
    shots: { id: string; source_sentence: string | null; source_sentence_fr: string | null }[];
  } | null>(null);

  const convertAllNumbersToFrench = useCallback(async () => {
    if (!projectId) return;
    setConvertingNumbers(true);
    try {
      // Save backup before converting
      const sceneBackup = scenes.map(s => ({ id: s.id, source_text: s.source_text, source_text_fr: s.source_text_fr }));
      const shotBackup = shots.map(s => ({ id: s.id, source_sentence: s.source_sentence, source_sentence_fr: s.source_sentence_fr }));
      setNumberConversionBackup({ scenes: sceneBackup, shots: shotBackup });

      let sceneUpdates = 0;
      let shotUpdates = 0;

      for (const scene of scenes) {
        const updates: Record<string, string> = {};
        if (scene.source_text && hasDigits(scene.source_text)) {
          updates.source_text = convertNumbersToFrench(scene.source_text);
        }
        if (scene.source_text_fr && hasDigits(scene.source_text_fr)) {
          updates.source_text_fr = convertNumbersToFrench(scene.source_text_fr);
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("scenes").update(updates).eq("id", scene.id);
          if (!error) sceneUpdates++;
        }
      }

      for (const shot of shots) {
        const updates: Record<string, string> = {};
        if (shot.source_sentence && hasDigits(shot.source_sentence)) {
          updates.source_sentence = convertNumbersToFrench(shot.source_sentence);
        }
        if (shot.source_sentence_fr && hasDigits(shot.source_sentence_fr)) {
          updates.source_sentence_fr = convertNumbersToFrench(shot.source_sentence_fr);
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("shots").update(updates).eq("id", shot.id);
          if (!error) shotUpdates++;
        }
      }

      const { data: freshScenes } = await supabase
        .from("scenes").select("*").eq("project_id", projectId).order("scene_order");
      if (freshScenes) setScenes(freshScenes);

      const { data: freshShots } = await supabase
        .from("shots").select("*").eq("project_id", projectId).order("shot_order");
      if (freshShots) setShots(freshShots);

      toast.success(`Conversion terminée — ${sceneUpdates} scène(s) et ${shotUpdates} shot(s) mis à jour`);
    } catch (err) {
      console.error("convertAllNumbersToFrench error:", err);
      toast.error("Erreur lors de la conversion");
    } finally {
      setConvertingNumbers(false);
    }
  }, [projectId, scenes, shots]);

  const revertNumberConversion = useCallback(async () => {
    if (!projectId || !numberConversionBackup) return;
    setConvertingNumbers(true);
    try {
      for (const b of numberConversionBackup.scenes) {
        await supabase.from("scenes").update({
          source_text: b.source_text,
          source_text_fr: b.source_text_fr,
        }).eq("id", b.id);
      }
      for (const b of numberConversionBackup.shots) {
        await supabase.from("shots").update({
          source_sentence: b.source_sentence,
          source_sentence_fr: b.source_sentence_fr,
        }).eq("id", b.id);
      }

      const { data: freshScenes } = await supabase
        .from("scenes").select("*").eq("project_id", projectId).order("scene_order");
      if (freshScenes) setScenes(freshScenes);

      const { data: freshShots } = await supabase
        .from("shots").select("*").eq("project_id", projectId).order("shot_order");
      if (freshShots) setShots(freshShots);

      setNumberConversionBackup(null);
      toast.success("Conversion annulée — textes originaux restaurés");
    } catch (err) {
      console.error("revertNumberConversion error:", err);
      toast.error("Erreur lors de la restauration");
    } finally {
      setConvertingNumbers(false);
    }
  }, [projectId, numberConversionBackup]);


  const handleGenerateAllImages = () => {
    if (!projectId || generatingAllImages) return;
    const missingShots = shots
      .filter((s) => !s.image_url)
      .sort((a, b) => {
        const scA = scenes.find((sc) => sc.id === a.scene_id)?.scene_order ?? 0;
        const scB = scenes.find((sc) => sc.id === b.scene_id)?.scene_order ?? 0;
        return scA !== scB ? scA - scB : a.shot_order - b.shot_order;
      });
    if (missingShots.length === 0) return;
    bgStartImageGen({
      projectId,
      shotIds: missingShots.map((s) => s.id),
      model: imageModel,
      aspectRatio: imageAspectRatio,
      sensitiveLevels: buildSensitiveLevelsMap(missingShots),
      visualStyles: buildVisualStylesMap(missingShots),
    });
  };

  const stopImageGeneration = () => {
    if (projectId) stopTask(projectId, "image-gen");
  };

  // Refresh shots when image gen task completes or progresses
  useEffect(() => {
    if (!projectId) return;
    return subscribe(projectId, "image-gen", (task) => {
      // Reload shots from DB to get updated image_urls
      supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true }).then(({ data }) => {
        if (data) {
          const { reordered } = reorderShotsByReadingPosition(data as Shot[], scenes);
          setShots(reordered);
        }
      });
    });
  }, [projectId, subscribe]);

  // Auto-detect object↔shot links after image generation completes
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.projectId !== projectId) return;
      const recurringObjects = (globalContext?.objets_recurrents as RecurringObject[]) || [];
      if (!recurringObjects.length || !shots.length) return;

      try {
        const objectsPayload = recurringObjects.map(o => ({
          id: o.id,
          nom: o.nom,
          type: o.type,
          description_visuelle: o.description_visuelle,
        }));
        const shotsPayload = shots.map(s => ({
          id: s.id,
          scene_id: s.scene_id,
          source_sentence: s.source_sentence,
          source_sentence_fr: s.source_sentence_fr,
          description: s.description,
        }));

        const { data, error } = await supabase.functions.invoke("detect-object-shots", {
          body: { objects: objectsPayload, shots: shotsPayload },
        });

        if (error || data?.error) {
          console.warn("Auto-detect object shots failed:", error || data?.error);
          return;
        }

        const results = data?.results as Record<string, string[]> | undefined;
        if (!results) return;

        const updated = recurringObjects.map(obj => {
          const aiShotIds = results[obj.id] || [];
          const existing = obj.mentions_shots || [];
          const merged = Array.from(new Set([...existing, ...aiShotIds]));
          return { ...obj, mentions_shots: merged };
        });

        handleObjectRegistryChange(updated);
        const totalDetected = Object.values(results).reduce((sum, ids) => sum + ids.length, 0);
        if (totalDetected > 0) {
          toast.success(`Auto-détection : ${totalDetected} liaison(s) objet↔shot trouvée(s)`);
        }
      } catch (err) {
        console.warn("Auto-detect object shots error:", err);
      }
    };

    window.addEventListener("image-gen-complete", handler);
    return () => window.removeEventListener("image-gen-complete", handler);
  }, [projectId, shots, globalContext, handleObjectRegistryChange]);

  const handleGenerateSceneImages = (sceneId: string) => {
    if (!projectId || generatingAllImages) return;
    const sceneShots = shots
      .filter((s) => s.scene_id === sceneId)
      .sort((a, b) => a.shot_order - b.shot_order);
    if (sceneShots.length === 0) return;
    const sceneModel = sceneImageModelOverrides[sceneId] || imageModel;
    bgStartImageGen({
      projectId,
      shotIds: sceneShots.map((s) => s.id),
      model: sceneModel,
      aspectRatio: imageAspectRatio,
      sensitiveLevels: buildSensitiveLevelsMap(sceneShots),
      visualStyles: buildVisualStylesMap(sceneShots),
    });
  };

  const downloadAllImages = useCallback(async () => {
    const zip = new JSZip();
    let shotIndex = 1;
    const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
    let count = 0;
    for (const scene of sortedScenes) {
      const sceneShots = shots.filter((s) => s.scene_id === scene.id).sort((a, b) => a.shot_order - b.shot_order);
      for (const shot of sceneShots) {
        const url = (shot as any).image_url;
        if (url) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const blob = await resp.blob();
              const ext = blob.type.includes("png") ? "png" : "jpg";
              zip.file(`SHOT ${shotIndex}.${ext}`, blob);
              count++;
            }
          } catch { /* skip */ }
        }
        shotIndex++;
      }
    }
    if (count === 0) {
      toast.error("Aucun visuel à exporter");
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}_visuels.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${count} visuel(s) exporté(s)`);
  }, [scenes, shots, title]);

  // --- Export helpers ---
  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateVisualPrompts = useCallback(() => {
    let md = "";
    let shotIndex = 1;
    scenes.forEach((scene) => {
      getShotsForScene(scene.id).forEach((shot) => {
        const prompt = shot.prompt_export || shot.description;
        md += `SHOT ${shotIndex}: ${prompt}\n\n`;
        shotIndex++;
      });
    });
    downloadFile(md, `${title.replace(/\s+/g, "_")}_visual_prompts.md`);
    toast.success("Visual Prompts exportés");
  }, [title, scenes, shots]);

  const generateSceneMapping = useCallback(() => {
    let md = `# Scene Mapping — ${title}\n\n`;
    let globalShotIndex = 1;
    scenes.forEach((scene) => {
      md += `## Scène ${scene.scene_order} — ${scene.title}\n\n`;
      md += `### Narration (extrait du script)\n\n> **${scene.source_text}**\n\n`;
      const sceneShots = getShotsForScene(scene.id);
      if (sceneShots.length > 0) {
        md += `### Shots associés\n\n`;
        sceneShots.forEach((shot) => {
          md += `- **Shot ${globalShotIndex} — ${shot.shot_type}**: ${shot.description}`;
          if (shot.guardrails) md += ` [${shot.guardrails}]`;
          md += `\n`;
          globalShotIndex++;
        });
        md += `\n`;
      }
    });
    downloadFile(md, `${title.replace(/\s+/g, "_")}_scene_mapping.md`);
    toast.success("Scene Mapping exporté");
  }, [title, scenes, shots]);

  const generateNarrationSegmentation = useCallback(() => {
    let md = `# Narration Segmentation — ${title}\n\n`;
    scenes.forEach((scene) => {
      md += `---\n\n### Scène ${scene.scene_order} — ${scene.title}\n\n${scene.source_text}\n\n`;
    });
    downloadFile(md, `${title.replace(/\s+/g, "_")}_narration_segmentation.md`);
    toast.success("Narration Segmentation exportée");
  }, [title, scenes]);

  const cleanScriptForExport = (raw: string): string => {
    // Strip editorial blocks (TRANSITIONS, STYLE CHECK, RISK CHECK) and all content after them
    const withoutEditorial = raw.replace(/\[\[\s*(TRANSITIONS|STYLE\s*CHECK|RISK\s*CHECK)\s*\]\][\s\S]*/i, "").trim();
    const cleaned = withoutEditorial
      .replace(/\[\[(HOOK|CONTEXT|PROMISE|ACT[123]B?|CLIMAX|INSIGHT|CONCLUSION)\]\]\s*/gi, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("---") && line.trim() !== "")
      .map((line) => line.trim())
      .join("\n");
    return applyFrenchTypography(cleaned);
  };

  const splitIntoVoiceOverBlocks = (raw: string): string[] => {
    const clean = cleanScriptForExport(raw);
    const sentences = clean.split(/(?<=\.)\s+/);
    const blocks: string[] = [];
    let currentBlock = "";
    for (const sentence of sentences) {
      const candidate = currentBlock ? currentBlock + " " + sentence : sentence;
      if (candidate.length > 8300 && currentBlock.length > 0) {
        blocks.push(currentBlock.trim());
        currentBlock = sentence;
      } else {
        currentBlock = candidate;
      }
    }
    if (currentBlock.trim()) blocks.push(currentBlock.trim());
    return blocks;
  };

  const generateScriptNarratif = useCallback(() => {
    if (!generatedScript) return;
    const clean = cleanScriptForExport(generatedScript);
    downloadFile(clean, `${title.replace(/\s+/g, "_")}_script_narratif.md`);
    toast.success("Script Narratif exporté");
  }, [title, generatedScript]);

  const generateVoiceOverBlocks = useCallback(() => {
    if (!generatedScript) return;
    const blocks = splitIntoVoiceOverBlocks(generatedScript);
    const output = blocks.map((block, i) => `Voice Over Block ${i + 1} (${block.length} chars)\n\n${block}`).join("\n\n---\n\n");
    downloadFile(output, `${title.replace(/\s+/g, "_")}_voice_over_blocks.md`);
    toast.success(`${blocks.length} bloc(s) Voice Over exporté(s)`);
  }, [title, generatedScript]);

  const downloadAllVideos = useCallback(async () => {
    if (!projectId) return;
    toast.info("Récupération des vidéos…");
    const { data: gens } = await supabase
      .from("video_generations")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    const completed = (gens ?? []).filter((g: any) => g.result_video_url);
    if (completed.length === 0) {
      toast.warning("Aucune vidéo générée à exporter");
      return;
    }

    // Build global shot index map
    const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
    const globalIndexMap = new Map<string, number>();
    let gIdx = 1;
    for (const sc of sortedScenes) {
      const scShots = shots.filter((s) => s.scene_id === sc.id).sort((a, b) => a.shot_order - b.shot_order);
      for (const sh of scShots) {
        globalIndexMap.set(sh.id, gIdx);
        gIdx++;
      }
    }

    const zip = new JSZip();
    let count = 0;
    for (const gen of completed) {
      try {
        const resp = await fetch((gen as any).result_video_url);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const shotIdx = (gen as any).source_shot_id ? globalIndexMap.get((gen as any).source_shot_id) : null;
        const shotLabel = shotIdx ? `Shot_${String(shotIdx).padStart(4, "0")}` : "External";
        const createdDate = new Date((gen as any).created_at);
        const dateStr = createdDate.toISOString().slice(0, 10);
        const timeStr = `${String(createdDate.getHours()).padStart(2, "0")}h${String(createdDate.getMinutes()).padStart(2, "0")}`;
        const fileName = `${shotLabel}_${(gen as any).duration_sec}s_${dateStr}_${timeStr}.mp4`;
        zip.file(fileName, blob);
        count++;
      } catch (e) {
        console.warn("Failed to download video for zip:", e);
      }
    }

    if (count === 0) {
      toast.error("Impossible de télécharger les vidéos");
      return;
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}_videos.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${count} vidéo(s) exportée(s)`);
  }, [projectId, title, scenes, shots]);

  const downloadAll = useCallback(async () => {
    const zip = new JSZip();
    const prefix = title.replace(/\s+/g, "_");

    if (generatedScript) {
      zip.file(`${prefix}_script_narratif.md`, cleanScriptForExport(generatedScript));
      const blocks = splitIntoVoiceOverBlocks(generatedScript);
      const voOutput = blocks.map((block, i) => `Voice Over Block ${i + 1} (${block.length} chars)\n\n${block}`).join("\n\n---\n\n");
      zip.file(`${prefix}_voice_over_blocks.md`, voOutput);
    }

    if (scenes.length > 0) {
      // Visual Prompts
      let vp = "";
      let shotIdx = 1;
      scenes.forEach((scene) => {
        getShotsForScene(scene.id).forEach((shot) => {
          vp += `SHOT ${shotIdx}: ${shot.prompt_export || shot.description}\n\n`;
          shotIdx++;
        });
      });
      zip.file(`${prefix}_visual_prompts.md`, vp);

      // Scene Mapping
      let sm = `# Scene Mapping — ${title}\n\n`;
      let gsi = 1;
      scenes.forEach((scene) => {
        sm += `## Scène ${scene.scene_order} — ${scene.title}\n\n`;
        sm += `### Narration (extrait du script)\n\n> **${scene.source_text}**\n\n`;
        const sceneShots = getShotsForScene(scene.id);
        if (sceneShots.length > 0) {
          sm += `### Shots associés\n\n`;
          sceneShots.forEach((shot) => {
            sm += `- **Shot ${gsi} — ${shot.shot_type}**: ${shot.description}`;
            if (shot.guardrails) sm += ` [${shot.guardrails}]`;
            sm += `\n`;
            gsi++;
          });
          sm += `\n`;
        }
      });
      zip.file(`${prefix}_scene_mapping.md`, sm);

      // Narration Segmentation
      let ns = `# Narration Segmentation — ${title}\n\n`;
      scenes.forEach((scene) => {
        ns += `---\n\n### Scène ${scene.scene_order} — ${scene.title}\n\n${scene.source_text}\n\n`;
      });
      zip.file(`${prefix}_narration_segmentation.md`, ns);
    }

    if (Object.keys(zip.files).length === 0) {
      toast.error("Aucun fichier à exporter");
      return;
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}_export.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Tous les fichiers exportés");
  }, [title, generatedScript, scenes, shots]);

  if (loadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const validatedCount = scenes.filter((s) => s.validated).length;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="border-b border-border shrink-0 sticky top-0 z-40 bg-background">
        <div className="flex h-14 items-center px-4 gap-2 sm:gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Film className="h-5 w-5 text-primary shrink-0" />
          <span className="font-display font-semibold text-foreground truncate text-sm sm:text-base">{title || "Nouveau projet"}</span>
          {!showSetup && (
            <>
              {/* Desktop tabs */}
              <div className="ml-auto hidden sm:flex items-center gap-1">
                {tabItems.map((t) => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${activeTab === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <t.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{t.label}</span>
                  </button>
                ))}
              </div>
              {/* Mobile hamburger */}
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="ml-auto sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-muted-foreground hover:text-foreground">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>
        {/* Mobile tab menu */}
        {!showSetup && mobileMenuOpen && (
          <div className="sm:hidden border-t border-border bg-background px-4 py-2 space-y-1 animate-fade-in">
            {tabItems.map((t) => (
              <button key={t.key} onClick={() => { setActiveTab(t.key); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2.5 rounded text-sm transition-colors min-h-[44px] ${activeTab === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-auto">
        {/* New project setup */}
        {showSetup && (
          <div className="container max-w-lg py-6 sm:py-10 px-4 animate-fade-in">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">Nouveau projet</h2>
            <p className="text-sm text-muted-foreground mb-8">Décrivez votre projet documentaire pour commencer.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Titre du projet *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 sm:h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. La Route de la Soie — Épisode 3" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Sujet / description</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-11 sm:h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. Commerce historique entre Orient et Occident" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Langue du script</label>
                <select value={scriptLanguage} onChange={(e) => setScriptLanguage(e.target.value)}
                  className="w-full h-11 sm:h-10 rounded border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-8">
              <Button variant="hero" onClick={saveProject} disabled={saving || !title.trim()} className="w-full sm:w-auto min-h-[44px]">
                {saving ? "Création..." : "Créer le projet"}
              </Button>
            </div>
          </div>
        )}

        {/* ScriptInput tab removed — now integrated into ScriptCreator */}

        {/* RsearchEngine tab — kept mounted to preserve state */}
        {!showSetup && (
          <div className={activeTab === "rsearch" ? "" : "hidden"}>
            <RsearchEngineTab
              projectId={projectId}
              projectTitle={title}
              onSendToScriptCreator={(text) => {
                setNarration(text);
                setPdfExtractedText(text);
                setPdfAnalysis(null);
                setGeneratedScript(null);
                setActiveTab("script-creator");
              }}
            />
          </div>
        )}

        {/* ScriptCreator tab — kept mounted to preserve state */}
        {!showSetup && (
          <div className={activeTab === "script-creator" ? "" : "hidden"}>
            <PdfDocumentaryTab
              projectId={projectId}
              scriptLanguage={scriptLanguage}
              onLanguageChange={(lang) => setScriptLanguage(lang)}
              onSendToNarration={(text) => {
                setNarration(text);
              }}
              onAnalysisReady={(analysis, text) => {
                setPdfAnalysis(analysis);
                setPdfExtractedText(text);
              }}
              onScriptReady={(script) => {
                setGeneratedScript(script);
              }}
              extractedText={pdfExtractedText}
              onExtractedTextChange={setPdfExtractedText}
              pageCount={pdfPageCount}
              onPageCountChange={setPdfPageCount}
              fileName={pdfFileName}
              onFileNameChange={setPdfFileName}
              analysis={pdfAnalysis}
              onAnalysisChange={setPdfAnalysis}
              docStructure={pdfDocStructure}
              onDocStructureChange={setPdfDocStructure}
              script={generatedScript}
              onScriptChange={setGeneratedScript}
              scriptVersions={scriptVersions}
              onScriptVersionsChange={setScriptVersions}
              currentVersionId={currentScriptVersionId}
              onCurrentVersionIdChange={setCurrentScriptVersionId}
              narration={narration}
              onNarrationChange={setNarration}
              onRunSegmentation={runSegmentation}
              segmenting={segmenting}
              onStopSegmentation={stopSegmentation}
              shots={shots}
              scenesForShotOrder={scenes.map((scene) => ({ id: scene.id, scene_order: scene.scene_order }))}
            />
          </div>
        )}

        {/* SEO tab — kept mounted to preserve state */}
        {!showSetup && (
          <div className={activeTab === "seo" ? "" : "hidden"}>
            <SeoTab
              projectId={projectId}
              analysis={pdfAnalysis}
              extractedText={pdfExtractedText}
              narration={narration}
              scriptLanguage={scriptLanguage}
              seoResults={seoResults}
              onSeoResultsChange={setSeoResults}
            />
          </div>
        )}

        {/* Content Publish tab */}
        {!showSetup && activeTab === "cp" && (
          <ContentPublishTab
            generatedScript={generatedScript}
            seoResults={seoResults}
            scenes={scenes}
            shots={shots}
          />
        )}

        {/* VO — Voice Over tab */}
        {!showSetup && activeTab === "vo" && (
          <VoiceOverStudio
            narration={narration}
            generatedScript={generatedScript}
            projectId={projectId}
            projectTitle={title}
            scenes={scenes.map((s) => ({ id: s.id, source_text: s.source_text, title: s.title }))}
            shots={shots.map((s) => ({ id: s.id, scene_id: s.scene_id, shot_order: s.shot_order, source_sentence: s.source_sentence, source_sentence_fr: s.source_sentence_fr, description: s.description }))}
            scenesForSort={scenes.map((s) => ({ id: s.id, scene_order: s.scene_order }))}
            onMusicSelected={(tracks) => setSelectedMusicTracks(tracks)}
          />
        )}

        {/* VidéoEdit tab */}
        {!showSetup && activeTab === "videoedit" && (
          <VideoEditTab
            projectId={projectId}
            scenes={scenes}
            shots={shots}
            exportBlocked={!qaExportAllowed}
            musicTracks={selectedMusicTracks}
          />
        )}

        {/* VideoPrompts tab */}
        {!showSetup && activeTab === "videoprompts" && projectId && (
          <VideoPromptsTab
            projectId={projectId}
            scenes={scenes}
            shots={shots}
          />
        )}

        {!showSetup && activeTab === "segmentation" && (
          <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-1">Segmentation View</h2>
                <p className="text-sm text-muted-foreground">
                  Votre narration découpée en SceneBlocks.
                  {scenes.length > 0 && (
                    <span className="ml-2 text-primary">{validatedCount}/{scenes.length} validées</span>
                  )}
                </p>
              </div>
              {segmenting && (
                <Button variant="destructive" size="sm" onClick={stopSegmentation} className="min-h-[40px] shrink-0">
                  <Square className="h-4 w-4" /> Stopper
                </Button>
              )}
              {!segmenting && scenes.length > 0 && (
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button variant="outline" size="sm" onClick={runSegmentation} disabled={segmenting} className="min-h-[40px]">
                    <Play className="h-4 w-4" /> Re-segmenter
                  </Button>
                  {scenes.some(s => hasDigits(s.source_text || "") || hasDigits(s.source_text_fr || "")) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={convertAllNumbersToFrench}
                      disabled={convertingNumbers}
                      className="min-h-[40px] text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      {convertingNumbers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                      Chiffres → Lettres
                    </Button>
                  )}
                  {numberConversionBackup && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={revertNumberConversion}
                      disabled={convertingNumbers}
                      className="min-h-[40px] text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
                    >
                      <Undo2 className="h-4 w-4" />
                      Annuler conversion
                    </Button>
                  )}
                  <Button variant="hero" size="sm" onClick={() => runStoryboard(undefined, { segmentOnly: true })} disabled={generatingStoryboard} className="min-h-[40px]">
                    {generatingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                    Créer les SHOTS
                  </Button>
                </div>
              )}
            </div>

            {/* Scene version buttons */}
            {sceneVersions.length > 1 && !segmenting && (
              <div className="mb-4 flex items-center gap-1.5 flex-wrap">
                {sceneVersions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      if (v.id === currentSceneVersionId) {
                        setPreviewSceneVersionId(null);
                        return;
                      }
                      setPreviewSceneVersionId(previewSceneVersionId === v.id ? null : v.id);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      currentSceneVersionId === v.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : previewSceneVersionId === v.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    V{v.id}
                    {currentSceneVersionId === v.id && (
                      <span className="ml-1 text-[9px] opacity-70">actuelle</span>
                    )}
                    <span className="ml-1 text-[9px] opacity-60">({v.scenes.length})</span>
                  </button>
                ))}
                {previewSceneVersionId !== null && (() => {
                  const pv = sceneVersions.find((v) => v.id === previewSceneVersionId);
                  if (!pv) return null;
                  return (
                    <Button variant="outline" size="sm" onClick={() => {
                      setScenes(pv.scenes);
                      setCurrentSceneVersionId(pv.id);
                      setPreviewSceneVersionId(null);
                      toast.success(`Segmentation V${pv.id} restaurée`);
                    }} className="h-6 text-[10px] px-2 ml-2">
                      <RotateCcw className="h-2.5 w-2.5" /> Restaurer V{pv.id}
                    </Button>
                  );
                })()}
              </div>
            )}

            {segmenting && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyse de la narration en cours...</p>
              </div>
            )}

            {!segmenting && scenes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Layers className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Aucune scène. Lancez la segmentation depuis l'onglet ScriptCreator.</p>
                <Button variant="outline" onClick={() => setActiveTab("script-creator")}>
                  <ArrowLeft className="h-4 w-4" /> Retour à ScriptCreator
                </Button>
              </div>
            )}

            {!segmenting && scenes.length > 0 && (
              <>
                {/* ContexteGlobal display */}
                {globalContext && (
                  <details className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5 group/ctx">
                    <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open/ctx:rotate-90 shrink-0" />
                      🧠 Contexte Global
                      <span className="ml-1 text-xs text-muted-foreground font-normal">— Mémoire de référence du script</span>
                    </summary>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="space-y-2">
                        <div><span className="font-medium text-foreground">Sujet :</span> <span className="text-muted-foreground">{globalContext.sujet_principal}</span></div>
                        <div><span className="font-medium text-foreground">Lieu :</span> <span className="text-muted-foreground">{globalContext.lieu_principal}</span></div>
                        <div><span className="font-medium text-foreground">Époque :</span> <span className="text-muted-foreground">{globalContext.epoque}</span></div>
                        <div><span className="font-medium text-foreground">Ton :</span> <span className="text-muted-foreground">{globalContext.ton}</span></div>
                        <div><span className="font-medium text-foreground">Ambiance :</span> <span className="text-muted-foreground">{globalContext.ambiance}</span></div>
                        <div><span className="font-medium text-foreground">Décor :</span> <span className="text-muted-foreground">{globalContext.type_decor}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div><span className="font-medium text-foreground">Narration :</span> <span className="text-muted-foreground">{globalContext.type_narration}</span></div>
                        <div><span className="font-medium text-foreground">Marqueurs :</span> <span className="text-muted-foreground">{globalContext.marqueurs_culturels}</span></div>
                        <div><span className="font-medium text-foreground">Technologie :</span> <span className="text-muted-foreground">{globalContext.niveau_technologique}</span></div>
                        {globalContext.personnages?.length > 0 && (
                          <div>
                            <span className="font-medium text-foreground">Personnages ({globalContext.nombre_personnages}) :</span>
                            <ul className="mt-1 ml-4 list-disc text-muted-foreground text-xs space-y-0.5">
                              {globalContext.personnages.map((p: any, i: number) => (
                                <li key={i}><span className="font-medium">{p.nom}</span> — {p.role}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {globalContext.contexte_narratif && (
                        <div className="sm:col-span-2 mt-1">
                          <span className="font-medium text-foreground">Contexte narratif :</span>
                          <p className="text-muted-foreground text-xs mt-1 leading-relaxed italic">{globalContext.contexte_narratif}</p>
                        </div>
                      )}
                      {globalContext.indices_visuels?.length > 0 && (
                        <div className="sm:col-span-2">
                          <span className="font-medium text-foreground">Indices visuels :</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {globalContext.indices_visuels.map((idx: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{idx}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Full narration with French translation */}
                {scriptLanguage !== "fr" && (
                  <details className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5 group/trad">
                    <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open/trad:rotate-90 shrink-0" />
                      🇫🇷 Traduction française du narratif
                    </summary>
                    <div className="mt-3">
                      {scenes.some((s) => s.source_text_fr) ? (
                        <div className="max-h-[300px] overflow-y-auto rounded border border-border bg-background p-3 sm:p-4">
                          <p className="text-sm text-muted-foreground leading-relaxed italic font-body">
                            {scenes.map((s) => s.source_text_fr || "").filter(Boolean).join(" ")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Aucune traduction disponible. Relancez la segmentation pour générer les traductions françaises.</p>
                      )}
                    </div>
                  </details>
                )}
                {/* Object Registry Panel */}
                <ObjectRegistryPanel
                  objects={(globalContext?.objets_recurrents as RecurringObject[]) || []}
                  onChange={handleObjectRegistryChange}
                  sceneCount={scenes.length}
                  onReanalyze={handleReanalyzeContext}
                  onSearchMore={handleSearchMoreRecurrences}
                  isAnalyzing={isContextAnalyzing}
                  shots={shots}
                  scenes={scenes}
                  scriptLanguage={scriptLanguage}
                />

                {/* Segmentation QA Panel */}
                <SegmentationQaPanel scenes={scenes} />

                <div className="space-y-4">
                  {scenes.map((scene, i) => (
                    <SceneBlock
                      key={scene.id}
                      scene={scene}
                      index={i}
                      isFirst={i === 0}
                      isLast={i === scenes.length - 1}
                      previousScene={scenes[i - 1]}
                      nextScene={scenes[i + 1]}
                      onUpdate={handleSceneUpdate}
                      onDelete={handleSceneDelete}
                      onMergeWithNext={handleMergeWithNext}
                      onSplit={handleSplit}
                      onToggleValidated={handleToggleValidated}
                    />
                  ))}
                </div>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" onClick={runSegmentation} disabled={segmenting} className="min-h-[44px]">
                    <Play className="h-4 w-4" /> Re-segmenter
                  </Button>
                  <Button variant="hero" onClick={() => runStoryboard(undefined, { segmentOnly: true })} disabled={generatingStoryboard} className="min-h-[44px]">
                    {generatingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                    {generatingStoryboard ? "Découpage..." : "Créer les SHOTS"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Storyboard View */}
        {!showSetup && activeTab === "storyboard" && (
          <>
          <div className="container max-w-5xl py-6 sm:py-10 px-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-2">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground">VisualPrompts</h2>
                  {scenes.length > 0 && (
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {shots.length} shot{shots.length > 1 ? "s" : ""} / {scenes.length} scène{scenes.length > 1 ? "s" : ""}
                      {generatingStoryboard && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                    </span>
                  )}
                </div>
                {(() => {
                  const shotsWithPrompt = shots.filter((s) => s.prompt_export && s.prompt_export.trim().length > 0).length;
                  const shotsWithImage = shots.filter((s) => s.image_url).length;
                  const sortedSc = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
                  const completedScenes = sortedSc.filter((sc) => {
                    const scShots = shots.filter((s) => s.scene_id === sc.id);
                    return scShots.length > 0 && scShots.every((s) => s.image_url);
                  }).length;
                  return (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Prompts générés pour : <span className="font-semibold text-foreground">{shotsWithPrompt} shot{shotsWithPrompt > 1 ? "s" : ""}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Visuels générés pour : <span className="font-semibold text-foreground">{shotsWithImage} shot{shotsWithImage > 1 ? "s" : ""}</span> / <span className="font-semibold text-foreground">{completedScenes} scène{completedScenes > 1 ? "s" : ""}</span>
                      </p>
                    </>
                  );
                })()}
                {shots.some((s) => s.generation_cost > 0) && (
                  <p className="text-xs font-medium text-primary mt-1">
                    Coût total Cloud + AI : {shots.reduce((sum, s) => sum + (s.generation_cost ?? 0), 0).toFixed(2)} $
                  </p>
                )}
              </div>
              {generatingStoryboard && (
                <Button variant="destructive" size="sm" onClick={stopStoryboard} className="min-h-[40px] shrink-0">
                  <Square className="h-4 w-4" /> Stopper
                </Button>
              )}
            </div>

            {/* ── Global Sensitive Mode — Toutes les scènes d'un coup ── */}
            {scenes.length > 0 && !generatingStoryboard && (
              <details className="mb-4 rounded border border-border bg-card p-3 sm:p-4 group/details">
                <summary className="text-sm font-medium text-foreground cursor-pointer hover:text-foreground/80 transition-colors flex items-center gap-2 min-h-[44px] sm:min-h-0 list-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open/details:rotate-90 shrink-0" />
                  <Layers className="h-4 w-4 text-primary" />
                  Actions communes à toutes les scènes
                </summary>
                <div className="space-y-3 mt-3">
                <ScopeOverrideControl
                  value={sensitiveMode.getGlobalValue()}
                  onChangeLocal={sensitiveMode.setGlobalLevel}
                  scopeLabel="Toutes les scènes d'un coup"
                  parentLabel={undefined}
                />

                {/* Actions globales shots */}
                <div className="pt-2 border-t border-border/50 flex flex-col gap-2">
                  <div className="flex gap-2 flex-wrap items-center">
                    <Button variant="outline" size="sm" onClick={() => runStoryboard(undefined, { segmentOnly: true })} disabled={generatingStoryboard} className="min-h-[40px]">
                      <Play className="h-4 w-4" /> Redécouper tous les shots
                    </Button>
                    <Button variant="hero" size="sm" onClick={() => runStoryboard(undefined, { promptOnly: true })} disabled={generatingStoryboard || shots.length === 0} className="min-h-[40px]">
                      {generatingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                      Générer tous les prompts
                    </Button>
                    <Button variant="default" size="sm" onClick={() => setGalleryOpen(true)} disabled={!shots.some((s: any) => s.image_url)} className="min-h-[40px] gap-1.5">
                      <ImageIcon className="h-4 w-4" /> Voir tous les visuels
                    </Button>
                    {scriptLanguage !== "fr" && (
                      <Button variant="outline" size="sm" onClick={handleRetranslateFragments} disabled={retranslating || shots.length === 0} className="min-h-[40px]">
                        {retranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                        {retranslating ? "Retraduction..." : "Retraduire les fragments 🇫🇷"}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">IA :</span>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {IMAGE_MODELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label} — {m.price}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Format :</span>
                      <select
                        value={imageAspectRatio}
                        onChange={(e) => setImageAspectRatio(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {ASPECT_RATIOS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">🎨 Style :</span>
                      <VisualStyleSelector
                        value={visualStyle.getGlobalValue()}
                        onChange={visualStyle.setGlobalStyleId}
                        scopeLabel="Toutes les scènes"
                        compact
                      />
                    </div>
                    {generatingAllImages ? (
                      <div className="flex items-center gap-2">
                        <Button variant="destructive" size="sm" onClick={stopImageGeneration} className="min-h-[40px]">
                          <Square className="h-4 w-4" /> Stopper la génération
                          {imageGenTask?.completedShots != null && imageGenTask?.totalShots
                            ? ` (${imageGenTask.successShots ?? 0}✓ — ${imageGenTask.completedShots}/${imageGenTask.totalShots})`
                            : ""}
                        </Button>
                        {imageGenTask?.imageGenModel && (
                          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                            🤖 {IMAGE_MODELS.find((m) => m.value === imageGenTask.imageGenModel)?.label ?? imageGenTask.imageGenModel}
                            {" — "}
                            {IMAGE_MODELS.find((m) => m.value === imageGenTask.imageGenModel)?.price ?? "?"}
                          </span>
                        )}
                      </div>
                    ) : (() => {
                      const hasAnyImage = shots.some((s: any) => s.image_url);
                      const allHaveImages = shots.length > 0 && shots.every((s: any) => s.image_url);
                      return (
                        <Button variant="hero" size="sm" onClick={handleGenerateAllImages} disabled={allHaveImages} className="min-h-[40px]">
                          <ImageIcon className="h-4 w-4" />
                          {hasAnyImage ? "Créer les visuels manquants" : "Créer tous les visuels"}
                        </Button>
                      );
                    })()}
                  </div>
                </div>
                </div>
              </details>
            )}

            {/* Shot version buttons */}
            {shotVersions.length > 1 && !generatingStoryboard && (
              <div className="mb-4 flex items-center gap-1.5 flex-wrap">
                {shotVersions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      if (v.id === currentShotVersionId) {
                        setPreviewShotVersionId(null);
                        return;
                      }
                      setPreviewShotVersionId(previewShotVersionId === v.id ? null : v.id);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      currentShotVersionId === v.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : previewShotVersionId === v.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    V{v.id}
                    {currentShotVersionId === v.id && (
                      <span className="ml-1 text-[9px] opacity-70">actuelle</span>
                    )}
                    <span className="ml-1 text-[9px] opacity-60">({(v.shots ?? []).length})</span>
                  </button>
                ))}
                {previewShotVersionId !== null && (() => {
                  const pv = shotVersions.find((v) => v.id === previewShotVersionId);
                  if (!pv) return null;
                  return (
                    <Button variant="outline" size="sm" onClick={() => {
                      setShots(pv.shots ?? []);
                      setCurrentShotVersionId(pv.id);
                      setPreviewShotVersionId(null);
                      toast.success(`VisualPrompts V${pv.id} restaurés`);
                    }} className="h-6 text-[10px] px-2 ml-2">
                      <RotateCcw className="h-2.5 w-2.5" /> Restaurer V{pv.id}
                    </Button>
                  );
                })()}
              </div>
            )}

            {!generatingStoryboard && scenes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Clapperboard className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Segmentez d'abord votre narration.</p>
                <Button variant="outline" onClick={() => setActiveTab("script-creator")}>
                  <ArrowLeft className="h-4 w-4" /> Retour à ScriptCreator
                </Button>
              </div>
            )}

            {scenes.length > 0 && (
              <>
              <Collapsible className="space-y-0">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-t border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium text-foreground min-h-[44px] sm:min-h-0 group">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                    <Layers className="h-4 w-4 text-primary" />
                    Scènes &amp; Shots
                    <span className="ml-auto text-[10px] text-muted-foreground">{scenes.length} scène{scenes.length > 1 ? "s" : ""} • {shots.length} shot{shots.length > 1 ? "s" : ""}</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border border-t-0 border-border rounded-b p-3 sm:p-4 space-y-4">
                {generatingStoryboard && (
                  <div className="flex items-center gap-2 mb-6 p-3 rounded border border-primary/20 bg-primary/5">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Génération des prompts visuels en cours...</p>
                  </div>
                )}
                {(() => {
                  const sceneIds = scenes.map((s) => s.id);
                  const allOpen = openSceneIds.length === sceneIds.length && sceneIds.every((id) => openSceneIds.includes(id));
                  return (
                    <div className="mb-4 flex items-center justify-end gap-2 flex-wrap">
                      {shots.some(s => hasDigits(s.source_sentence || "") || hasDigits(s.source_sentence_fr || "")) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={convertAllNumbersToFrench}
                          disabled={convertingNumbers}
                          className="h-7 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          {convertingNumbers ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
                          Chiffres → Lettres
                        </Button>
                      )}
                      {numberConversionBackup && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={revertNumberConversion}
                          disabled={convertingNumbers}
                          className="h-7 text-xs text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
                        >
                          <Undo2 className="h-3 w-3" />
                          Annuler
                        </Button>
                      )}
                      <Button
                        variant={showWarnings ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowWarnings((v) => !v)}
                        className={`h-7 text-xs ${showWarnings ? "" : "text-amber-600 border-amber-500/30 hover:bg-amber-500/10"}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Avertissements
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (allOpen) {
                            setOpenSceneIds([]);
                            setImageOpenShots(new Set());
                          } else {
                            setOpenSceneIds(sceneIds);
                            // Open all images
                            const allShotIds = new Set(shots.map(s => s.id));
                            setImageOpenShots(allShotIds);
                          }
                        }}
                      >
                        {allOpen ? "Tout fermer" : "Tout ouvrir avec les visuels"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setOpenSceneIds(sceneIds);
                          setImageOpenShots(new Set());
                        }}
                      >
                        Tout ouvrir sans les visuels
                      </Button>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {(() => {
                    const manifest = storyboardManifest ?? buildManifest(projectId!, scenes, shots);
                    const issues = validateManifest(manifest);
                    const errorIssues = issues.filter((i) => i.level === "error");
                    const warningIssues = issues.filter((i) => i.level === "warning");
                    // Build shot → issue level map for warning highlights
                    const shotIssueMap = new Map<string, "error" | "warning">();
                    // From manifest validation (has shotId directly)
                    for (const issue of issues) {
                      if (issue.shotId) {
                        const existing = shotIssueMap.get(issue.shotId);
                        if (!existing || (issue.level === "error" && existing === "warning")) {
                          shotIssueMap.set(issue.shotId, issue.level);
                        }
                      }
                    }
                    // From QA report (shotOrder = global shot index across all scenes)
                    if (qaIssues.length > 0) {
                      // Build global index → shot ID map
                      const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
                      const globalShotMap = new Map<number, string>();
                      let gIdx = 1;
                      for (const sc of sortedScenes) {
                        const scShots = shots
                          .filter((sh) => sh.scene_id === sc.id)
                          .sort((a, b) => a.shot_order - b.shot_order);
                        for (const sh of scShots) {
                          globalShotMap.set(gIdx, sh.id);
                          gIdx++;
                        }
                      }
                      for (const qi of qaIssues) {
                        if (qi.shotOrder != null) {
                          const shotId = globalShotMap.get(qi.shotOrder);
                          if (!shotId) continue;
                          const level = qi.level === "critical" ? "error" : qi.level === "warning" ? "warning" : undefined;
                          if (!level) continue;
                          const existing = shotIssueMap.get(shotId);
                          if (!existing || (level === "error" && existing === "warning")) {
                            shotIssueMap.set(shotId, level);
                          }
                        }
                      }
                    }

                    let globalShotIndex = 1;
                    return (
                      <>
                        {/* Manifest validation summary */}
                        {(() => {
                          const sceneOrderMap = new Map(manifest.scenes.map((s) => [s.sceneId, s.sceneOrder]));
                          const formatIssue = (issue: { sceneId?: string; message: string }) => {
                            const order = issue.sceneId ? sceneOrderMap.get(issue.sceneId) : undefined;
                            return order !== undefined ? `Scène ${order} — ${issue.message}` : issue.message;
                          };
                          return (
                            <>
                              {errorIssues.length > 0 && (
                                <div className="rounded border border-destructive/30 bg-destructive/5 p-3 mb-4 space-y-1">
                                  <p className="text-xs font-medium text-destructive">⚠ {errorIssues.length} erreur(s) de mapping détectée(s)</p>
                                  {errorIssues.slice(0, 5).map((issue, i) => (
                                    <p key={i} className="text-[10px] text-destructive/80 pl-3 border-l-2 border-destructive/30">{formatIssue(issue)}</p>
                                  ))}
                                </div>
                              )}
                              {warningIssues.length > 0 && errorIssues.length === 0 && (
                                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 mb-4 space-y-1">
                                  <p className="text-xs font-medium text-amber-600">⚠ {warningIssues.length} avertissement(s)</p>
                                  {warningIssues.slice(0, 3).map((issue, i) => (
                                    <p key={i} className="text-[10px] text-amber-600/80 pl-3 border-l-2 border-amber-500/30">{formatIssue(issue)}</p>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {manifest.scenes.map((normScene) => {
                          const scene = scenes.find((s) => s.id === normScene.sceneId)!;
                          const sceneShots = getShotsForScene(scene.id);
                          const isRegenerating = regeneratingSceneId === scene.id;
                          const isPendingGeneration = generatingStoryboard && sceneShots.length === 0;
                          const startIndex = globalShotIndex;
                          globalShotIndex += sceneShots.length;
                          const isOpen = openSceneIds.includes(scene.id);

                          // Use manifest validation instead of fuzzy matching
                          const sceneIssues = issues.filter((i) => i.sceneId === normScene.sceneId);
                          const hasErrors = sceneIssues.some((i) => i.level === "error");
                          const hasWarnings = !hasErrors && sceneIssues.some((i) => i.level === "warning");

                          return (
                            <div key={scene.id} className={`rounded border ${hasErrors ? "border-destructive/60" : hasWarnings ? "border-amber-500/60" : "border-border"} bg-card overflow-hidden`}>
                                <button
                                onClick={() =>
                                  setOpenSceneIds((prev) =>
                                    prev.includes(scene.id)
                                      ? prev.filter((id) => id !== scene.id)
                                      : [...prev, scene.id]
                                  )
                                }
                                className="w-full flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 text-left hover:bg-secondary/50 transition-colors min-h-[48px]"
                                id={`scene-header-${scene.id}`}
                              >
                                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                                <span className="text-xs font-display font-medium text-primary whitespace-nowrap">S{scene.scene_order}</span>
                                <span className="hidden sm:inline text-xs text-muted-foreground">—</span>
                                <span className="text-xs sm:text-sm font-display text-foreground truncate">{scene.title}</span>
                                {hasErrors && (
                                  <span className="shrink-0 inline-flex items-center gap-1 rounded bg-destructive/10 border border-destructive/30 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] text-destructive font-medium">
                                    ⚠
                                  </span>
                                )}
                                {hasWarnings && (
                                  <span className="shrink-0 inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] text-amber-600 font-medium">
                                    ⚠
                                  </span>
                                )}
                                {(() => {
                                  const blocked = sceneShots.filter((s) => s.guardrails === "safety_blocked");
                                  const filtered = sceneShots.filter((s) => s.guardrails === "safety_filtered");
                                  const makeShotClickHandler = (shotId: string) => (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setOpenSceneIds((prev) => prev.includes(scene.id) ? prev : [...prev, scene.id]);
                                    setTimeout(() => {
                                      const el = document.getElementById(`shot-${shotId}`);
                                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                    }, 150);
                                  };
                                  const shotLabel = (s: Shot) => {
                                    const localIdx = sceneShots.findIndex((sh) => sh.id === s.id);
                                    return String(startIndex + localIdx).padStart(4, "0");
                                  };
                                  return (
                                    <>
                                      {blocked.length > 0 && (
                                        <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-destructive/10 border border-destructive/30 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] text-destructive font-medium" title={`Shot(s) bloqué(s) par le filtre de sécurité: ${blocked.map(shotLabel).join(", ")}`}>
                                          🛡 {blocked.map((s) => (
                                            <button key={s.id} type="button" onClick={makeShotClickHandler(s.id)} className="underline underline-offset-2 hover:opacity-70 cursor-pointer ml-0.5">
                                              {shotLabel(s)}
                                            </button>
                                          ))}
                                        </span>
                                      )}
                                      {filtered.length > 0 && (
                                        <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-500/10 border border-amber-500/30 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] text-amber-600 font-medium" title={`Shot(s) généré(s) avec prompt adapté: ${filtered.map(shotLabel).join(", ")}`}>
                                          🛡 {filtered.map((s) => (
                                            <button key={s.id} type="button" onClick={makeShotClickHandler(s.id)} className="underline underline-offset-2 hover:opacity-70 cursor-pointer ml-0.5">
                                              {shotLabel(s)}
                                            </button>
                                          ))}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="ml-auto shrink-0 text-[10px] sm:text-xs bg-secondary px-1.5 sm:px-2 py-0.5 rounded-full hidden sm:inline-flex">
                                  {sceneShots.length > 0
                                    ? <>
                                        <span className="text-muted-foreground">SHOT </span>
                                        {sceneShots.map((sh, i) => {
                                          const shotNum = String(startIndex + i).padStart(4, "0");
                                          const hasImage = !!sh.image_url;
                                          const issueLevel = showWarnings ? shotIssueMap.get(sh.id) : undefined;
                                          const issueColor = issueLevel === "error"
                                            ? "text-destructive font-bold"
                                            : issueLevel === "warning"
                                            ? "text-amber-600 font-bold"
                                            : hasImage
                                            ? "text-green-500 font-semibold"
                                            : "text-muted-foreground";
                                          const isClickable = showWarnings && !!issueLevel;
                                          return (
                                            <span key={sh.id}>
                                              {i > 0 && <span className="text-muted-foreground"> / </span>}
                                              {isClickable ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Open scene accordion
                                                    setOpenSceneIds((prev) =>
                                                      prev.includes(scene.id) ? prev : [...prev, scene.id]
                                                    );
                                                    // Scroll to shot after accordion opens
                                                    setTimeout(() => {
                                                      const el = document.getElementById(`shot-${sh.id}`);
                                                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                                    }, 150);
                                                  }}
                                                  className={`${issueColor} underline underline-offset-2 hover:opacity-70 cursor-pointer`}
                                                >
                                                  {shotNum}
                                                </button>
                                              ) : (
                                                <span className={issueColor}>{shotNum}</span>
                                              )}
                                            </span>
                                          );
                                        })}
                                      </>
                                    : <span className="text-muted-foreground">0</span>}
                                </span>
                                {/* Mobile: compact shot count */}
                                <span className="ml-auto shrink-0 text-[10px] bg-secondary px-1.5 py-0.5 rounded-full sm:hidden">
                                  {sceneShots.length}
                                </span>
                                {scene.validated && (
                                  <span className="shrink-0 hidden sm:inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Validée
                                  </span>
                                )}
                              </button>
                              {isOpen && (
                                <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-border space-y-3 sm:space-y-4 animate-fade-in">
                                   {/* Scene-level sensitive mode */}
                                  <details className="rounded-lg border border-border bg-secondary/30 p-3 group/sens">
                                    <summary className="text-xs font-display font-semibold text-foreground cursor-pointer hover:text-foreground/80 transition-colors flex items-center gap-1.5 min-h-[44px] sm:min-h-0 list-none [&::-webkit-details-marker]:hidden">
                                        <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-open/sens:rotate-90 shrink-0" />
                                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                        <span className="text-xs font-display font-semibold text-foreground">
                                          Mode sensible — Scène {scene.scene_order}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          ({sceneShots.length} shot{sceneShots.length > 1 ? "s" : ""})
                                        </span>
                                    </summary>
                                    <div className="space-y-1 mt-2">
                                      <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                                        Le niveau choisi s'applique à tous les shots de cette scène, sauf ceux avec une surcharge locale.
                                      </p>
                                      <ScopeOverrideControl
                                        value={sensitiveMode.getSceneValue(scene.id)}
                                        onChangeLocal={(lvl) => sensitiveMode.setSceneLevel(scene.id, lvl)}
                                        scopeLabel={`Scène ${scene.scene_order}`}
                                        parentLabel="Toutes les scènes"
                                      />
                                      <VisualStyleSelector
                                        value={visualStyle.getSceneValue(scene.id)}
                                        onChange={(id) => visualStyle.setSceneStyle(scene.id, id)}
                                        scopeLabel={`Scène ${scene.scene_order}`}
                                        parentLabel="Global"
                                      />
                                    </div>
                                  </details>
                                  <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 justify-end">
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        value={sceneImageModelOverrides[scene.id] || imageModel}
                                        onChange={(e) => setSceneImageModelOverrides(prev => ({ ...prev, [scene.id]: e.target.value }))}
                                        className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[160px]"
                                      >
                                        {IMAGE_MODELS.map((m) => (
                                          <option key={m.value} value={m.value}>
                                            {m.label} — {m.price}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        onClick={() => handleGenerateSceneImages(scene.id)}
                                        disabled={generatingAllImages}
                                        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
                                        title="Générer tous les visuels de la scène"
                                      >
                                        {generatingAllImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                        <span>Générer tous les visuels de la scène</span>
                                      </button>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs px-2 gap-1"
                                      disabled={isRegenerating || scene.validated}
                                      onClick={() => { if (scene.validated) { toast.error("Scène validée — déverrouillez-la pour modifier."); return; } runStoryboard(scene.id, { segmentOnly: true }); }}
                                      title="Refaire tout le découpage des shots de cette scène"
                                    >
                                      {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                      Refaire le découpage
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs px-2 gap-1"
                                      disabled={isRegenerating || scene.validated}
                                      onClick={() => { if (scene.validated) { toast.error("Scène validée — déverrouillez-la pour modifier."); return; } runStoryboard(scene.id); }}
                                      title="Régénérer les prompts visuels de cette scène via IA"
                                    >
                                      {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clapperboard className="h-3 w-3" />}
                                      Générer les prompts
                                    </Button>
                                  </div>

                                  {/* Scene source text */}
                                  <div className="rounded border border-border bg-background p-2.5 sm:p-4">
                                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed italic break-words">"{scene.source_text}"</p>
                                    {(scene as any).source_text_fr && (
                                      <p className="text-xs sm:text-sm text-muted-foreground/70 leading-relaxed mt-2 italic border-l-2 border-primary/20 pl-3 break-words">🇫🇷 "{(scene as any).source_text_fr}"</p>
                                    )}
                                  </div>

                                  {isRegenerating || isPendingGeneration ? (
                                    <div className="flex items-center justify-center py-8 gap-2">
                                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                      <p className="text-xs text-muted-foreground">{isRegenerating ? "Régénération des shots..." : "En attente..."}</p>
                                    </div>
                                  ) : sceneShots.length === 0 && !generatingStoryboard ? (
                                    <p className="text-xs text-muted-foreground italic">Aucun shot généré pour cette scène.</p>
                                  ) : (
                                    <FragmentedSceneView
                                      normalisedScene={normScene}
                                      dbShots={sceneShots}
                                      startGlobalIndex={startIndex}
                                      onRetranslate={scriptLanguage !== "fr" ? handleRetranslateSingleShot : undefined}
                                      renderShot={(shot, globalIdx, isLast) => (
                                        <div id={`shot-${shot.id}`}>
                                          {/* Regen + move buttons row */}
                                          <div className="mb-1 flex items-center gap-1.5">
                                                {/* Move up/down */}
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-6 w-6 p-0"
                                                  disabled={shot.shot_order <= 1 || scene.validated}
                                                  title="Monter"
                                                  onClick={async () => {
                                                    const prev = sceneShots.find(s => s.shot_order === shot.shot_order - 1);
                                                    if (!prev) return;
                                                    await supabase.from("shots").update({ shot_order: shot.shot_order }).eq("id", prev.id);
                                                    await supabase.from("shots").update({ shot_order: prev.shot_order }).eq("id", shot.id);
                                                    const { data: fresh } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
                                                    if (fresh) setShots(fresh as Shot[]);
                                                  }}
                                                >
                                                  <ChevronUp className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-6 w-6 p-0"
                                                  disabled={isLast || scene.validated}
                                                  title="Descendre"
                                                  onClick={async () => {
                                                    const next = sceneShots.find(s => s.shot_order === shot.shot_order + 1);
                                                    if (!next) return;
                                                    await supabase.from("shots").update({ shot_order: shot.shot_order }).eq("id", next.id);
                                                    await supabase.from("shots").update({ shot_order: next.shot_order }).eq("id", shot.id);
                                                    const { data: fresh } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
                                                    if (fresh) setShots(fresh as Shot[]);
                                                  }}
                                                >
                                                  <ChevronDown className="h-3.5 w-3.5" />
                                                </Button>
                                                <div className="ml-auto flex items-center gap-1.5">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-6 text-[10px] px-2 gap-1"
                                                  disabled={regeneratingShots[shot.id]}
                                                  onClick={() => handleShotRegenerate(shot.id)}
                                                >
                                                  {regeneratingShots[shot.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                                  Régénérer le prompt
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-6 text-[10px] px-2 gap-1"
                                                  disabled={generatingAllImages}
                                                  onClick={() => handleGenerateShotImage(shot.id)}
                                                >
                                                  {generatingAllImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                                                  Régénérer le visuel
                                                </Button>
                                                </div>
                                          </div>
                                          {/* ShotCard with action buttons right below regen */}
                                          <ShotCard
                                            key={shot.id}
                                            shot={shot}
                                            globalIndex={globalIdx}
                                            sceneLabel={`Scène ${scene.scene_order} — ${scene.title}`}
                                            isLastInScene={isLast}
                                            imageExpanded={imageOpenShots.has(shot.id)}
                                            scriptLanguage={scriptLanguage}
                                            linkedObjects={getLinkedObjectsForShot(scene.scene_order, shot.id)}
                                            allObjects={allRecurringObjects}
                                            onLinkObject={(_sceneOrder, objId) => handleLinkObjectToShot(shot.id, objId)}
                                            onUnlinkObject={(_sceneOrder, objId) => handleUnlinkObjectFromShot(shot.id, objId)}
                                            sceneOrder={scene.scene_order}
                                            onToggleImageExpanded={() => setImageOpenShots(prev => {
                                              const next = new Set(prev);
                                              if (next.has(shot.id)) next.delete(shot.id); else next.add(shot.id);
                                              return next;
                                            })}
                                            onUpdate={handleShotUpdate}
                                            onDelete={handleShotDelete}
                                            onRegenerate={handleShotRegenerate}
                                            onGenerateImage={handleGenerateShotImage}
                                            onMergeWithNext={handleShotMergeWithNext}
                                            onSplit={handleShotSplit}
                                            onRetranslate={scriptLanguage !== "fr" ? handleRetranslateSingleShot : undefined}
                                          />
                                          {/* Shot-level settings (collapsed) */}
                                          <details className="mt-1 rounded border border-border/50 bg-secondary/20 p-2 group/shot-settings">
                                            <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                                              <ChevronRight className="h-3 w-3 transition-transform group-open/shot-settings:rotate-90 shrink-0" />
                                              <ShieldCheck className="h-3 w-3 text-primary/70" />
                                              <span>Paramètres du shot</span>
                                            </summary>
                                            <div className="mt-2 space-y-1">
                                            <ScopeOverrideControl
                                              value={sensitiveMode.getShotValue(scene.id, shot.id)}
                                              onChangeLocal={(lvl) => sensitiveMode.setShotLevel(shot.id, lvl)}
                                              scopeLabel={`Shot ${globalIdx}`}
                                              parentLabel={`Scène ${scene.scene_order}`}
                                              compact
                                            />
                                            <VisualStyleSelector
                                              value={visualStyle.getShotValue(scene.id, shot.id)}
                                              onChange={(id) => visualStyle.setShotStyle(shot.id, id)}
                                              scopeLabel={`Shot ${globalIdx}`}
                                              parentLabel={`Scène ${scene.scene_order}`}
                                              compact
                                            />
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">IA :</span>
                                              <select
                                                value={shotImageModelOverrides[shot.id] || imageModel}
                                                onChange={(e) => setShotImageModelOverrides(prev => ({ ...prev, [shot.id]: e.target.value }))}
                                                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[180px]"
                                              >
                                                {IMAGE_MODELS.map((m) => (
                                                  <option key={m.value} value={m.value}>
                                                    {m.label} — {m.price}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            </div>
                                          </details>
                                        </div>
                                      )}
                                    />
                                  )}

                                  {/* Close scene button at bottom */}
                                  <div className="mt-4 flex justify-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1 text-muted-foreground"
                                      onClick={() => {
                                        setOpenSceneIds((prev) => prev.filter((id) => id !== scene.id));
                                        // Scroll back to scene header
                                        setTimeout(() => {
                                          const el = document.getElementById(`scene-header-${scene.id}`);
                                          el?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        }, 100);
                                      }}
                                    >
                                      <ChevronUp className="h-3 w-3" />
                                      Fermer la scène {scene.scene_order}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
                {/* Action history */}
                {manifestHistory.length > 0 && (
                  <details className="mt-4 sm:mt-6 rounded border border-border bg-secondary/30 p-2 sm:p-3 group/hist">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[44px] sm:min-h-0 flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3 w-3 transition-transform group-open/hist:rotate-90 shrink-0" />
                      Historique des actions ({manifestHistory.length})
                    </summary>
                    <div className="mt-2 space-y-1.5 sm:space-y-1 max-h-40 overflow-y-auto">
                      {[...manifestHistory].reverse().map((a, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 font-medium border ${
                              a.type === "merge" ? "bg-primary/10 text-primary border-primary/20" :
                              a.type === "delete" ? "bg-destructive/10 text-destructive border-destructive/20" :
                              "bg-accent text-accent-foreground border-border"
                            }`}>
                              {a.type}
                            </span>
                            <span className="sm:hidden text-[9px] opacity-60">{new Date(a.timestamp).toLocaleTimeString("fr-FR")}</span>
                          </div>
                          <span className="truncate break-words">{a.description}</span>
                          <span className="hidden sm:inline ml-auto shrink-0 text-[9px] opacity-60">{new Date(a.timestamp).toLocaleTimeString("fr-FR")}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                </CollapsibleContent>
              </Collapsible>

              {/* QA Contrôle qualité */}
              <details className="mt-4 sm:mt-6 rounded border border-border bg-card p-2 sm:p-3 group/qa">
                <summary className="text-sm font-medium text-foreground cursor-pointer hover:text-foreground/80 transition-colors flex items-center gap-1.5 min-h-[44px] sm:min-h-0 list-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open/qa:rotate-90 shrink-0" />
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Contrôle qualité
                  {qaCounts.errors > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                      {qaCounts.errors} erreur{qaCounts.errors > 1 ? "s" : ""}
                    </span>
                  )}
                  {qaCounts.warnings > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      {qaCounts.warnings} avert.
                    </span>
                  )}
                </summary>
                <div className="mt-3">
                  <QaPanel
                    projectId={projectId!}
                    manifest={storyboardManifest!}
                    onExportAllowedChange={setQaExportAllowed}
                    onReportChange={handleQaReportChange}
                    onScenesUpdated={async () => {
                      const { data } = await supabase.from("scenes").select("*").eq("project_id", projectId!).order("scene_order", { ascending: true });
                      if (data) setScenes(data);
                    }}
                  />
                  <div className="mt-3">
                    <WhisperAlignmentEditor
                      projectId={projectId!}
                      shots={shots}
                      scenesForSort={scenes.map(s => ({ id: s.id, scene_order: s.scene_order }))}
                    />
                  </div>
                </div>
              </details>

              {/* Manifest Timing */}
              <details className="mt-3 sm:mt-4 rounded border border-border bg-card p-2 sm:p-3 group/timing">
                <summary className="text-sm font-medium text-foreground cursor-pointer hover:text-foreground/80 transition-colors min-h-[44px] sm:min-h-0 flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open/timing:rotate-90 shrink-0" />
                  <ArrowUpDown className="h-4 w-4 text-primary" />
                  Manifest Timing
                </summary>
                <div className="mt-3">
                  <ManifestTimingPanel projectId={projectId!} manifest={storyboardManifest!} />
                </div>
              </details>

            </>
            )}
          </div>
          </>
        )}
        {/* Export tab */}
        {!showSetup && activeTab === "export" && (
          <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">Export Center</h2>
            <p className="text-sm text-muted-foreground mb-6 sm:mb-8">Récupérez vos fichiers prêts à l'emploi.</p>
            <div className="space-y-4">
              {[
                { label: "Script Narratif", desc: "Script voice-over généré par ScriptCreator", generate: generateScriptNarratif, disabled: !generatedScript },
                { label: "VO Blocks", desc: "Script découpé en blocs Voice Over (≤ 8 300 car.)", generate: generateVoiceOverBlocks, disabled: !generatedScript },
                { label: "Visual Prompts", desc: "Prompts formatés pour Grok Image", generate: generateVisualPrompts, disabled: scenes.length === 0 },
                { label: "Scene Mapping", desc: "Correspondance narration ↔ scènes ↔ shots", generate: generateSceneMapping, disabled: scenes.length === 0 },
                { label: "Narration Segmentation", desc: "Découpage narratif brut", generate: generateNarrationSegmentation, disabled: scenes.length === 0 },
                { label: "Visuels (.zip)", desc: "Télécharger tous les visuels générés", generate: downloadAllImages, disabled: !shots.some((s: any) => s.image_url) },
                { label: "Vidéos générées (.zip)", desc: "Télécharger toutes les vidéos produites", generate: downloadAllVideos, disabled: scenes.length === 0 },
              ].map((exp, i) => (
                <div key={exp.label} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded border border-border bg-card p-4 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">{exp.label}</h3>
                    <p className="text-xs text-muted-foreground">{exp.desc}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={exp.generate} disabled={exp.disabled} className="min-h-[40px] w-full sm:w-auto shrink-0">
                    <Download className="h-3.5 w-3.5" /> Exporter
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <Button variant="hero" onClick={downloadAll} disabled={!generatedScript && scenes.length === 0} className="min-h-[44px] w-full sm:w-auto">
                <Download className="h-4 w-4" /> Tout exporter (.zip)
              </Button>
            </div>

            {scenes.length === 0 && (
              <p className="text-xs text-muted-foreground mt-4 italic">Segmentez et générez le storyboard avant d'exporter.</p>
            )}
          </div>
        )}
      </main>

      <VisualGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        shots={shots}
        scenes={scenes}
        imageModels={IMAGE_MODELS}
        imageModel={imageModel}
        onImageModelChange={setImageModel}
        onRegenerateShot={handleShotRegenerate}
        onGenerateImage={handleGenerateShotImage}
        totalCost={shots.reduce((sum, s) => sum + (s.generation_cost ?? 0), 0)}
      />
    </div>
  );
}
