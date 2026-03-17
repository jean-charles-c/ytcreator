import { useState, useCallback, useRef } from "react";
import {
  Download,
  Trash2,
  RefreshCw,
  Film,
  Settings2,
  Loader2,
  CheckCircle2,
  XCircle,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Timeline } from "./timelineAssembly";
import {
  exportTimelineToMp4,
  abortExport,
  type ExportFps,
  type ExportProgress,
} from "./videoExportEngine";

interface ExportManagerProps {
  timeline: Timeline;
}

const FPS_OPTIONS: { value: ExportFps; label: string }[] = [
  { value: 24, label: "24 fps (cinéma)" },
  { value: 25, label: "25 fps (PAL)" },
  { value: 30, label: "30 fps (NTSC)" },
];

export default function ExportManager({ timeline }: ExportManagerProps) {
  const [fps, setFps] = useState<ExportFps>(24);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportDate, setExportDate] = useState<string | null>(null);
  const abortRef = useRef(false);

  const isExporting = progress !== null && progress.phase !== "done" && progress.phase !== "error";

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    abortExport();
    setProgress({ phase: "error", percent: 0, message: "Export annulé par l'utilisateur." });
    toast.info("Export annulé.");
  }, []);

  const handleExport = useCallback(async () => {
    abortRef.current = false;
    setExportBlob(null);
    setExportDate(null);

    try {
      const blob = await exportTimelineToMp4(timeline, setProgress, { fps });
      if (abortRef.current) return;
      setExportBlob(blob);
      setExportDate(new Date().toLocaleString("fr-FR"));
      toast.success("Export MP4 terminé !");
    } catch (err: any) {
      if (abortRef.current) return;
      console.error("Export error:", err);
      setProgress({ phase: "error", percent: 0, message: err?.message || "Erreur inconnue" });
      toast.error("Échec de l'export vidéo.");
    }
  }, [timeline, fps]);

  const handleDownload = useCallback(() => {
    if (!exportBlob) return;
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportBlob]);

  const handleDelete = useCallback(() => {
    setExportBlob(null);
    setExportDate(null);
    setProgress(null);
    toast.info("Export supprimé.");
  }, []);

  const handleReExport = useCallback(() => {
    handleExport();
  }, [handleExport]);

  const progressPct = progress?.percent ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Film className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Export Manager</span>
      </div>

      <div className="p-4 space-y-4">
        {/* FPS selector */}
        {!isExporting && !exportBlob && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">Framerate :</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FPS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFps(opt.value)}
                  className={`text-xs px-3 py-2 sm:px-2.5 sm:py-1 rounded-md border transition-colors min-h-[44px] sm:min-h-0 ${
                    fps === opt.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Export specs */}
        {!isExporting && !exportBlob && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-muted">MP4 / H.264</span>
            <span className="px-2 py-0.5 rounded bg-muted">1920×1080</span>
            <span className="px-2 py-0.5 rounded bg-muted">AAC 192k</span>
            <span className="px-2 py-0.5 rounded bg-muted">YUV 4:2:0</span>
            <span className="px-2 py-0.5 rounded bg-muted">{timeline.segmentCount} segments</span>
            <span className="px-2 py-0.5 rounded bg-muted">~{Math.round(timeline.totalDuration)}s</span>
          </div>
        )}

        {/* Export button */}
        {!isExporting && !exportBlob && (
          <Button onClick={handleExport} className="w-full gap-2 min-h-[48px] sm:min-h-[36px]">
            <Film className="h-4 w-4" />
            Exporter en MP4
          </Button>
        )}

        {/* Progress */}
        {isExporting && progress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-foreground flex-1">{progress.message}</span>
              <Button variant="destructive" size="sm" onClick={handleAbort} className="gap-1.5 shrink-0">
                <StopCircle className="h-3.5 w-3.5" />
                Stopper
              </Button>
            </div>
            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{progressPct}%</span>
          </div>
        )}

        {/* Error */}
        {progress?.phase === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Erreur d'export</p>
              <p className="text-xs text-muted-foreground mt-0.5">{progress.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReExport} className="gap-1.5 shrink-0">
              <RefreshCw className="h-3 w-3" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Export ready */}
        {exportBlob && progress?.phase === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Export prêt</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(exportBlob.size / (1024 * 1024)).toFixed(1)} MB • {fps} fps • {exportDate}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownload} className="flex-1 gap-2 min-h-[48px] sm:min-h-[36px]">
                <Download className="h-4 w-4" />
                Télécharger
              </Button>
              <Button variant="outline" onClick={handleReExport} className="gap-1.5 min-h-[48px] sm:min-h-[36px]" title="Relancer l'export">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" onClick={handleDelete} className="gap-1.5 text-destructive hover:text-destructive min-h-[48px] sm:min-h-[36px]" title="Supprimer l'export">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
