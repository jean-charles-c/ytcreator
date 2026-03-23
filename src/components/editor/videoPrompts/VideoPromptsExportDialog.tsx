/**
 * VideoPromptsExportDialog — Export video prompts as structured text or JSON.
 */

import { useState } from "react";
import {
  Download,
  FileJson,
  FileText,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { VideoPrompt } from "./types";
import { getPromptWarnings, getReadinessLabel } from "./readiness";

type ExportFormat = "json" | "text";

interface VideoPromptsExportDialogProps {
  prompts: VideoPrompt[];
  open: boolean;
  onClose: () => void;
}

function buildStructuredText(prompts: VideoPrompt[]): string {
  return prompts
    .map((p, i) => {
      const lines: string[] = [];
      lines.push(`═══ Prompt #${String(p.order).padStart(4, "0")} ═══`);
      if (p.sceneTitle) lines.push(`Scene: ${p.sceneTitle}`);
      lines.push(`Source: ${p.source} | Readiness: ${getReadinessLabel(p)}`);
      lines.push("");
      lines.push(`[Prompt]`);
      lines.push(p.prompt || "(vide)");
      if (p.negativePrompt) {
        lines.push("");
        lines.push(`[Negative]`);
        lines.push(p.negativePrompt);
      }
      lines.push("");
      lines.push(`[Paramètres]`);
      lines.push(`Durée: ${p.durationSec}s | Ratio: ${p.aspectRatio} | Style: ${p.style || "—"}`);
      lines.push(`Caméra: ${p.cameraMovement} | Mouvement: ${p.sceneMotion} | Ambiance: ${p.mood || "—"}`);
      if (p.renderConstraints) lines.push(`Contraintes: ${p.renderConstraints}`);
      if (p.narrativeFragment) {
        lines.push("");
        lines.push(`[Fragment narratif]`);
        lines.push(p.narrativeFragment);
      }
      const warnings = getPromptWarnings(p);
      if (warnings.length > 0) {
        lines.push("");
        lines.push(`[⚠ Warnings]`);
        warnings.forEach((w) => lines.push(`- ${w}`));
      }
      if (i < prompts.length - 1) lines.push("", "");
      return lines.join("\n");
    })
    .join("\n");
}

function buildExportJson(prompts: VideoPrompt[]) {
  return prompts.map((p) => ({
    id: p.id,
    order: p.order,
    source: p.source,
    status: p.status,
    sceneTitle: p.sceneTitle,
    prompt: p.prompt,
    negativePrompt: p.negativePrompt,
    narrativeFragment: p.narrativeFragment,
    durationSec: p.durationSec,
    aspectRatio: p.aspectRatio,
    style: p.style,
    cameraMovement: p.cameraMovement,
    sceneMotion: p.sceneMotion,
    mood: p.mood,
    renderConstraints: p.renderConstraints,
    isManuallyEdited: p.isManuallyEdited,
    readiness: getReadinessLabel(p),
    warnings: getPromptWarnings(p),
  }));
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VideoPromptsExportDialog({ prompts, open, onClose }: VideoPromptsExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("json");

  const warningCount = prompts.filter((p) => getPromptWarnings(p).length > 0).length;

  const handleExport = () => {
    if (prompts.length === 0) {
      toast.error("Aucun prompt à exporter");
      return;
    }
    const ts = Date.now();
    if (format === "json") {
      const data = buildExportJson(prompts);
      downloadFile(JSON.stringify(data, null, 2), `video-prompts-${ts}.json`, "application/json");
    } else {
      const text = buildStructuredText(prompts);
      downloadFile(text, `video-prompts-${ts}.txt`, "text/plain");
    }
    toast.success(`${prompts.length} prompt(s) exporté(s) en ${format.toUpperCase()}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Exporter les prompts vidéo
          </DialogTitle>
          <DialogDescription>
            {prompts.length} prompt{prompts.length > 1 ? "s" : ""} sélectionné{prompts.length > 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        {warningCount > 0 && (
          <div className="flex items-center gap-2 text-xs bg-destructive/10 text-destructive rounded px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {warningCount} prompt{warningCount > 1 ? "s" : ""} incomplet{warningCount > 1 ? "s" : ""}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant={format === "json" ? "default" : "outline"}
            size="sm"
            onClick={() => setFormat("json")}
            className="flex-1"
          >
            <FileJson className="h-4 w-4" />
            JSON
          </Button>
          <Button
            variant={format === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setFormat("text")}
            className="flex-1"
          >
            <FileText className="h-4 w-4" />
            Texte structuré
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {format === "json"
            ? "Export JSON exploitable par le backend Remotion ou un pipeline externe."
            : "Export lisible avec structure par prompt, paramètres et warnings."}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button variant="default" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Exporter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
