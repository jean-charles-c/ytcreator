import { useState, useEffect, useCallback, useRef } from "react";
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
  ShieldCheck,
  ArrowUpDown,
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
import { buildManifest, validateManifest, computeMerge, computeDeleteRedistribution, type ManifestAction } from "@/components/editor/visualPromptTypes";
import ManifestTimingPanel from "@/components/editor/ManifestTimingPanel";
import QaPanel from "@/components/editor/QaPanel";
import SegmentationQaPanel from "@/components/editor/SegmentationQaPanel";
import PdfDocumentaryTab from "@/components/editor/PdfDocumentaryTab";
import SeoTab from "@/components/editor/SeoTab";
import ContentPublishTab from "@/components/editor/ContentPublishTab";
import VoiceOverStudio from "@/components/editor/VoiceOverStudio";
import RsearchEngineTab from "@/components/editor/RsearchEngineTab";
import VideoEditTab from "@/components/editor/VideoEditTab";
import VideoPromptsTab from "@/components/editor/VideoPromptsTab";

type Tab = "rsearch" | "script-creator" | "segmentation" | "storyboard" | "videoprompts" | "seo" | "cp" | "vo" | "videoedit" | "export";
type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

/**
 * Reorder shots within each scene so shot_order follows
 * the reading order of source_sentence in the scene's source_text.
 * Returns shots with corrected shot_order + list of DB updates needed.
 */
function reorderShotsByReadingPosition(shots: Shot[], scenes: Scene[]): { reordered: Shot[]; updates: { id: string; shot_order: number }[] } {
  const sceneMap = new Map<string, Scene>();
  scenes.forEach((s) => sceneMap.set(s.id, s));

  const updates: { id: string; shot_order: number }[] = [];
  const reordered: Shot[] = [...shots];

  // Group shots by scene
  const byScene = new Map<string, Shot[]>();
  for (const shot of reordered) {
    const arr = byScene.get(shot.scene_id) || [];
    arr.push(shot);
    byScene.set(shot.scene_id, arr);
  }

  for (const [sceneId, sceneShots] of byScene) {
    const scene = sceneMap.get(sceneId);
    if (!scene) continue;
    const sceneTextLower = (scene.source_text || "").toLowerCase().replace(/\s+/g, " ");

    // Sort by position of source_sentence in scene text
    sceneShots.sort((a, b) => {
      const sentA = (a.source_sentence || "").trim().toLowerCase().replace(/\s+/g, " ");
      const sentB = (b.source_sentence || "").trim().toLowerCase().replace(/\s+/g, " ");
      const posA = sentA ? sceneTextLower.indexOf(sentA) : 9999;
      const posB = sentB ? sceneTextLower.indexOf(sentB) : 9999;
      return (posA === -1 ? 9999 : posA) - (posB === -1 ? 9999 : posB);
    });

    // Assign correct shot_order
    sceneShots.forEach((shot, idx) => {
      const correctOrder = idx + 1;
      if (shot.shot_order !== correctOrder) {
        shot.shot_order = correctOrder;
        updates.push({ id: shot.id, shot_order: correctOrder });
      }
    });
  }

  return { reordered, updates };
}

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
  const storyAbortRef = useRef<AbortController | null>(null);

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
        setGlobalContext(scriptCreatorState.global_context ?? null);

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
  const runStoryboard = useCallback(async (sceneId?: string) => {
    if (!projectId) return;
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
            body: JSON.stringify({ project_id: projectId, scene_id: sceneId }),
          }
        );
        const data = await response.json();
        if (!response.ok || data?.error) throw new Error(data?.error || "Erreur de génération");
        const { data: shotData } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
        if (shotData) {
          const { reordered } = reorderShotsByReadingPosition(shotData as Shot[], scenes);
          setShots(reordered);
        }
        toast.success(`${data?.shots_count ?? 0} shots générés`);
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
      setShots([]);
      bgStartStoryboard({ projectId, sceneIds });
    }
  }, [projectId, scenes, shots, bgStartStoryboard]);

  const stopStoryboard = useCallback(() => {
    if (projectId) stopTask(projectId, "storyboard");
    storyAbortRef.current?.abort();
    storyAbortRef.current = null;
  }, [projectId, stopTask]);

  const getShotsForScene = (sceneId: string) => shots.filter((s) => s.scene_id === sceneId);

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

  const handleShotRegenerate = async (shotId: string) => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-shot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ shot_id: shotId }),
        }
      );
      const data = await response.json();
      if (!response.ok || data?.error) throw new Error(data?.error || "Erreur");
      if (data.shot) {
        setShots((prev) => prev.map((s) => (s.id === data.shot.id ? data.shot : s)));
        toast.success("Shot regénéré");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur de regénération");
    }
  };

  // --- Image generation handlers ---
  // generatingSceneImages removed — all image gen routes through bgStartImageGen
  const [imageModel, setImageModel] = useState("google/gemini-2.5-flash-image");
  const [imageAspectRatio, setImageAspectRatio] = useState("16:9");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [openSceneIds, setOpenSceneIds] = useState<string[]>([]);
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
    bgStartImageGen({
      projectId,
      shotIds: [shotId],
      model: imageModel,
      aspectRatio: imageAspectRatio,
    });
  };

  const imageGenTask = getTask(projectId ?? "", "image-gen");
  const generatingAllImages = imageGenTask?.status === "running";

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

  const handleGenerateSceneImages = (sceneId: string) => {
    if (!projectId || generatingAllImages) return;
    const sceneShots = shots
      .filter((s) => s.scene_id === sceneId)
      .sort((a, b) => a.shot_order - b.shot_order);
    if (sceneShots.length === 0) return;
    bgStartImageGen({
      projectId,
      shotIds: sceneShots.map((s) => s.id),
      model: imageModel,
      aspectRatio: imageAspectRatio,
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
    return raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("---") && line.trim() !== "")
      .map((line) => line.trim())
      .join("\n");
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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border shrink-0">
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
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={runSegmentation} disabled={segmenting} className="min-h-[40px]">
                    <Play className="h-4 w-4" /> Re-segmenter
                  </Button>
                  <Button variant="hero" size="sm" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[40px]">
                    {generatingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                    VisualPrompts
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
                  <details className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5 group" open>
                    <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                      🧠 Contexte Global
                      <span className="ml-1 text-xs text-muted-foreground font-normal">— Mémoire de référence du script</span>
                      <span className="ml-auto text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
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
                  <details className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5 group">
                    <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                      🇫🇷 Traduction française du narratif
                      <span className="ml-auto text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
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
                  <Button variant="hero" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[44px]">
                    {generatingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                    {generatingStoryboard ? "Génération..." : "Générer les VisualPrompts"}
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
                  const shotsWithImage = shots.filter((s) => s.image_url).length;
                  const sortedSc = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
                  const completedScenes = sortedSc.filter((sc) => {
                    const scShots = shots.filter((s) => s.scene_id === sc.id);
                    return scShots.length > 0 && scShots.every((s) => s.image_url);
                  }).length;
                  return (
                    <p className="text-sm text-muted-foreground">
                      Visuels générés pour : <span className="font-semibold text-foreground">{shotsWithImage} shot{shotsWithImage > 1 ? "s" : ""}</span> / <span className="font-semibold text-foreground">{completedScenes} scène{completedScenes > 1 ? "s" : ""}</span>
                    </p>
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
              {!generatingStoryboard && scenes.length > 0 && (
                <div className="flex flex-col gap-2 shrink-0">
                  <div className="flex gap-2 flex-wrap items-center">
                    <Button variant="outline" size="sm" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[40px]">
                      <Play className="h-4 w-4" /> Re-générer tous les shots
                    </Button>
                    {generatingAllImages ? (
                      <Button variant="destructive" size="sm" onClick={stopImageGeneration} className="min-h-[40px]">
                        <Square className="h-4 w-4" /> Stopper la génération
                        {imageGenTask?.completedShots != null && imageGenTask?.totalShots
                          ? ` (${imageGenTask.successShots ?? 0}✓ — ${imageGenTask.completedShots}/${imageGenTask.totalShots})`
                          : ""}
                      </Button>
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
                  <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)} disabled={!shots.some((s: any) => s.image_url)} className="min-h-[40px]">
                    <ImageIcon className="h-4 w-4" /> Voir les visuels
                  </Button>
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
                  </div>
                </div>
              )}
            </div>

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
                    <span className="ml-1 text-[9px] opacity-60">({v.shots.length})</span>
                  </button>
                ))}
                {previewShotVersionId !== null && (() => {
                  const pv = shotVersions.find((v) => v.id === previewShotVersionId);
                  if (!pv) return null;
                  return (
                    <Button variant="outline" size="sm" onClick={() => {
                      setShots(pv.shots);
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
                    <div className="mb-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpenSceneIds(allOpen ? [] : sceneIds)}
                      >
                        {allOpen ? "Tout fermer" : "Tout ouvrir"}
                      </Button>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {(() => {
                    const manifest = buildManifest(projectId!, scenes, shots);
                    const issues = validateManifest(manifest);
                    const errorIssues = issues.filter((i) => i.level === "error");
                    const warningIssues = issues.filter((i) => i.level === "warning");

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
                                <span className="ml-auto shrink-0 text-[10px] sm:text-xs bg-secondary px-1.5 sm:px-2 py-0.5 rounded-full hidden sm:inline-flex">
                                  {sceneShots.length > 0
                                    ? <>
                                        <span className="text-muted-foreground">SHOT </span>
                                        {sceneShots.map((sh, i) => {
                                          const shotNum = String(startIndex + i).padStart(4, "0");
                                          const hasImage = !!sh.image_url;
                                          return (
                                            <span key={sh.id}>
                                              {i > 0 && <span className="text-muted-foreground"> / </span>}
                                              <span className={hasImage ? "text-green-500 font-semibold" : "text-muted-foreground"}>{shotNum}</span>
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
                                  <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 justify-end">
                                    {/* Realign shots button — only show if shots are out of text order */}
                                    {(() => {
                                      const sceneTextLower = scene.source_text.toLowerCase().replace(/\s+/g, " ");
                                      const positions = sceneShots
                                        .map(sh => ({
                                          id: sh.id,
                                          order: sh.shot_order,
                                          pos: sceneTextLower.indexOf((sh.source_sentence || "").toLowerCase().replace(/\s+/g, " ").trim()),
                                        }))
                                        .filter(p => p.pos >= 0);
                                      const sorted = [...positions].sort((a, b) => a.order - b.order);
                                      const needsRealign = sorted.some((p, i) => i > 0 && p.pos < sorted[i - 1].pos);
                                      if (!needsRealign) return null;
                                      return (
                                        <button
                                          onClick={async () => {
                                            const byTextPos = [...positions].sort((a, b) => a.pos - b.pos);
                                            const updates = byTextPos.map((p, i) => ({ id: p.id, shot_order: i + 1 }));
                                            for (const u of updates) {
                                              await supabase.from("shots").update({ shot_order: u.shot_order }).eq("id", u.id);
                                            }
                                            // Also fix shots not found in text (keep them at end)
                                            const fixedIds = new Set(updates.map(u => u.id));
                                            let nextOrder = updates.length + 1;
                                            for (const sh of sceneShots) {
                                              if (!fixedIds.has(sh.id)) {
                                                await supabase.from("shots").update({ shot_order: nextOrder++ }).eq("id", sh.id);
                                              }
                                            }
                                            toast.success(`Shots de la scène ${scene.scene_order} réalignés sur l'ordre du texte`);
                                            // Reload shots from DB
                                            const { data: freshShots } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
                                            if (freshShots) {
                                              const { reordered } = reorderShotsByReadingPosition(freshShots as Shot[], scenes);
                                              setShots(reordered);
                                            }
                                          }}
                                          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 transition-colors min-h-[44px] sm:min-h-[36px] border border-amber-500/30"
                                          title="Réordonner les shots selon leur position dans le texte source"
                                        >
                                          <ArrowUpDown className="h-3.5 w-3.5" />
                                          <span>Réaligner</span>
                                        </button>
                                      );
                                    })()}
                                    <button
                                      onClick={() => handleGenerateSceneImages(scene.id)}
                                      disabled={generatingAllImages}
                                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
                                      title="Générer les visuels de cette scène"
                                    >
                                      {generatingAllImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                      <span>Visuels</span>
                                    </button>
                                    <button
                                      onClick={() => runStoryboard(scene.id)}
                                      disabled={isRegenerating}
                                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
                                      title="Régénérer les shots de cette scène"
                                    >
                                      {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                      <span>Régénérer</span>
                                    </button>
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
                                      renderShot={(shot, globalIdx, isLast) => (
                                        <ShotCard
                                          key={shot.id}
                                          shot={shot}
                                          globalIndex={globalIdx}
                                          sceneLabel={`Scène ${scene.scene_order} — ${scene.title}`}
                                          isLastInScene={isLast}
                                          onUpdate={handleShotUpdate}
                                          onDelete={handleShotDelete}
                                          onRegenerate={handleShotRegenerate}
                                          onGenerateImage={handleGenerateShotImage}
                                          onMergeWithNext={handleShotMergeWithNext}
                                        />
                                      )}
                                    />
                                  )}
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
                  <details className="mt-4 sm:mt-6 rounded border border-border bg-secondary/30 p-2 sm:p-3">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[44px] sm:min-h-0 flex items-center">
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
              <details className="mt-4 sm:mt-6 rounded border border-border bg-card p-2 sm:p-3" open>
                <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Contrôle qualité
                </summary>
                <div className="mt-3">
                  <QaPanel
                    projectId={projectId!}
                    manifest={buildManifest(projectId!, scenes, shots)}
                    onExportAllowedChange={setQaExportAllowed}
                  />
                </div>
              </details>

              {/* Manifest Timing */}
              <details className="mt-3 sm:mt-4 rounded border border-border bg-card p-2 sm:p-3">
                <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[44px] sm:min-h-0 flex items-center">
                  Manifest Timing (synchronisation audio/image)
                </summary>
                <div className="mt-3">
                  <ManifestTimingPanel projectId={projectId!} manifest={buildManifest(projectId!, scenes, shots)} />
                </div>
              </details>

              <div className="mt-6 sm:mt-8 flex gap-3">
                <Button variant="outline" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[44px] sm:min-h-0">
                  <Play className="h-4 w-4" /> Re-générer tous les shots
                </Button>
              </div>
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
