/**
 * VideoPromptEditor — Right panel for detailed editing of a selected prompt.
 */

import {
  Camera,
  Clock,
  Ratio,
  Wind,
  Palette,
  Sparkles,
  FileText,
  Settings2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { VideoPrompt, AspectRatio, CameraMovement, SceneMotion } from "./types";

interface VideoPromptEditorProps {
  prompt: VideoPrompt;
  onUpdate: (patch: Partial<VideoPrompt>) => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "21:9"];

const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: "static", label: "Statique" },
  { value: "pan-left", label: "Pan gauche" },
  { value: "pan-right", label: "Pan droite" },
  { value: "tilt-up", label: "Tilt haut" },
  { value: "tilt-down", label: "Tilt bas" },
  { value: "zoom-in", label: "Zoom in" },
  { value: "zoom-out", label: "Zoom out" },
  { value: "dolly-in", label: "Dolly in" },
  { value: "dolly-out", label: "Dolly out" },
  { value: "orbit", label: "Orbite" },
  { value: "tracking", label: "Tracking" },
  { value: "crane", label: "Grue" },
  { value: "handheld", label: "Caméra épaule" },
];

const SCENE_MOTIONS: { value: SceneMotion; label: string }[] = [
  { value: "none", label: "Aucun" },
  { value: "slow", label: "Lent" },
  { value: "moderate", label: "Modéré" },
  { value: "fast", label: "Rapide" },
  { value: "dynamic", label: "Dynamique" },
];

export default function VideoPromptEditor({ prompt, onUpdate }: VideoPromptEditorProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Éditeur</h3>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            #{String(prompt.order).padStart(4, "0")}
          </span>
        </div>
        {prompt.sceneTitle && (
          <p className="text-[11px] text-muted-foreground truncate">{prompt.sceneTitle}</p>
        )}
      </div>

      <div className="p-3 space-y-4">
        {/* Narrative fragment (read-only context) */}
        {prompt.narrativeFragment && (
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <FileText className="h-3 w-3" />
              Fragment narratif
            </Label>
            <p className="text-xs text-foreground/70 bg-secondary/50 rounded p-2 italic leading-relaxed">
              {prompt.narrativeFragment}
            </p>
          </div>
        )}

        {/* Main prompt */}
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
            <Sparkles className="h-3 w-3" />
            Prompt vidéo
          </Label>
          <Textarea
            value={prompt.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder="Décrivez la séquence vidéo souhaitée..."
            className="text-xs min-h-[80px] resize-y"
          />
        </div>

        {/* Negative prompt */}
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Negative prompt</Label>
          <Textarea
            value={prompt.negativePrompt}
            onChange={(e) => onUpdate({ negativePrompt: e.target.value })}
            placeholder="Éléments à éviter..."
            className="text-xs min-h-[48px] resize-y"
          />
        </div>

        {/* Parameters grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Duration */}
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Clock className="h-3 w-3" />
              Durée (sec)
            </Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={prompt.durationSec}
              onChange={(e) => onUpdate({ durationSec: Number(e.target.value) || 5 })}
              className="h-8 text-xs"
            />
          </div>

          {/* Aspect ratio */}
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Ratio className="h-3 w-3" />
              Ratio
            </Label>
            <Select
              value={prompt.aspectRatio}
              onValueChange={(v) => onUpdate({ aspectRatio: v as AspectRatio })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Camera movement */}
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Camera className="h-3 w-3" />
              Caméra
            </Label>
            <Select
              value={prompt.cameraMovement}
              onValueChange={(v) => onUpdate({ cameraMovement: v as CameraMovement })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_MOVEMENTS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scene motion */}
          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Wind className="h-3 w-3" />
              Mouvement
            </Label>
            <Select
              value={prompt.sceneMotion}
              onValueChange={(v) => onUpdate({ sceneMotion: v as SceneMotion })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENE_MOTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Style */}
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
            <Palette className="h-3 w-3" />
            Style visuel
          </Label>
          <Input
            value={prompt.style}
            onChange={(e) => onUpdate({ style: e.target.value })}
            placeholder="cinematic, anime, watercolor..."
            className="h-8 text-xs"
          />
        </div>

        {/* Mood */}
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Ambiance</Label>
          <Input
            value={prompt.mood}
            onChange={(e) => onUpdate({ mood: e.target.value })}
            placeholder="mysterious, epic, serene..."
            className="h-8 text-xs"
          />
        </div>

        {/* Render constraints */}
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Contraintes de rendu</Label>
          <Input
            value={prompt.renderConstraints}
            onChange={(e) => onUpdate({ renderConstraints: e.target.value })}
            placeholder="high quality, 4K, no text..."
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
