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
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Tab = "script" | "segmentation" | "storyboard" | "export";

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

// Mock scene data (will be replaced in step 4)
const mockScenes = [
  {
    id: 1,
    title: "Scène 1 — Les caravanes de Samarkand",
    narration: "Au cœur de l'Asie centrale, les caravanes chargées de soie traversaient les déserts arides...",
    shots: [
      { type: "Establishing Shot", description: "Vue aérienne de caravanes traversant un désert au coucher du soleil, lumière dorée rasante." },
      { type: "Activity Shot", description: "Marchands chargeant des ballots de soie sur des chameaux dans un caravansérail." },
      { type: "Detail Shot", description: "Gros plan sur des fils de soie colorés, texture visible, lumière naturelle diffuse." },
    ],
  },
  {
    id: 2,
    title: "Scène 2 — Le marché de Chang'an",
    narration: "À l'autre bout de la route, Chang'an vibrait d'une activité commerciale sans précédent...",
    shots: [
      { type: "Establishing Shot", description: "Panorama d'une ville fortifiée avec portes monumentales, foule dense, architecture Tang." },
      { type: "Activity Shot", description: "Échanges animés entre marchands persans et chinois sur un étal de céramiques." },
    ],
  },
];

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";

  // Project fields
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState("en");
  const [narration, setNarration] = useState("");
  const [projectId, setProjectId] = useState<string | null>(isNew ? null : id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>(isNew ? "script" : "script");
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(!isNew);
  const [showSetup, setShowSetup] = useState(isNew);

  // Load existing project
  useEffect(() => {
    if (isNew || !id) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) {
        toast.error("Projet introuvable");
        navigate("/dashboard");
        return;
      }
      setTitle(data.title);
      setSubject(data.subject ?? "");
      setScriptLanguage(data.script_language);
      setNarration(data.narration ?? "");
      setProjectId(data.id);
      setShowSetup(false);
      setLoadingProject(false);
    };
    load();
  }, [id, isNew, navigate]);

  // Save / create project
  const saveProject = useCallback(async () => {
    if (!user) return;
    if (!title.trim()) {
      toast.error("Veuillez saisir un titre.");
      return;
    }
    setSaving(true);

    if (projectId) {
      // Update
      const { error } = await supabase
        .from("projects")
        .update({ title: title.trim(), subject: subject.trim() || null, script_language: scriptLanguage, narration: narration.trim() || null })
        .eq("id", projectId);
      setSaving(false);
      if (error) { toast.error("Erreur de sauvegarde"); return; }
      toast.success("Projet sauvegardé");
    } else {
      // Create
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, title: title.trim(), subject: subject.trim() || null, script_language: scriptLanguage, narration: narration.trim() || null })
        .select()
        .single();
      setSaving(false);
      if (error || !data) { toast.error("Erreur de création"); return; }
      setProjectId(data.id);
      setShowSetup(false);
      toast.success("Projet créé");
      navigate(`/editor/${data.id}`, { replace: true });
    }
  }, [user, projectId, title, subject, scriptLanguage, narration, navigate]);

  if (loadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border shrink-0">
        <div className="flex h-14 items-center px-4 gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Film className="h-5 w-5 text-primary" />
          <span className="font-display font-semibold text-foreground truncate">
            {title || "Nouveau projet"}
          </span>

          {!showSetup && (
            <div className="ml-auto flex items-center gap-1">
              {tabItems.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                    activeTab === t.key
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {/* New project setup */}
        {showSetup && (
          <div className="container max-w-lg py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              Nouveau projet
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Décrivez votre projet documentaire pour commencer.
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Titre du projet *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. La Route de la Soie — Épisode 3"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Sujet / description</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="ex. Commerce historique entre Orient et Occident"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Langue du script</label>
                <select
                  value={scriptLanguage}
                  onChange={(e) => setScriptLanguage(e.target.value)}
                  className="w-full h-10 rounded border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
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
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              ScriptInput
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Collez ou saisissez votre narration ci-dessous, puis sauvegardez.
            </p>
            <textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Collez votre voix-off ici..."
              className="w-full min-h-[300px] rounded border border-border bg-card p-4 text-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 font-body"
            />
            <div className="mt-4 flex gap-3">
              <Button variant="hero" onClick={saveProject} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab("segmentation")}
                disabled={!narration.trim()}
              >
                <Play className="h-4 w-4" />
                Lancer la segmentation
              </Button>
            </div>
          </div>
        )}

        {/* Segmentation tab (still mock — step 4) */}
        {!showSetup && activeTab === "segmentation" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              Segmentation View
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Votre narration découpée en SceneBlocks. Ajustez si nécessaire.
            </p>
            <div className="space-y-4">
              {mockScenes.map((scene, i) => (
                <div
                  key={scene.id}
                  className="rounded border border-border bg-card p-5 animate-fade-in"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.id}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-foreground mb-2">{scene.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{scene.narration}</p>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Button variant="hero" onClick={() => setActiveTab("storyboard")}>
                <Clapperboard className="h-4 w-4" />
                Générer le storyboard
              </Button>
            </div>
          </div>
        )}

        {/* Storyboard tab (still mock — step 5) */}
        {!showSetup && activeTab === "storyboard" && (
          <div className="container max-w-5xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Storyboard View</h2>
            <p className="text-sm text-muted-foreground mb-8">SceneBlocks et ShotCards correspondantes.</p>
            <div className="space-y-8">
              {mockScenes.map((scene, i) => (
                <div key={scene.id} className="animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.id}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-sm font-display text-foreground">{scene.title.split("—")[1]?.trim()}</span>
                  </div>
                  <div className="rounded border border-border bg-card p-4 mb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed italic">"{scene.narration}"</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {scene.shots.map((shot, j) => (
                      <div key={j} className="group rounded border border-border bg-card overflow-hidden transition-colors hover:border-primary/30">
                        <div className="aspect-video bg-secondary flex items-center justify-center">
                          <Clapperboard className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-display font-medium text-primary">{shot.type}</span>
                            <Shield className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Historical Realism verified" />
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{shot.description}</p>
                          <div className="mt-3 rounded bg-background border border-border p-2">
                            <code className="text-[10px] text-muted-foreground leading-tight block font-mono">{shot.description.slice(0, 80)}...</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export tab */}
        {!showSetup && activeTab === "export" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">Export Center</h2>
            <p className="text-sm text-muted-foreground mb-8">Récupérez vos fichiers prêts à l'emploi.</p>
            <div className="space-y-4">
              {[
                { label: "Visual Prompts", desc: "Prompts formatés pour Grok Image" },
                { label: "Scene Mapping", desc: "Correspondance narration ↔ scènes ↔ shots" },
                { label: "Narration Segmentation", desc: "Découpage narratif brut" },
              ].map((exp, i) => (
                <div key={exp.label} className="flex items-center justify-between rounded border border-border bg-card p-4 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">{exp.label}</h3>
                    <p className="text-xs text-muted-foreground">{exp.desc}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Exporter
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
