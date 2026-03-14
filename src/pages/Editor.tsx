import { useState, useEffect, useCallback } from "react";
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

type Tab = "script-creator" | "script" | "segmentation" | "storyboard" | "seo" | "export";
type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

const tabItems: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "script-creator", label: "ScriptCreator", icon: FileText },
  { key: "script", label: "ScriptInput", icon: Film },
  { key: "segmentation", label: "Segmentation", icon: Layers },
  { key: "storyboard", label: "Storyboard", icon: Clapperboard },
  { key: "seo", label: "SEO", icon: Youtube },
  { key: "export", label: "Export", icon: Download },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
];

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
  const [activeTab, setActiveTab] = useState<Tab>("script");
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(!isNew);
  const [showSetup, setShowSetup] = useState(isNew);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [segmenting, setSegmenting] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pdfAnalysis, setPdfAnalysis] = useState<any>(null);
  const [pdfExtractedText, setPdfExtractedText] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);

  // Load existing project + scenes + shots
  useEffect(() => {
    if (isNew || !id) return;
    const load = async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error || !data) { toast.error("Projet introuvable"); navigate("/dashboard"); return; }
      setTitle(data.title);
      setSubject(data.subject ?? "");
      setScriptLanguage(data.script_language);
      setNarration(data.narration ?? "");
      setProjectId(data.id);
      setShowSetup(false);
      const { data: sceneData } = await supabase.from("scenes").select("*").eq("project_id", id).order("scene_order", { ascending: true });
      if (sceneData) setScenes(sceneData);
      const { data: shotData } = await supabase.from("shots").select("*").eq("project_id", id).order("shot_order", { ascending: true });
      if (shotData) setShots(shotData);
      setLoadingProject(false);
    };
    load();
  }, [id, isNew, navigate]);

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
    try {
      const { data, error } = await supabase.functions.invoke("segment-narration", { body: { project_id: projectId } });
      if (error) { toast.error("Erreur de segmentation"); console.error(error); setSegmenting(false); return; }
      if (data?.error) { toast.error(data.error); setSegmenting(false); return; }
      const { data: sceneData } = await supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_order", { ascending: true });
      if (sceneData) setScenes(sceneData);
      setShots([]);
      toast.success(`${sceneData?.length ?? 0} scènes générées`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setSegmenting(false);
  }, [projectId, narration]);

  // Generate storyboard (all or single scene)
  const runStoryboard = useCallback(async (sceneId?: string) => {
    if (!projectId) return;
    if (sceneId) {
      setRegeneratingSceneId(sceneId);
    } else {
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
          toast.error("Aucune scène à storyboarder");
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

        if (failedSceneIds.length > 0) {
          toast.warning(`${totalShots} shots générés, ${failedSceneIds.length} scène(s) à relancer`);
        } else {
          toast.success(`${totalShots} shots générés sur ${sceneIds.length} scènes`);
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.error("Timeout — relancez le storyboard (les scènes restantes seront générées)");
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
    scenes.forEach((scene) => {
      md += `## Scène ${scene.scene_order} — ${scene.title}\n\n`;
      md += `### Narration\n\n> ${scene.source_text}\n\n`;
      if (scene.visual_intention) md += `### Intention visuelle\n\n_${scene.visual_intention}_\n\n`;
      const sceneShots = getShotsForScene(scene.id);
      if (sceneShots.length > 0) {
        md += `### Shots associés\n\n`;
        sceneShots.forEach((shot) => {
          md += `- **${shot.shot_type}**: ${shot.description}`;
          if (shot.guardrails) md += ` [${shot.guardrails}]`;
          md += `\n`;
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

  const generateScriptNarratif = useCallback(() => {
    if (!generatedScript) return;
    const clean = cleanScriptForExport(generatedScript);
    downloadFile(clean, `${title.replace(/\s+/g, "_")}_script_narratif.md`);
    toast.success("Script Narratif exporté");
  }, [title, generatedScript]);

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
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <Button variant="hero" onClick={saveProject} disabled={saving} className="min-h-[44px]">
                <Save className="h-4 w-4" />
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
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
            />
          </div>
        )}

        {/* SEO tab */}
        {!showSetup && activeTab === "seo" && (
          <SeoTab
            projectId={projectId}
            analysis={pdfAnalysis}
            extractedText={pdfExtractedText}
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
                    Storyboard
                  </Button>
                </div>
              )}
            </div>

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
                    {generatingStoryboard ? "Génération..." : "Générer le storyboard"}
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
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-1">Storyboard View</h2>
                <p className="text-sm text-muted-foreground">SceneBlocks et ShotCards. Cliquez pour éditer.</p>
              </div>
              {!generatingStoryboard && scenes.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => runStoryboard()} disabled={generatingStoryboard} className="min-h-[40px] shrink-0">
                  <Play className="h-4 w-4" /> Re-générer tous les shots
                </Button>
              )}
            </div>

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
                  {scenes.map((scene, i) => {
                    const sceneShots = getShotsForScene(scene.id);
                    const isRegenerating = regeneratingSceneId === scene.id;
                    const isPendingGeneration = generatingStoryboard && sceneShots.length === 0;
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
                            {sceneShots.map((shot) => (
                              <ShotCard key={shot.id} shot={shot} onUpdate={handleShotUpdate} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            {scenes.length === 0 && (
              <p className="text-xs text-muted-foreground mt-4 italic">Segmentez et générez le storyboard avant d'exporter.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
