/**
 * VideoPromptCard — Card with checkbox for multi-select.
 */

import {
  Camera,
  Clock,
  Copy,
  Trash2,
  Ratio,
  Wind,
  PenLine,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { VideoPrompt } from "./types";

interface VideoPromptCardProps {
  prompt: VideoPrompt;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onCheckChange: (checked: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  "visual-prompts": "VP",
  scene: "Scène",
  shot: "Shot",
  manual: "Manuel",
};

export default function VideoPromptCard({
  prompt,
  isSelected,
  isChecked,
  onClick,
  onCheckChange,
  onDuplicate,
  onDelete,
}: VideoPromptCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded border p-3 transition-colors cursor-pointer group ${
        isSelected
          ? "border-primary bg-primary/5"
          : isChecked
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      {/* Row 1: checkbox + order + scene + badges */}
      <div className="flex items-center gap-2 mb-1.5">
        <Checkbox
          checked={isChecked}
          onCheckedChange={(v) => {
            onCheckChange(!!v);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
          {String(prompt.order).padStart(4, "0")}
        </span>
        <span className="text-xs font-medium text-foreground truncate">
          {prompt.sceneTitle || "Sans titre"}
        </span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {SOURCE_LABELS[prompt.source] ?? prompt.source}
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded ${
              prompt.status === "ready"
                ? "bg-primary/10 text-primary"
                : prompt.status === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {prompt.status}
          </span>
        </span>
      </div>

      {/* Row 2: prompt text */}
      <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed mb-1.5 pl-6">
        {prompt.prompt || "Prompt vide — cliquez pour éditer"}
      </p>

      {/* Row 3: meta chips + actions */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-6">
        <span className="flex items-center gap-0.5">
          <Clock className="h-3 w-3" />
          {prompt.durationSec}s
        </span>
        <span className="flex items-center gap-0.5">
          <Ratio className="h-3 w-3" />
          {prompt.aspectRatio}
        </span>
        <span className="flex items-center gap-0.5">
          <Camera className="h-3 w-3" />
          {prompt.cameraMovement}
        </span>
        {prompt.sceneMotion !== "none" && (
          <span className="flex items-center gap-0.5">
            <Wind className="h-3 w-3" />
            {prompt.sceneMotion}
          </span>
        )}
        {prompt.variantIds.length > 0 && (
          <span className="text-primary">
            +{prompt.variantIds.length} var.
          </span>
        )}

        <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            title="Dupliquer / Variante"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      {/* Row 4: narrative fragment */}
      {prompt.narrativeFragment && (
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 italic line-clamp-1 border-t border-border pt-1.5 pl-6">
          📝 {prompt.narrativeFragment}
        </p>
      )}
    </div>
  );
}
