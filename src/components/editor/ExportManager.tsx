import { useState, useCallback, useRef, useEffect } from "react";
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
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Timeline } from "./timelineAssembly";
import {
  exportTimelineToMp4,
  abortExport,
  type ExportFps,
  type ExportProgress,
} from "./videoExportEngine";

interface ExportManagerProps {
  timeline: Timeline;
  projectId: string;
}

export interface ExportEntry {
  id: string;
  storagePath: string;
  publicUrl: string;
  date: string;
  fps: ExportFps;
  sizeMb: string;
}

const FPS_OPTIONS: { value: ExportFps; label: string }[] = [
  { value: 24, label: "24 fps (cinéma)" },
  { value: 25, label: "25 fps (PAL)" },
  { value: 30, label: "30 fps (NTSC)" },
];

export default function ExportManager({ timeline, projectId }: ExportManagerProps) {
  const [fps, setFps] = useState<ExportFps>(24);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exports, setExports] = useState<ExportEntry[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);
  const abortRef = useRef(false);

  const isExporting = progress !== null && progress.phase !== "done" && progress.phase !== "error";

  // ── Load persisted exports from DB on mount ──
  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      setLoadingExports(true);
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      if (data?.timeline_state) {
        const state = data.timeline_state as any;
        if (Array.isArray(state.exports)) {
          setExports(state.exports);
        }
      }
      setLoadingExports(false);
    };
    load();
  }, [projectId]);

  // ── Save exports metadata to DB ──
  const saveExportsToDB = useCallback(async (entries: ExportEntry[]) => {
    if (!projectId) return;
    // Read current timeline_state and merge exports into it
    const { data } = await supabase
      .from("project_scriptcreator_state")
      .select("timeline_state")
      .eq("project_id", projectId)
      .single();
    const currentState = (data?.timeline_state as any) ?? {};
    await supabase
      .from("project_scriptcreator_state")
      .update({ timeline_state: { ...currentState, exports: entries } as any })
      .eq("project_id", projectId);
  }, [projectId]);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    abortExport();
    setProgress({ phase: "error", percent: 0, message: "Export annulé par l'utilisateur." });
    toast.info("Export annulé.");
  }, []);

  const handleExport = useCallback(async () => {
    abortRef.current = false;

    try {
      const blob = await exportTimelineToMp4(timeline, setProgress, { fps });
      if (abortRef.current) return;

      // Upload to storage
      const fileName = `${projectId}/${Date.now()}_${fps}fps.mp4`;
      const { error: uploadError } = await supabase.storage
        .from("video-exports")
        .upload(fileName, blob, { contentType: "video/mp4" });

      if (uploadError) {
        throw new Error(`Upload échoué: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("video-exports")
        .getPublicUrl(fileName);

      const entry: ExportEntry = {
        id: crypto.randomUUID(),
        storagePath: fileName,
        publicUrl: urlData.publicUrl,
        date: new Date().toLocaleString("fr-FR"),
        fps,
        sizeMb: (blob.size / (1024 * 1024)).toFixed(1),
      };
      const newExports = [entry, ...exports];
      setExports(newExports);
      await saveExportsToDB(newExports);
      toast.success("Export MP4 terminé !");
    } catch (err: any) {
      if (abortRef.current) return;
      console.error("Export error:", err);
      setProgress({ phase: "error", percent: 0, message: err?.message || "Erreur inconnue" });
      toast.error("Échec de l'export vidéo.");
    }
  }, [timeline, fps, projectId, exports, saveExportsToDB]);

  const handleDownload = useCallback((entry: ExportEntry) => {
    const a = document.createElement("a");
    a.href = entry.publicUrl;
    a.download = `export_${entry.fps}fps_${entry.id.slice(0, 8)}.mp4`;
    a.target = "_blank";
    a.click();
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const entry = exports.find((e) => e.id === id);
    if (entry) {
      // Delete from storage
      await supabase.storage.from("video-exports").remove([entry.storagePath]);
    }
    const newExports = exports.filter((e) => e.id !== id);
    setExports(newExports);
    await saveExportsToDB(newExports);
    toast.info("Export supprimé.");
  }, [exports, saveExportsToDB]);

  const progressPct = progress?.percent ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Film className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Export Manager</span>
        {exports.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">{exports.length} export{exports.length > 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* FPS selector */}
        {!isExporting && (
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
        {!isExporting && (
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
        {!isExporting && (
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
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 shrink-0">
              <RefreshCw className="h-3 w-3" />
              Réessayer
            </Button>
          </div>
        )}

        {/* ── Export history ── */}
        {loadingExports && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Chargement des exports…
          </div>
        )}
        {exports.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Exports générés
            </h4>
            {exports.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Export prêt</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.sizeMb} MB • {entry.fps} fps • {entry.date}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleDownload(entry)}
                    className="gap-1.5 h-8"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Télécharger</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(entry.id)}
                    className="gap-1.5 text-destructive hover:text-destructive h-8"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
