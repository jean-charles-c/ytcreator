import { useState } from "react";
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
} from "lucide-react";

type Tab = "script" | "segmentation" | "storyboard" | "export";

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "script", label: "ScriptInput", icon: Film },
  { key: "segmentation", label: "Segmentation", icon: Layers },
  { key: "storyboard", label: "Storyboard", icon: Clapperboard },
  { key: "export", label: "Export", icon: Download },
];

// Mock scene data
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
  const [activeTab, setActiveTab] = useState<Tab>("storyboard");
  const [script, setScript] = useState(
    id === "new"
      ? ""
      : "Au cœur de l'Asie centrale, les caravanes chargées de soie traversaient les déserts arides de la Route de la Soie. Ce réseau commercial légendaire reliait l'Orient à l'Occident..."
  );

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
            {id === "new" ? "Nouveau projet" : "La Route de la Soie — Épisode 3"}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {tabs.map((t) => (
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
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === "script" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              ScriptInput
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Collez ou saisissez votre narration ci-dessous, puis lancez la segmentation.
            </p>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Collez votre voix-off ici..."
              className="w-full min-h-[300px] rounded border border-border bg-card p-4 text-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 font-body"
            />
            <div className="mt-4 flex gap-3">
              <Button
                variant="hero"
                onClick={() => setActiveTab("segmentation")}
                disabled={!script.trim()}
              >
                <Play className="h-4 w-4" />
                Lancer la segmentation
              </Button>
            </div>
          </div>
        )}

        {activeTab === "segmentation" && (
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
                    <span className="text-xs font-display font-medium text-primary">
                      SCÈNE {scene.id}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-foreground mb-2">
                    {scene.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {scene.narration}
                  </p>
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

        {activeTab === "storyboard" && (
          <div className="container max-w-5xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              Storyboard View
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              SceneBlocks et ShotCards correspondantes.
            </p>
            <div className="space-y-8">
              {mockScenes.map((scene, i) => (
                <div
                  key={scene.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  {/* Scene header */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-display font-medium text-primary">
                      SCÈNE {scene.id}
                    </span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-sm font-display text-foreground">
                      {scene.title.split("—")[1]?.trim()}
                    </span>
                  </div>

                  {/* Narration */}
                  <div className="rounded border border-border bg-card p-4 mb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed italic">
                      "{scene.narration}"
                    </p>
                  </div>

                  {/* Shot cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {scene.shots.map((shot, j) => (
                      <div
                        key={j}
                        className="group rounded border border-border bg-card overflow-hidden transition-colors hover:border-primary/30"
                      >
                        {/* 16:9 placeholder */}
                        <div className="aspect-video bg-secondary flex items-center justify-center">
                          <Clapperboard className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-display font-medium text-primary">
                              {shot.type}
                            </span>
                            <Shield className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Historical Realism verified" />
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {shot.description}
                          </p>
                          {/* PromptExport preview */}
                          <div className="mt-3 rounded bg-background border border-border p-2">
                            <code className="text-[10px] text-muted-foreground leading-tight block font-mono">
                              {shot.description.slice(0, 80)}...
                            </code>
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

        {activeTab === "export" && (
          <div className="container max-w-3xl py-10 animate-fade-in">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              Export Center
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Récupérez vos fichiers prêts à l'emploi.
            </p>
            <div className="space-y-4">
              {[
                { label: "Visual Prompts", desc: "Prompts formatés pour Grok Image" },
                { label: "Scene Mapping", desc: "Correspondance narration ↔ scènes ↔ shots" },
                { label: "Narration Segmentation", desc: "Découpage narratif brut" },
              ].map((exp, i) => (
                <div
                  key={exp.label}
                  className="flex items-center justify-between rounded border border-border bg-card p-4 animate-fade-in"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      {exp.label}
                    </h3>
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
