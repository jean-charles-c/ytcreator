/**
 * VideoSourceModal — Full-size modal for a gallery visual asset.
 *
 * Layout:
 *  - Top: Large image + script context (sentence, scene, VO duration, origin badge)
 *  - Middle: VideoGenerationPanel (Prompt 6)
 *  - Bottom: Tabs for Variants and History (Prompt 7)
 */

import { useState } from "react";
import {
  Clock,
  Film,
  Camera,
  ImageIcon,
  Layers,
  Play,
  History,
  Sparkles,
} from "lucide-react";
import type { VisualAsset, VideoGeneration } from "./videoGeneration.types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import VideoGenerationPanel from "./VideoGenerationPanel";
import VideoVariantGrid from "./VideoVariantGrid";
import VideoGenerationTimeline from "./VideoGenerationTimeline";

interface VideoSourceModalProps {
  asset: VisualAsset | null;
  generations: VideoGeneration[];
  open: boolean;
  onClose: () => void;
  onGenerationCreated?: (gen: VideoGeneration) => void;
  onGenerationDeleted?: (id: string) => void;
}

export default function VideoSourceModal({
  asset,
  generations,
  open,
  onClose,
  onGenerationCreated,
  onGenerationDeleted,
}: VideoSourceModalProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "variants" | "history">("generate");

  if (!asset) return null;

  const isExternal = asset.source === "external_upload";
  const sentence = asset.scriptSentence;
  const completedVideos = generations.filter((g) => g.status === "completed");
  const hasVideos = completedVideos.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[98vw] sm:w-[95vw] max-h-[95vh] sm:max-h-[90vh] p-0 gap-0 bg-card border-border overflow-hidden">
        {/* ── Header ──────────────────────────────────────────────── */}
        <DialogHeader className="px-3 sm:px-5 pt-3 sm:pt-4 pb-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-display text-sm sm:text-base font-semibold text-foreground flex items-center gap-2 min-w-0">
              <Film className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">
                {isExternal ? "Image externe" : `Shot ${sentence?.shotOrder ?? "—"}`}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                variant="outline"
                className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 ${
                  isExternal
                    ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                    : "bg-primary/10 text-primary border-primary/30"
                }`}
              >
                {isExternal ? "Externe" : "Script"}
              </Badge>
              {hasVideos && (
                <Badge
                  variant="outline"
                  className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                >
                  <Play className="h-2.5 w-2.5 mr-0.5" />
                  {completedVideos.length}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-50px)] sm:max-h-[calc(90vh-60px)]">
          <div className="px-3 sm:px-5 pb-4 sm:pb-5">
            {/* ── Top zone: Image + Script context ────────────────── */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 sm:gap-4">
              {/* Large image */}
              <div className="rounded-lg overflow-hidden border border-border bg-secondary/30">
                {asset.imageUrl ? (
                  <img
                    src={asset.imageUrl}
                    alt={asset.label || "Visual asset"}
                    className="w-full h-auto max-h-[250px] sm:max-h-[400px] object-contain bg-black/20"
                  />
                ) : (
                  <div className="aspect-video flex items-center justify-center">
                    <ImageIcon className="h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Script context */}
              <div className="flex flex-col gap-3">
                {/* Script sentence */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Phrase du script
                  </label>
                  <div className="rounded-md bg-secondary/50 border border-border p-3">
                    <p className="text-sm text-foreground leading-relaxed">
                      {sentence?.sourceSentence || asset.label || "Aucun texte associé"}
                    </p>
                    {sentence?.sourceSentenceFr && (
                      <p className="text-xs text-muted-foreground mt-2 italic leading-relaxed">
                        {sentence.sourceSentenceFr}
                      </p>
                    )}
                  </div>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Scene */}
                  {sentence && (
                    <div className="rounded-md bg-secondary/30 border border-border p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                        <Layers className="h-3 w-3" />
                        Scène
                      </div>
                      <p className="text-xs text-foreground font-medium truncate">
                        {sentence.sceneTitle}
                      </p>
                    </div>
                  )}

                  {/* VO Duration */}
                  <div className="rounded-md bg-secondary/30 border border-border p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      Durée VO
                    </div>
                    <p className="text-xs text-foreground font-medium">
                      {sentence?.voDurationSec != null
                        ? `${sentence.voDurationSec.toFixed(1)}s`
                        : "Non disponible"}
                    </p>
                  </div>

                  {/* Shot order */}
                  {sentence && (
                    <div className="rounded-md bg-secondary/30 border border-border p-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                        <Camera className="h-3 w-3" />
                        Shot
                      </div>
                      <p className="text-xs text-foreground font-medium">
                        #{sentence.shotOrder}
                      </p>
                    </div>
                  )}

                  {/* Total generations */}
                  <div className="rounded-md bg-secondary/30 border border-border p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                      <Film className="h-3 w-3" />
                      Générations
                    </div>
                    <p className="text-xs text-foreground font-medium">
                      {generations.length} tentative{generations.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* External label */}
                {isExternal && asset.label && (
                  <div className="rounded-md bg-violet-500/5 border border-violet-500/20 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-violet-400 mb-1">
                      <ImageIcon className="h-3 w-3" />
                      Description
                    </div>
                    <p className="text-xs text-foreground">{asset.label}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            {/* ── Work zone: Tabs ─────────────────────────────────── */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="w-full grid grid-cols-3 bg-secondary/50 h-9 sm:h-10">
                <TabsTrigger value="generate" className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-1 sm:px-3" title="Lancer une nouvelle génération vidéo depuis ce visuel">
                  <Sparkles className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  <span className="hidden xs:inline">Générer</span>
                  <span className="xs:hidden">Gen.</span>
                </TabsTrigger>

                <TabsTrigger value="variants" className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-1 sm:px-3" title="Consulter et comparer les vidéos terminées">
                  <Play className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  <span className="hidden xs:inline">Variantes</span>
                  <span className="xs:hidden">Var.</span>
                  {hasVideos && (
                    <Badge variant="secondary" className="ml-0.5 sm:ml-1 text-[8px] sm:text-[9px] px-1 py-0 h-3.5 sm:h-4">
                      {completedVideos.length}
                    </Badge>
                  )}
                </TabsTrigger>

                <TabsTrigger value="history" className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-1 sm:px-3" title="Historique chronologique de toutes les tentatives">
                  <History className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  <span className="hidden xs:inline">Historique</span>
                  <span className="xs:hidden">Hist.</span>
                  {generations.length > 0 && (
                    <Badge variant="secondary" className="ml-0.5 sm:ml-1 text-[8px] sm:text-[9px] px-1 py-0 h-3.5 sm:h-4">
                      {generations.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Generate tab — VideoGenerationPanel placeholder (Prompt 6) */}
              <TabsContent value="generate" className="mt-3">
                {asset && (
                  <VideoGenerationPanel
                    asset={asset}
                    projectId={asset.projectId}
                    onGenerationCreated={(gen) => onGenerationCreated?.(gen)}
                  />
                )}
              </TabsContent>

              {/* Variants tab */}
              <TabsContent value="variants" className="mt-3">
                <VideoVariantGrid
                  generations={generations}
                  onDeleted={(id) => onGenerationDeleted?.(id)}
                />
              </TabsContent>

              {/* History tab */}
              <TabsContent value="history" className="mt-3">
                <VideoGenerationTimeline
                  generations={generations}
                  onDeleted={(id) => onGenerationDeleted?.(id)}
                />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
