/**
 * VideoAssetCard — Single card in the VideoPromptGallery.
 * Shows thumbnail, script excerpt, VO duration, video status badge, and variant count.
 */

import { Film, Clock, Play, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VisualAsset, VideoGenerationStatus } from "./videoGeneration.types";

interface VideoAssetCardProps {
  asset: VisualAsset;
  /** Best status among all generations for this asset */
  bestStatus: VideoGenerationStatus;
  /** Number of completed videos */
  videoCount: number;
  onClick: () => void;
}

const STATUS_CONFIG: Record<VideoGenerationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  not_generated: {
    label: "Pas généré",
    className: "bg-muted text-muted-foreground",
    icon: <Film className="h-3 w-3" />,
  },
  pending: {
    label: "En attente",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    label: "En cours",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "Terminé",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <Play className="h-3 w-3" />,
  },
  error: {
    label: "Erreur",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export default function VideoAssetCard({ asset, bestStatus, videoCount, onClick }: VideoAssetCardProps) {
  const statusCfg = STATUS_CONFIG[bestStatus];
  const hasImage = !!asset.imageUrl;
  const isExternal = asset.source === "external_upload";

  return (
    <button
      onClick={onClick}
      className="group relative w-full rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all duration-200 overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98]"
    >
      {/* Thumbnail */}
      <div className="aspect-video w-full bg-secondary/50 relative overflow-hidden">
        {hasImage ? (
          <img
            src={asset.imageUrl}
            alt={asset.label || "Visual asset"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
          <Badge variant="outline" className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 ${statusCfg.className} backdrop-blur-sm`}>
            <span className="flex items-center gap-0.5 sm:gap-1">
              {statusCfg.icon}
              <span className="hidden sm:inline">{statusCfg.label}</span>
            </span>
          </Badge>
        </div>

        {/* Video count badge */}
        {videoCount > 0 && (
          <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2">
            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-primary/20 text-primary border-primary/30 backdrop-blur-sm">
              <Play className="h-2.5 w-2.5 mr-0.5" />
              {videoCount}
            </Badge>
          </div>
        )}

        {/* External badge */}
        {isExternal && (
          <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 bg-violet-500/15 text-violet-400 border-violet-500/30 backdrop-blur-sm">
              Ext.
            </Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1.5">
        {/* Script excerpt or label */}
        <p className="text-xs text-foreground font-medium leading-snug line-clamp-2 min-h-[2rem]">
          {asset.scriptSentence?.sourceSentence || asset.label || "Sans texte"}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {/* VO duration */}
          {asset.scriptSentence?.voDurationSec != null ? (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {asset.scriptSentence.voDurationSec.toFixed(1)}s
            </span>
          ) : (
            <span className="flex items-center gap-0.5 opacity-50">
              <Clock className="h-2.5 w-2.5" />
              —
            </span>
          )}

          {/* Scene title */}
          {asset.scriptSentence && (
            <span className="truncate max-w-[120px]">
              {asset.scriptSentence.sceneTitle}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
