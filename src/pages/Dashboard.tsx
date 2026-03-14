import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Plus, Film, Clock, CheckCircle, FileText, ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Project {
  id: string;
  title: string;
  scenes: number;
  status: "draft" | "segmented" | "storyboarded" | "exported";
  updatedAt: string;
}

const mockProjects: Project[] = [
  { id: "1", title: "La Route de la Soie — Épisode 3", scenes: 12, status: "storyboarded", updatedAt: "Il y a 2h" },
  { id: "2", title: "Révolution Industrielle", scenes: 8, status: "segmented", updatedAt: "Hier" },
  { id: "3", title: "Origines de l'Écriture", scenes: 0, status: "draft", updatedAt: "Il y a 3 jours" },
];

const statusConfig = {
  draft: { label: "Brouillon", icon: FileText, color: "text-muted-foreground" },
  segmented: { label: "Segmenté", icon: Clock, color: "text-primary" },
  storyboarded: { label: "Storyboardé", icon: CheckCircle, color: "text-primary" },
  exported: { label: "Exporté", icon: CheckCircle, color: "text-green-500" },
};

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Film className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-semibold text-foreground">Mes projets</span>
          </div>
          <Button variant="hero" size="sm" onClick={() => navigate("/editor/new")}>
            <Plus className="h-4 w-4" />
            Nouveau projet
          </Button>
        </div>
      </header>

      {/* Projects grid */}
      <main className="container py-10">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockProjects.map((project, i) => {
            const s = statusConfig[project.status];
            return (
              <button
                key={project.id}
                onClick={() => navigate(`/editor/${project.id}`)}
                className="group rounded border border-border bg-card p-5 text-left transition-colors hover:bg-surface-hover animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-base font-semibold text-foreground leading-snug pr-4">
                    {project.title}
                  </h3>
                  <s.icon className={`h-4 w-4 shrink-0 mt-0.5 ${s.color}`} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={s.color}>{s.label}</span>
                  <span>·</span>
                  <span>{project.scenes} scènes</span>
                  <span>·</span>
                  <span>{project.updatedAt}</span>
                </div>
              </button>
            );
          })}

          {/* Empty state card */}
          <button
            onClick={() => navigate("/editor/new")}
            className="rounded border border-dashed border-border bg-transparent p-5 text-center transition-colors hover:border-primary/50 hover:bg-secondary/50 flex flex-col items-center justify-center min-h-[120px]"
          >
            <Plus className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Créer un projet</span>
          </button>
        </div>
      </main>
    </div>
  );
}
