import { useState, useCallback, useEffect, useRef } from "react";
import {
  Download,
  Trash2,
  RefreshCw,
  Film,
  FileCode2,
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
import type { ExportFps, ExportProgress } from "./videoExportEngine";
import { useBackgroundTasks } from "@/contexts/BackgroundTasks";

interface ExportManagerProps {
  timeline: Timeline;
  projectId: string;
}

export interface ExportEntry {
  id: string;
  type: "mp4" | "xml";
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
  const [exports, setExports] = useState<ExportEntry[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  // Always use the freshest timeline via ref to avoid stale closures
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const { startExportMp4, startExportXml, getTask, stopTask, subscribe } = useBackgroundTasks();

  const mp4Task = getTask(projectId, "export-mp4");
  const xmlTask = getTask(projectId, "export-xml");
  const isMp4Exporting = mp4Task?.status === "running";
  const isXmlExporting = xmlTask?.status === "running";
  const isAnyExporting = isMp4Exporting || isXmlExporting;

  // ── Load persisted exports from DB ──
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

  // ── Listen for export completion to refresh list ──
  useEffect(() => {
    const unsub1 = subscribe(projectId, "export-mp4", (task) => {
      if (task.status === "done") refreshExports();
    });
    const unsub2 = subscribe(projectId, "export-xml", (task) => {
      if (task.status === "done") refreshExports();
    });
    return () => { unsub1(); unsub2(); };
  }, [projectId, subscribe]);

  const refreshExports = async () => {
    const { data } = await supabase
      .from("project_scriptcreator_state")
      .select("timeline_state")
      .eq("project_id", projectId)
      .single();
    if (data?.timeline_state) {
      const state = data.timeline_state as any;
      if (Array.isArray(state.exports)) setExports(state.exports);
    }
  };

  const handleExportMp4 = useCallback(() => {
    startExportMp4({ projectId, timeline: timelineRef.current, fps });
  }, [projectId, fps, startExportMp4]);

  const handleExportXml = useCallback(() => {
    startExportXml({ projectId, timeline: timelineRef.current, fps });
  }, [projectId, fps, startExportXml]);

  const handleAbortMp4 = useCallback(() => {
    stopTask(projectId, "export-mp4");
    toast.info("Export MP4 annulé.");
  }, [projectId, stopTask]);

  const handleAbortXml = useCallback(() => {
    stopTask(projectId, "export-xml");
    toast.info("Export XML annulé.");
  }, [projectId, stopTask]);

  const handleDownload = useCallback((entry: ExportEntry) => {
    // Use the public URL directly — programmatic blob downloads are blocked in sandboxed iframes
    window.open(entry.publicUrl, "_blank");
    toast.success("Téléchargement lancé dans un nouvel onglet !");
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const entry = exports.find((e) => e.id === id);
    if (entry) {
      await supabase.storage.from("video-exports").remove([entry.storagePath]);
    }
    const newExports = exports.filter((e) => e.id !== id);
    setExports(newExports);
    // Persist
    const { data } = await supabase
      .from("project_scriptcreator_state")
      .select("timeline_state")
      .eq("project_id", projectId)
      .single();
    const currentState = (data?.timeline_state as any) ?? {};
    await supabase
      .from("project_scriptcreator_state")
      .update({ timeline_state: { ...currentState, exports: newExports } as any })
      .eq("project_id", projectId);
    toast.info("Export supprimé.");
  }, [exports, projectId]);

  const renderProgress = (label: string, progress: ExportProgress | undefined, onAbort: () => void) => {
    if (!progress) return null;
    const pct = progress.percent ?? 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-foreground flex-1">{label}: {progress.message}</span>
          <Button variant="destructive" size="sm" onClick={onAbort} className="gap-1.5 shrink-0">
            <StopCircle className="h-3.5 w-3.5" />
            Stopper
          </Button>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{pct}%</span>
      </div>
    );
  };

  const renderError = (label: string, progress: ExportProgress | undefined, onRetry: () => void) => {
    if (!progress || progress.phase !== "error") return null;
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <XCircle className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">Erreur {label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{progress.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 shrink-0">
          <RefreshCw className="h-3 w-3" />
          Réessayer
        </Button>
      </div>
    );
  };

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
        {!isAnyExporting && (
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
        {!isAnyExporting && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-muted">1920×1080</span>
            <span className="px-2 py-0.5 rounded bg-muted">{timeline.segmentCount} segments</span>
            <span className="px-2 py-0.5 rounded bg-muted">~{Math.round(timeline.totalDuration)}s</span>
          </div>
        )}

        {/* Export buttons */}
        {!isAnyExporting && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleExportMp4} className="flex-1 gap-2 min-h-[48px] sm:min-h-[36px]">
              <Film className="h-4 w-4" />
              Exporter MP4
              <span className="text-[10px] opacity-70 ml-1">H.264 / AAC</span>
            </Button>
            <Button onClick={handleExportXml} variant="outline" className="flex-1 gap-2 min-h-[48px] sm:min-h-[36px]">
              <FileCode2 className="h-4 w-4" />
              Exporter XML + Médias
              <span className="text-[10px] opacity-70 ml-1">ZIP</span>
            </Button>
          </div>
        )}

        {/* MP4 Progress */}
        {isMp4Exporting && renderProgress("MP4", mp4Task?.exportProgress, handleAbortMp4)}
        {mp4Task?.status === "error" && renderError("MP4", mp4Task?.exportProgress, handleExportMp4)}

        {/* XML Progress */}
        {isXmlExporting && renderProgress("XML", xmlTask?.exportProgress, handleAbortXml)}
        {xmlTask?.status === "error" && renderError("XML", xmlTask?.exportProgress, handleExportXml)}

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
                {entry.type === "xml" ? (
                  <FileCode2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {entry.type === "xml" ? "XML + Médias (ZIP)" : "MP4"} prêt
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.sizeMb} MB • {entry.fps} fps • {entry.date}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" onClick={() => handleDownload(entry)} disabled={downloadingIds.has(entry.id)} className="gap-1.5 h-8">
                    {downloadingIds.has(entry.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {downloadingIds.has(entry.id) ? "Téléchargement…" : "Télécharger"}
                    </span>
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
