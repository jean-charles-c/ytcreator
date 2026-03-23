/**
 * VideoPromptEditor — Right panel for detailed editing with local actions.
 */

import { useState, useEffect, useRef } from "react";
import {
  Camera,
  Clock,
  Ratio,
  Wind,
  Palette,
  Sparkles,
  FileText,
  Settings2,
  Save,
  Undo2,
  Copy,
  Trash2,
  RotateCcw,
  Clipboard,
  Globe,
  PenLine,
  Send,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { VideoPrompt, AspectRatio, CameraMovement, SceneMotion } from "./types";
import { getReadinessLabel, getReadinessColor, getPromptWarnings } from "./readiness";

interface VideoPromptEditorProps {
  prompt: VideoPrompt;
  onUpdate: (patch: Partial<VideoPrompt>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRender?: () => void;
  renderSubmitting?: boolean;
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

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
];

export default function VideoPromptEditor({
  prompt,
  onUpdate,
  onDuplicate,
  onDelete,
  onRender,
  renderSubmitting,
}: VideoPromptEditorProps) {
  // Track "dirty" state by comparing with snapshot at selection time
  const snapshotRef = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    snapshotRef.current = JSON.stringify(prompt);
    setIsDirty(false);
  }, [prompt.id]);

  const markDirty = (patch: Partial<VideoPrompt>) => {
    onUpdate(patch);
    setIsDirty(true);
  };

  const handleRevert = () => {
    try {
      const original = JSON.parse(snapshotRef.current) as VideoPrompt;
      onUpdate({
        prompt: original.prompt,
        negativePrompt: original.negativePrompt,
        durationSec: original.durationSec,
        aspectRatio: original.aspectRatio,
        style: original.style,
        cameraMovement: original.cameraMovement,
        sceneMotion: original.sceneMotion,
        mood: original.mood,
        renderConstraints: original.renderConstraints,
      });
      setIsDirty(false);
      toast.info("Modifications annulées");
    } catch { /* ignore */ }
  };

  const handleMarkReady = () => {
    onUpdate({ status: "ready" });
    setIsDirty(false);
    snapshotRef.current = JSON.stringify({ ...prompt, status: "ready" });
    toast.success("Prompt marqué prêt");
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt.prompt);
    toast.success("Prompt copié");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with actions */}
      <div className="p-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Éditeur</h3>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            #{String(prompt.order).padStart(4, "0")}
          </span>
        </div>
        {prompt.sceneTitle && (
          <p className="text-[11px] text-muted-foreground truncate mb-2">{prompt.sceneTitle}</p>
        )}

        {/* Local action buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant={isDirty ? "default" : "outline"}
            size="sm"
            onClick={handleMarkReady}
            className="h-7 text-[11px] px-2"
          >
            <Save className="h-3 w-3" />
            {isDirty ? "Valider" : "Prêt"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={!isDirty}
            className="h-7 text-[11px] px-2"
          >
            <Undo2 className="h-3 w-3" />
            Annuler
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPrompt}
            className="h-7 text-[11px] px-2"
          >
            <Clipboard className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
            className="h-7 text-[11px] px-2"
          >
            <Copy className="h-3 w-3" />
          </Button>
          {onRender && (
            <Button
              variant="default"
              size="sm"
              onClick={onRender}
              disabled={renderSubmitting || isDirty}
              className="h-7 text-[11px] px-2"
              title={isDirty ? "Validez d'abord vos modifications" : "Envoyer au rendu"}
            >
              {renderSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Rendu
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="h-7 text-[11px] px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          {isDirty && (
            <span className="ml-auto text-[9px] text-primary flex items-center gap-0.5">
              <PenLine className="h-2.5 w-2.5" />
              modifié
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
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
            onChange={(e) => markDirty({ prompt: e.target.value })}
            placeholder="Décrivez la séquence vidéo souhaitée..."
            className="text-xs min-h-[80px] resize-y"
          />
        </div>

        {/* Negative prompt */}
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Negative prompt</Label>
          <Textarea
            value={prompt.negativePrompt}
            onChange={(e) => markDirty({ negativePrompt: e.target.value })}
            placeholder="Éléments à éviter..."
            className="text-xs min-h-[48px] resize-y"
          />
        </div>

        <Separator />

        {/* Parameters grid */}
        <div className="grid grid-cols-2 gap-3">
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
              onChange={(e) => markDirty({ durationSec: Number(e.target.value) || 5 })}
              className="h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Ratio className="h-3 w-3" />
              Ratio
            </Label>
            <Select value={prompt.aspectRatio} onValueChange={(v) => markDirty({ aspectRatio: v as AspectRatio })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Camera className="h-3 w-3" />
              Caméra
            </Label>
            <Select value={prompt.cameraMovement} onValueChange={(v) => markDirty({ cameraMovement: v as CameraMovement })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CAMERA_MOVEMENTS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Wind className="h-3 w-3" />
              Mouvement
            </Label>
            <Select value={prompt.sceneMotion} onValueChange={(v) => markDirty({ sceneMotion: v as SceneMotion })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENE_MOTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Globe className="h-3 w-3" />
              Langue
            </Label>
            <Select value="en" onValueChange={() => {}}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Style / Mood / Constraints */}
        <div>
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
            <Palette className="h-3 w-3" />
            Style visuel
          </Label>
          <Input
            value={prompt.style}
            onChange={(e) => markDirty({ style: e.target.value })}
            placeholder="cinematic, anime, watercolor..."
            className="h-8 text-xs"
          />
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Ambiance</Label>
          <Input
            value={prompt.mood}
            onChange={(e) => markDirty({ mood: e.target.value })}
            placeholder="mysterious, epic, serene..."
            className="h-8 text-xs"
          />
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground mb-1">Contraintes de rendu</Label>
          <Input
            value={prompt.renderConstraints}
            onChange={(e) => markDirty({ renderConstraints: e.target.value })}
            placeholder="high quality, 4K, no text..."
            className="h-8 text-xs"
          />
        </div>

        {/* Warnings */}
        {(() => {
          const warnings = getPromptWarnings(prompt);
          if (warnings.length === 0) return null;
          return (
            <div className="rounded bg-destructive/10 px-2.5 py-2 space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-destructive flex items-center gap-1">
                  ⚠ {w}
                </p>
              ))}
            </div>
          );
        })()}

        {/* Status info */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Source: {prompt.source}</span>
            <span className={`px-1.5 py-0.5 rounded ${getReadinessColor(prompt)}`}>
              {getReadinessLabel(prompt)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>Créé: {new Date(prompt.createdAt).toLocaleDateString("fr-FR")}</span>
            <span>Modifié: {new Date(prompt.updatedAt).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
