import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Plus, Film, Clock, CheckCircle, FileText, ArrowLeft, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;

const statusConfig = {
  draft: { label: "Brouillon", icon: FileText, color: "text-muted-foreground" },
  segmented: { label: "Segmenté", icon: Clock, color: "text-primary" },
  storyboarded: { label: "VisualPrompts ✓", icon: CheckCircle, color: "text-primary" },
  exported: { label: "Exporté", icon: CheckCircle, color: "text-green-500" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      setProjects(data ?? []);
      setLoading(false);
    };
    fetchProjects();
  }, []);

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Supprimer ce projet et toutes ses scènes/shots ?")) return;
    // Delete shots, scenes, then project
    await supabase.from("shots").delete().eq("project_id", projectId);
    await supabase.from("scenes").delete().eq("project_id", projectId);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) { toast.error("Erreur de suppression"); return; }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    toast.success("Projet supprimé");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Film className="h-5 w-5 text-primary" />
            <span className="font-display text-base sm:text-lg font-semibold text-foreground">Mes projets</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="hero" size="sm" onClick={() => navigate("/editor/new")} className="min-h-[40px]">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouveau projet</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/login"); }} className="min-h-[40px] min-w-[40px]">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-10 px-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => {
              const s = statusConfig[project.status];
              return (
                <button
                  key={project.id}
                  onClick={() => navigate(`/editor/${project.id}`)}
                  className="group rounded border border-border bg-card p-4 sm:p-5 text-left transition-colors hover:bg-surface-hover animate-fade-in min-h-[80px]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-start justify-between mb-2 sm:mb-3">
                    <h3 className="font-display text-sm sm:text-base font-semibold text-foreground leading-snug pr-4">
                      {project.title}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <s.icon className={`h-4 w-4 mt-0.5 ${s.color}`} />
                      <button
                        onClick={(e) => deleteProject(e, project.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Supprimer le projet"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className={s.color}>{s.label}</span>
                    <span>·</span>
                    <span>{project.scene_count} scènes</span>
                    <span>·</span>
                    <span>{timeAgo(project.updated_at)}</span>
                  </div>
                </button>
              );
            })}

            <button
              onClick={() => navigate("/editor/new")}
              className="rounded border border-dashed border-border bg-transparent p-5 text-center transition-colors hover:border-primary/50 hover:bg-secondary/50 flex flex-col items-center justify-center min-h-[80px] sm:min-h-[120px]"
            >
              <Plus className="h-6 w-6 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Créer un projet</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
