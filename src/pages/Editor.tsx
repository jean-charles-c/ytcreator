import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Film,
  Layers,
  Clapperboard,
  Download,
  Play,
  Shield,
  Save,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Tab = "script" | "segmentation" | "storyboard" | "export";
type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

const tabItems: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "script", label: "ScriptInput", icon: Film },
  { key: "segmentation", label: "Segmentation", icon: Layers },
  { key: "storyboard", label: "Storyboard", icon: Clapperboard },
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
      setShots([]); // Clear old shots since scenes changed
      toast.success(`${sceneData?.length ?? 0} scènes générées`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setSegmenting(false);
  }, [projectId, narration]);

  // Generate storyboard
  const runStoryboard = useCallback(async () => {
    if (!projectId) return;
    setGeneratingStoryboard(true);
    setActiveTab("storyboard");
    try {
      const { data, error } = await supabase.functions.invoke("generate-storyboard", { body: { project_id: projectId } });
      if (error) { toast.error("Erreur de génération du storyboard"); console.error(error); setGeneratingStoryboard(false); return; }
      if (data?.error) { toast.error(data.error); setGeneratingStoryboard(false); return; }
      const { data: shotData } = await supabase.from("shots").select("*").eq("project_id", projectId).order("shot_order", { ascending: true });
      if (shotData) setShots(shotData);
      toast.success(`${data?.shots_count ?? 0} shots générés`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingStoryboard(false);
  }, [projectId]);

  // Helper: get shots for a specific scene
  const getShotsForScene = (sceneId: string) => shots.filter((s) => s.scene_id === sceneId);

  if (loadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border shrink-0">
        <div className="flex h-14 items-center px-4 gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Film className="h-5 w-5 text-primary" />
          <span className="font-display font-semibold text-foreground truncate">{title || "Nouveau projet"}</span>
          {!showSetup && (
            <div className="ml-auto flex items-center gap-1">
              {tabItems.map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${activeTab === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {/* New project setup */}
        {showSetup && (
          <div className="container max-w-lg py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Nouveau projet</h2>
            <p className="text-sm text-muted-foreground mb-8">Décrivez votre projet documentaire pour commencer.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Titre du projet *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. La Route de la Soie — Épisode 3" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Sujet / description</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. Commerce historique entre Orient et Occident" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Langue du script</label>
                <select value={scriptLanguage} onChange={(e) => setScriptLanguage(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-8">
              <Button variant="hero" onClick={saveProject} disabled={saving || !title.trim()}>
                {saving ? "Création..." : "Créer le projet"}
              </Button>
            </div>
          </div>
        )}

        {/* ScriptInput tab */}
        {!showSetup && activeTab === "script" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">ScriptInput</h2>
            <p className="text-sm text-muted-foreground mb-6">Collez ou saisissez votre narration ci-dessous, puis lancez la segmentation.</p>
            <textarea value={narration} onChange={(e) => setNarration(e.target.value)}
              placeholder="Collez votre voix-off ici..."
              className="w-full min-h-[300px] rounded border border-border bg-card p-4 text-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 font-body" />
            <div className="mt-4 flex gap-3">
              <Button variant="hero" onClick={saveProject} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button variant="outline" onClick={runSegmentation} disabled={!narration.trim() || segmenting}>
                {segmenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {segmenting ? "Segmentation..." : "Lancer la segmentation"}
              </Button>
            </div>
          </div>
        )}

        {/* Segmentation View */}
        {!showSetup && activeTab === "segmentation" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Segmentation View</h2>
            <p className="text-sm text-muted-foreground mb-6">Votre narration découpée en SceneBlocks.</p>

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
                    <div key={scene.id} className="rounded border border-border bg-card p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.scene_order}</span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-foreground mb-2">{scene.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{scene.source_text}</p>
                      {scene.visual_intention && (
                        <div className="flex items-start gap-2 rounded bg-secondary/50 border border-border p-3">
                          <Film className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground italic leading-relaxed">{scene.visual_intention}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" onClick={runSegmentation} disabled={segmenting}>
                    <Play className="h-4 w-4" /> Re-segmenter
                  </Button>
                  <Button variant="hero" onClick={runStoryboard} disabled={generatingStoryboard}>
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
          <div className="container max-w-5xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Storyboard View</h2>
            <p className="text-sm text-muted-foreground mb-8">SceneBlocks et ShotCards correspondantes.</p>

            {generatingStoryboard && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Génération des plans documentaires...</p>
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

            {!generatingStoryboard && scenes.length > 0 && (
              <>
                <div className="space-y-8">
                  {scenes.map((scene, i) => {
                    const sceneShots = getShotsForScene(scene.id);
                    return (
                      <div key={scene.id} className="animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.scene_order}</span>
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className="text-sm font-display text-foreground">{scene.title}</span>
                        </div>
                        <div className="rounded border border-border bg-card p-4 mb-4">
                          <p className="text-sm text-muted-foreground leading-relaxed italic">"{scene.source_text}"</p>
                        </div>

                        {sceneShots.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Aucun shot généré pour cette scène.</p>
                        ) : (
                          <div className="grid gap-4 md:grid-cols-3">
                            {sceneShots.map((shot) => (
                              <div key={shot.id} className="group rounded border border-border bg-card overflow-hidden transition-colors hover:border-primary/30">
                                <div className="aspect-video bg-secondary flex items-center justify-center">
                                  <Clapperboard className="h-8 w-8 text-muted-foreground/30" />
                                </div>
                                <div className="p-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-display font-medium text-primary">{shot.shot_type}</span>
                                    {shot.guardrails && (
                                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium" title="Historical Realism verified">
                                        <Shield className="h-2.5 w-2.5" />
                                        HR
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{shot.description}</p>
                                  {shot.guardrails && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                      {shot.guardrails.split(",").map((g, gi) => (
                                        <span key={gi} className="rounded bg-secondary border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                          {g.trim()}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {shot.prompt_export && (
                                    <div className="rounded bg-background border border-border p-2">
                                      <code className="text-[10px] text-muted-foreground leading-tight block font-mono">
                                        {shot.prompt_export.slice(0, 120)}...
                                      </code>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-8 flex gap-3">
                  <Button variant="outline" onClick={runStoryboard} disabled={generatingStoryboard}>
                    <Play className="h-4 w-4" /> Re-générer les shots
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Export tab */}
        {!showSetup && activeTab === "export" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Export Center</h2>
            <p className="text-sm text-muted-foreground mb-8">Récupérez vos fichiers prêts à l'emploi.</p>
            <div className="space-y-4">
              {[
                { label: "Visual Prompts", desc: "Prompts formatés pour Grok Image", generate: generateVisualPrompts },
                { label: "Scene Mapping", desc: "Correspondance narration ↔ scènes ↔ shots", generate: generateSceneMapping },
                { label: "Narration Segmentation", desc: "Découpage narratif brut", generate: generateNarrationSegmentation },
              ].map((exp, i) => (
                <div key={exp.label} className="flex items-center justify-between rounded border border-border bg-card p-4 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">{exp.label}</h3>
                    <p className="text-xs text-muted-foreground">{exp.desc}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={exp.generate} disabled={scenes.length === 0}>
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
