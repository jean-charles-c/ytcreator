/**
 * VideoVariantGrid — Grid of completed video generations with playback, download, delete.
 */

import { useState } from "react";
import {
  Play,
  Download,
  Trash2,
  Clock,
  DollarSign,
  X,
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

interface VideoVariantGridProps {
  generations: VideoGeneration[];
  onDeleted: (id: string) => void;
  /** Label for the parent asset, e.g. "Shot 0012" */
  assetLabel?: string;
}

export default function VideoVariantGrid({ generations, onDeleted, assetLabel }: VideoVariantGridProps) {
  const completed = generations.filter((g) => g.status === "completed");
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (completed.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-8 text-center">
        <Play className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Aucune vidéo générée pour ce visuel
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Lancez une génération depuis l'onglet "Générer vidéo"
        </p>
      </div>
    );
  }

  async function handleDelete(gen: VideoGeneration) {
    const { error } = await supabase
      .from("video_generations")
      .delete()
      .eq("id", gen.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vidéo supprimée" });
    onDeleted(gen.id);
  }

  async function handleDownload(gen: VideoGeneration) {
    if (!gen.resultVideoUrl) return;
    try {
      const resp = await fetch(gen.resultVideoUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-${gen.provider}-${gen.durationSec}s-${gen.id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(gen.resultVideoUrl, "_blank");
    }
  }

  const providerName = (id: string) =>
    PROVIDER_CAPABILITIES[id as keyof typeof PROVIDER_CAPABILITIES]?.name ?? id;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {completed.map((gen) => (
        <div
          key={gen.id}
          className="rounded-lg border border-border bg-secondary/30 overflow-hidden group"
        >
          {/* Video / Thumbnail area */}
          <div className="relative aspect-video bg-background/50">
            {playingId === gen.id && gen.resultVideoUrl ? (
              <>
                <video
                  src={gen.resultVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={() => setPlayingId(null)}
                  className="absolute top-1.5 right-1.5 rounded-full bg-background/80 p-1 hover:bg-background"
                >
                  <X className="h-3 w-3 text-foreground" />
                </button>
              </>
            ) : (
              <>
                {gen.resultThumbnailUrl ? (
                  <img
                    src={gen.resultThumbnailUrl}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="h-8 w-8 text-muted-foreground/20" />
                  </div>
                )}
                {gen.resultVideoUrl && (
                  <button
                    onClick={() => setPlayingId(gen.id)}
                    className="absolute inset-0 flex items-center justify-center bg-background/0 hover:bg-background/30 transition-colors"
                  >
                    <div className="rounded-full bg-background/80 p-2.5">
                      <Play className="h-5 w-5 text-primary fill-primary" />
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Info + Actions */}
          <div className="p-2.5 space-y-2">
            {/* Provider + Duration */}
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {providerName(gen.provider)}
              </Badge>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{gen.durationSec}s</span>
                <span>{gen.aspectRatio}</span>
              </div>
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground/70">
              {gen.generationTimeMs != null && (
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {(gen.generationTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              {gen.estimatedCostUsd != null && (
                <span className="flex items-center gap-0.5">
                  <DollarSign className="h-2.5 w-2.5" />
                  ${gen.estimatedCostUsd.toFixed(2)}
                </span>
              )}
              <span>
                {new Date(gen.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Prompt preview */}
            <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
              {gen.promptUsed}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              {gen.resultVideoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-6 text-[10px] px-3 sm:px-2 gap-1 min-w-[44px]"
                  onClick={() => handleDownload(gen)}
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Télécharger</span>
                  <span className="sm:hidden">DL</span>
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 sm:h-6 text-[10px] px-3 sm:px-2 gap-1 text-destructive hover:text-destructive min-w-[44px]"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette vidéo ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. La vidéo générée sera définitivement supprimée.
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
        </div>
      ))}
    </div>
  );
}
