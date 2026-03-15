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
  CheckCircle2,
  Menu,
  X,
  Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import SceneBlock from "@/components/editor/SceneBlock";
import ShotCard from "@/components/editor/ShotCard";
import PdfDocumentaryTab from "@/components/editor/PdfDocumentaryTab";
import SeoTab from "@/components/editor/SeoTab";
import ContentPublishTab from "@/components/editor/ContentPublishTab";

type Tab = "script-creator" | "script" | "segmentation" | "storyboard" | "seo" | "cp" | "export";
type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

const tabItems: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "script-creator", label: "ScriptCreator", icon: FileText },
  { key: "script", label: "ScriptInput", icon: Film },
  { key: "segmentation", label: "Segmentation", icon: Layers },
  { key: "storyboard", label: "VisualPrompts", icon: Clapperboard },
  { key: "seo", label: "SEO", icon: Youtube },
  { key: "cp", label: "CP", icon: Save },
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
  const isNew = id === "new";

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState("en");
  const [narration, setNarration] = useState("");
  const [projectId, setProjectId] = useState<string | null>(isNew ? null : id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>("script-creator");
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(!isNew);
  const [showSetup, setShowSetup] = useState(isNew);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [segmenting, setSegmenting] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      if (shotsRes.data) setShots(shotsRes.data);

      const scriptCreatorState = scriptCreatorRes?.data;
      if (scriptCreatorState) {
        setPdfAnalysis(scriptCreatorState.analysis ?? null);
        setPdfExtractedText(scriptCreatorState.extracted_text ?? null);
        setPdfPageCount(Number(scriptCreatorState.page_count) || 0);
        setPdfFileName(scriptCreatorState.file_name ?? null);
        setPdfDocStructure(Array.isArray(scriptCreatorState.doc_structure) ? scriptCreatorState.doc_structure : null);
        setGeneratedScript(typeof scriptCreatorState.generated_script === "string" ? scriptCreatorState.generated_script : null);
        setSeoResults(normalizeSeoResults(scriptCreatorState.seo_results));

        lastSavedScriptCreatorSnapshotRef.current = JSON.stringify({
          file_name: scriptCreatorState.file_name ?? null,
          page_count: Number(scriptCreatorState.page_count) || 0,
          extracted_text: scriptCreatorState.extracted_text ?? null,
          analysis: scriptCreatorState.analysis ?? null,
          doc_structure: Array.isArray(scriptCreatorState.doc_structure) ? scriptCreatorState.doc_structure : null,
          generated_script: typeof scriptCreatorState.generated_script === "string" ? scriptCreatorState.generated_script : null,
          seo_results: normalizeSeoResults(scriptCreatorState.seo_results),
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

  // Segment narration
  const runSegmentation = useCallback(async () => {
    if (!projectId) return;
    if (narration.trim()) {
      await supabase.from("projects").update({ narration: narration.trim() }).eq("id", projectId);
    }
    setSegmenting(true);
    setActiveTab("segmentation");
    setPreviewSceneVersionId(null);
    try {
      const { data, error } = await supabase.functions.invoke("segment-narration", { body: { project_id: projectId } });
      if (error) { toast.error("Erreur de segmentation"); console.error(error); setSegmenting(false); return; }
      if (data?.error) { toast.error(data.error); setSegmenting(false); return; }
      const { data: sceneData } = await supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_order", { ascending: true });
      if (sceneData) {
        // Save current scenes as a version before replacing (if any exist)
        if (scenes.length > 0) {
          setSceneVersions((prev) => {
            const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
            // If we haven't saved the initial version yet, save it first
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
      }
      setShots([]);
      toast.success(`${sceneData?.length ?? 0} scènes générées`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setSegmenting(false);
  }, [projectId, narration, scenes]);

  // Generate storyboard (all or single scene)
  const runStoryboard = useCallback(async (sceneId?: string) => {
    if (!projectId) return;
    if (sceneId) {
      setRegeneratingSceneId(sceneId);
    } else {
      // Save current shots as version before full regeneration
      if (shots.length > 0) {
        setShotVersions((prev) => {
          const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
          if (prev.length === 0) {
            return [{ id: nextId, shots: [...shots] }];
          }
          return [...prev, { id: nextId, shots: [...shots] }];
        });
      }
      setPreviewShotVersionId(null);
      setGeneratingStoryboard(true);
      setActiveTab("storyboard");
    }

    const callStoryboard = async (body: Record<string, string>) => {
      const session = (await supabase.auth.getSession()).data.session;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 145000);

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
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );

        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || "Erreur de génération");
        }

        return data;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      if (sceneId) {
        const data = await callStoryboard({ project_id: projectId, scene_id: sceneId });
        const { data: shotData } = await supabase
          .from("shots")
          .select("*")
          .eq("project_id", projectId)
          .order("shot_order", { ascending: true });
        if (shotData) setShots(shotData);
        toast.success(`${data?.shots_count ?? 0} shots générés`);
      } else {
        const sceneIds = scenes.map((s) => s.id);
        if (sceneIds.length === 0) {
          toast.error("Aucune scène à traiter");
          return;
        }

        await supabase.from("shots").delete().eq("project_id", projectId);
        setShots([]);

        const BATCH_SIZE = 4;
        let totalShots = 0;
        const failedSceneIds: string[] = [];

        for (let i = 0; i < sceneIds.length; i += BATCH_SIZE) {
          const batch = sceneIds.slice(i, i + BATCH_SIZE);
          for (const sid of batch) {
            try {
              const data = await callStoryboard({ project_id: projectId, scene_id: sid });
              totalShots += data?.shots_count ?? 0;
              // Fetch shots progressively after each scene
              const { data: shotData } = await supabase
                .from("shots")
                .select("*")
                .eq("project_id", projectId)
                .order("scene_id", { ascending: true })
                .order("shot_order", { ascending: true });
              if (shotData) setShots(shotData);
            } catch (sceneError) {
              console.error(`Storyboard scene failed: ${sid}`, sceneError);
              failedSceneIds.push(sid);
            }
          }
        }

        // Fetch final shots from DB and save as current version
        const { data: finalShotData } = await supabase
          .from("shots")
          .select("*")
          .eq("project_id", projectId)
          .order("scene_id", { ascending: true })
          .order("shot_order", { ascending: true });
        if (finalShotData) {
          setShots(finalShotData);
          setShotVersions((prev) => {
            const nextId = prev.length > 0 ? Math.max(...prev.map((v) => v.id)) + 1 : 1;
            setCurrentShotVersionId(nextId);
            return [...prev, { id: nextId, shots: finalShotData }];
          });
        }

        if (failedSceneIds.length > 0) {
          toast.warning(`${totalShots} shots générés, ${failedSceneIds.length} scène(s) à relancer`);
        } else {
          toast.success(`${totalShots} shots générés sur ${sceneIds.length} scènes`);
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.error("Timeout — relancez la génération (les scènes restantes seront générées)");
      } else {
        console.error(e);
        toast.error(e?.message || "Erreur inattendue");
      }
    }

    setGeneratingStoryboard(false);
    setRegeneratingSceneId(null);
  }, [projectId, scenes]);

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
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0 || idx >= scenes.length - 1) return;
    const current = scenes[idx];
    const next = scenes[idx + 1];
    const mergedText = `${current.source_text} ${next.source_text}`;
    const mergedTitle = current.title;
    await supabase.from("scenes").update({ source_text: mergedText, title: mergedTitle }).eq("id", current.id);
    await supabase.from("shots").delete().eq("scene_id", next.id);
    await supabase.from("scenes").delete().eq("id", next.id);
    // Reorder remaining
    const newScenes = scenes.filter((s) => s.id !== next.id).map((s, i) => ({ ...s, scene_order: i + 1 }));
    for (const s of newScenes) {
      if (s.id === current.id) {
        await supabase.from("scenes").update({ source_text: mergedText, scene_order: s.scene_order }).eq("id", s.id);
      } else {
        await supabase.from("scenes").update({ scene_order: s.scene_order }).eq("id", s.id);
      }
    }
    setScenes(newScenes.map((s) => s.id === current.id ? { ...s, source_text: mergedText } : s));
    setShots((prev) => prev.filter((s) => s.scene_id !== next.id));
    toast.success("Scènes fusionnées");
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

        {/* ScriptInput tab */}
        {!showSetup && activeTab === "script" && (
          <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">ScriptInput</h2>
            <p className="text-sm text-muted-foreground mb-4 sm:mb-6">Collez ou saisissez votre narration ci-dessous, puis lancez la segmentation.</p>
            <textarea value={narration} onChange={(e) => setNarration(e.target.value)}
              placeholder="Collez votre voix-off ici..."
              className="w-full min-h-[200px] sm:min-h-[300px] rounded border border-border bg-card p-3 sm:p-4 text-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 font-body" />
            <div className="mt-1.5 text-xs text-muted-foreground text-right">
              {narration.length.toLocaleString()} caractères
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={runSegmentation} disabled={!narration.trim() || segmenting} className="min-h-[44px]">
                {segmenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {segmenting ? "Segmentation..." : "Lancer la segmentation"}
              </Button>
            </div>
          </div>
        )}

        {/* ScriptCreator tab — kept mounted to preserve state */}
        {!showSetup && (
          <div className={activeTab === "script-creator" ? "" : "hidden"}>
            <PdfDocumentaryTab
              projectId={projectId}
              scriptLanguage={scriptLanguage}
              onLanguageChange={(lang) => setScriptLanguage(lang)}
              onSendToScriptInput={(text) => {
                setNarration(text);
                setActiveTab("script");
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
          />
        )}

        {/* Segmentation View */}
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
                <p className="text-sm text-muted-foreground">Aucune scène. Lancez la segmentation depuis l'onglet ScriptInput.</p>
                <Button variant="outline" onClick={() => setActiveTab("script")}>
                  <ArrowLeft className="h-4 w-4" /> Retour au script
                </Button>
              </div>
            )}

            {!segmenting && scenes.length > 0 && (
              <>
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
                <p className="text-sm text-muted-foreground">SceneBlocks et ShotCards. Cliquez pour éditer.</p>
              </div>
              {!generatingStoryboard && scenes.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[40px] shrink-0">
                  <Play className="h-4 w-4" /> Re-générer tous les shots
                </Button>
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
                <Button variant="outline" onClick={() => setActiveTab("script")}>
                  <ArrowLeft className="h-4 w-4" /> Retour au script
                </Button>
              </div>
            )}

            {scenes.length > 0 && (
              <>
                {generatingStoryboard && (
                  <div className="flex items-center gap-2 mb-6 p-3 rounded border border-primary/20 bg-primary/5">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Génération des prompts visuels en cours...</p>
                  </div>
                )}
                <div className="space-y-8">
                  {(() => {
                    let globalShotIndex = 1;
                    return scenes.map((scene, i) => {
                      const sceneShots = getShotsForScene(scene.id);
                      const isRegenerating = regeneratingSceneId === scene.id;
                      const isPendingGeneration = generatingStoryboard && sceneShots.length === 0;
                      const startIndex = globalShotIndex;
                      globalShotIndex += sceneShots.length;
                      return (
                        <div key={scene.id} className="animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
                          <div className="flex items-start sm:items-center flex-wrap gap-2 mb-4">
                            <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.scene_order}</span>
                            <span className="text-xs text-muted-foreground">—</span>
                            <span className="text-sm font-display text-foreground">{scene.title}</span>
                            {scene.validated && (
                              <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Validée
                              </span>
                            )}
                            <button
                              onClick={() => runStoryboard(scene.id)}
                              disabled={isRegenerating}
                              className="sm:ml-auto flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[36px]"
                              title="Régénérer les shots de cette scène"
                            >
                              {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              <span>Régénérer</span>
                            </button>
                          </div>
                          <div className="rounded border border-border bg-card p-4 mb-4">
                            <p className="text-sm text-muted-foreground leading-relaxed italic">"{scene.source_text}"</p>
                          </div>

                          {isRegenerating || isPendingGeneration ? (
                            <div className="flex items-center justify-center py-8 gap-2">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              <p className="text-xs text-muted-foreground">{isRegenerating ? "Régénération des shots..." : "En attente..."}</p>
                            </div>
                          ) : sceneShots.length === 0 && !generatingStoryboard ? (
                            <p className="text-xs text-muted-foreground italic">Aucun shot généré pour cette scène.</p>
                          ) : (
                            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                              {sceneShots.map((shot, shotIdx) => (
                                <ShotCard key={shot.id} shot={shot} globalIndex={startIndex + shotIdx} sceneLabel={`Scène ${scene.scene_order} — ${scene.title}`} onUpdate={handleShotUpdate} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="mt-8 flex gap-3">
                  <Button variant="outline" onClick={() => runStoryboard()} disabled={generatingStoryboard}>
                    <Play className="h-4 w-4" /> Re-générer tous les shots
                  </Button>
                </div>
              </>
            )}
          </div>
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
    </div>
  );
}
