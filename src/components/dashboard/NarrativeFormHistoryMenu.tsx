import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

interface AnalysisRow {
  id: string;
  title: string | null;
  created_at: string;
  project_id: string | null;
  source_count: number;
  project_title: string | null;
}

/**
 * Menu déroulant accessible depuis « Mes projets » : liste l'historique
 * complet des études Narrative Form Generator de l'utilisateur. Permet
 * de rouvrir une étude (avec son projet rattaché s'il existe) ou de
 * démarrer une nouvelle étude pour créer un nouveau projet.
 */
export default function NarrativeFormHistoryMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AnalysisRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: analyses } = await supabase
          .from("narrative_analyses")
          .select("id, title, created_at, project_id, source_ids")
          .eq("status", "analysis_completed")
          .order("created_at", { ascending: false })
          .limit(50);
        const projectIds = Array.from(
          new Set((analyses ?? []).map((a: any) => a.project_id).filter(Boolean)),
        ) as string[];
        let titles: Record<string, string> = {};
        if (projectIds.length > 0) {
          const { data: projs } = await supabase
            .from("projects")
            .select("id, title")
            .in("id", projectIds);
          titles = Object.fromEntries((projs ?? []).map((p: any) => [p.id, p.title]));
        }
        if (cancelled) return;
        setItems(
          (analyses ?? []).map((a: any) => ({
            id: a.id,
            title: a.title,
            created_at: a.created_at,
            project_id: a.project_id,
            source_count: Array.isArray(a.source_ids) ? a.source_ids.length : 0,
            project_title: a.project_id ? titles[a.project_id] ?? null : null,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const goToStudy = (row: AnalysisRow) => {
    setOpen(false);
    if (row.project_id) {
      navigate(`/narrative-form/${row.project_id}?analysis=${row.id}`);
    } else {
      navigate(`/narrative-form?analysis=${row.id}`);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-h-[40px]" title="Historique NFG">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Historique NFG</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>Études narratives</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setOpen(false);
            navigate("/narrative-form");
          }}
          className="cursor-pointer"
        >
          <Plus className="h-4 w-4 text-primary" />
          <span>Nouvelle étude / nouveau projet</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground italic">
            Aucune étude enregistrée pour le moment.
          </p>
        ) : (
          items.map((it) => (
            <DropdownMenuItem
              key={it.id}
              onSelect={(e) => {
                e.preventDefault();
                goToStudy(it);
              }}
              className="cursor-pointer flex-col items-start gap-0.5 py-2"
            >
              <span className="text-xs font-medium text-foreground line-clamp-1">
                {it.title || "Étude sans titre"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(it.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {it.source_count} source{it.source_count > 1 ? "s" : ""}
                {it.project_title ? ` · ${it.project_title}` : " · sans projet"}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}