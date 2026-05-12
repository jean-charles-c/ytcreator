import { useCallback, useEffect, useState } from "react";
import { Loader2, History, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisPayload } from "./NarrativeAnalysisPanel";

export interface NarrativeStudyRow {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  source_ids: string[] | null;
  payload: AnalysisPayload;
}

interface Props {
  projectId: string;
  activeAnalysisId: string | null;
  onLoadStudy: (study: NarrativeStudyRow) => void;
  onNewStudy: () => void;
  /** Incrémenté pour forcer un rechargement après nouvelle analyse. */
  refreshSignal?: number;
}

/**
 * Liste l'historique des études narratives complétées d'un projet.
 * Permet de rouvrir une ancienne étude (lecture) ou de démarrer une
 * nouvelle étude (réinitialise les Sources).
 */
export default function NarrativeStudiesHistory({
  projectId,
  activeAnalysisId,
  onLoadStudy,
  onNewStudy,
  refreshSignal = 0,
}: Props) {
  const [studies, setStudies] = useState<NarrativeStudyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("narrative_analyses")
      .select(
        "id, title, summary, structure, patterns, tone, rhythm, writing_rules, recommendations, source_ids, created_at, status",
      )
      .eq("project_id", projectId)
      .eq("status", "analysis_completed")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setStudies(
        data.map((d: any) => ({
          id: d.id,
          title: d.title,
          summary: d.summary,
          created_at: d.created_at,
          source_ids: d.source_ids,
          payload: {
            title: d.title ?? undefined,
            summary: d.summary ?? undefined,
            structure: d.structure ?? undefined,
            patterns: d.patterns ?? undefined,
            tone: d.tone ?? undefined,
            rhythm: d.rhythm ?? undefined,
            writing_rules: d.writing_rules ?? undefined,
            recommendations: d.recommendations ?? undefined,
          },
        })),
      );
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-display text-sm sm:text-base font-semibold text-foreground">
            Études précédentes
          </h3>
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            ({studies.length})
          </span>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onNewStudy}
          className="min-h-[36px] shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouvelle étude
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement…
        </div>
      ) : studies.length === 0 ? (
        <p className="text-[11px] sm:text-xs text-muted-foreground italic py-2">
          Aucune étude enregistrée pour ce projet. Cliquez sur « Nouvelle étude » pour démarrer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {studies.map((s) => {
            const isActive = s.id === activeAnalysisId;
            return (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background hover:border-primary/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">
                    {s.title || "Étude sans titre"}
                    {isActive && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">
                        active
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString("fr-FR")} ·{" "}
                    {Array.isArray(s.source_ids) ? s.source_ids.length : 0} source
                    {(s.source_ids?.length ?? 0) > 1 ? "s" : ""}
                  </p>
                </div>
                {!isActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onLoadStudy(s)}
                    className="h-7 px-2 shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Rouvrir
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}