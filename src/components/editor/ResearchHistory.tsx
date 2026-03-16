import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ResearchDossier {
  id: string;
  topic: string;
  angle: string | null;
  depth: string;
  content: string;
  created_at: string;
}

interface ResearchHistoryProps {
  projectId: string | null;
  onLoad: (dossier: ResearchDossier) => void;
}

export default function ResearchHistory({ projectId, onLoad }: ResearchHistoryProps) {
  const { user } = useAuth();
  const [dossiers, setDossiers] = useState<ResearchDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !projectId) return;
    const fetchDossiers = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("research_dossiers")
        .select("id, topic, angle, depth, content, created_at")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) setDossiers(data);
      setLoading(false);
    };
    fetchDossiers();
  }, [user, projectId]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await (supabase as any)
      .from("research_dossiers")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      setDossiers((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dossier supprimé");
    }
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'historique…
      </div>
    );
  }

  if (dossiers.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Recherches précédentes</h3>
      </div>
      <div className="space-y-2">
        {dossiers.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 p-3 rounded border border-border bg-card hover:bg-secondary/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{d.topic}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(d.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {d.angle && ` · ${d.angle}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              onClick={() => onLoad(d)}
              title="Charger ce dossier"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDelete(d.id)}
              disabled={deletingId === d.id}
              title="Supprimer"
            >
              {deletingId === d.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
