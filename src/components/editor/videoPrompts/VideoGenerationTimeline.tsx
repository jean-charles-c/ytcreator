/**
 * VideoGenerationTimeline — Chronological history of all generation attempts.
 */

import {
  History,
  Clock,
  DollarSign,
  AlertCircle,
  Trash2,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { VideoGeneration } from "./videoGeneration.types";
import { PROVIDER_CAPABILITIES } from "./providerCapabilityConfig";

interface VideoGenerationTimelineProps {
  generations: VideoGeneration[];
  onDeleted: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  not_generated: { label: "Non généré", dot: "bg-muted-foreground" },
  pending: { label: "En attente", dot: "bg-amber-400" },
  processing: { label: "En cours", dot: "bg-blue-400 animate-pulse" },
  completed: { label: "Terminé", dot: "bg-emerald-400" },
  error: { label: "Erreur", dot: "bg-destructive" },
};

export default function VideoGenerationTimeline({
  generations,
  onDeleted,
}: VideoGenerationTimelineProps) {
  if (generations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-8 text-center">
        <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Aucun historique de génération
        </p>
      </div>
    );
  }

  const providerName = (id: string) =>
    PROVIDER_CAPABILITIES[id as keyof typeof PROVIDER_CAPABILITIES]?.name ?? id;

  async function handleDelete(gen: VideoGeneration) {
    const { error } = await supabase
      .from("video_generations")
      .delete()
      .eq("id", gen.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entrée supprimée" });
    onDeleted(gen.id);
  }

  function handleDownload(gen: VideoGeneration) {
    if (!gen.resultVideoUrl) return;
    const a = document.createElement("a");
    a.href = gen.resultVideoUrl;
    a.download = `video-${gen.provider}-${gen.id.slice(0, 8)}.mp4`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="space-y-2">
      {generations.map((gen) => {
        const cfg = STATUS_CONFIG[gen.status] ?? STATUS_CONFIG.not_generated;

        return (
          <div
            key={gen.id}
            className="rounded-md border border-border bg-secondary/30 p-3 space-y-2"
          >
            {/* Row 1: Status + Provider + Date */}
            <div className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {providerName(gen.provider)}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {gen.durationSec}s • {gen.aspectRatio}
              </span>
              <Badge
                variant="secondary"
                className={`text-[9px] px-1.5 py-0 ml-auto ${
                  gen.status === "error" ? "text-destructive" : ""
                }`}
              >
                {cfg.label}
              </Badge>
            </div>

            {/* Row 2: Prompt */}
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {gen.promptUsed || "—"}
            </p>

            {/* Row 3: Metadata */}
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground/70 flex-wrap">
              {gen.generationTimeMs != null && (
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {(gen.generationTimeMs / 1000).toFixed(1)}s de génération
                </span>
              )}
              {gen.estimatedCostUsd != null && (
                <span className="flex items-center gap-0.5">
                  <DollarSign className="h-2.5 w-2.5" />
                  ~${gen.estimatedCostUsd.toFixed(2)}
                </span>
              )}
              <span>
                {new Date(gen.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Error message */}
            {gen.status === "error" && gen.errorMessage && (
              <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/20 p-2">
                <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                <p className="text-[10px] text-destructive leading-relaxed">
                  {gen.errorMessage}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              {gen.status === "completed" && gen.resultVideoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => handleDownload(gen)}
                >
                  <Download className="h-3 w-3" />
                  Télécharger
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(gen)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        );
      })}
    </div>
  );
}
