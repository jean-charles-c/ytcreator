import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";
import { buildManifestTiming, type ManifestTiming } from "./manifestTiming";
import { runQaValidation, type QaReport, type QaIssue } from "./qaValidation";

interface QaPanelProps {
  projectId: string;
  manifest: VisualPromptManifest;
  /** Callback to inform parent whether export is allowed */
  onExportAllowedChange?: (allowed: boolean) => void;
}

const levelConfig = {
  critical: {
    icon: ShieldX,
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    label: "Bloquant",
    row: "bg-destructive/5 border-l-destructive/40",
  },
  warning: {
    icon: ShieldAlert,
    badge: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    label: "Avertissement",
    row: "bg-amber-500/5 border-l-amber-500/40",
  },
};

export default function QaPanel({ projectId, manifest, onExportAllowedChange }: QaPanelProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<QaReport | null>(null);
  const [timing, setTiming] = useState<ManifestTiming | null>(null);

  const runCheck = async () => {
    setLoading(true);

    // Fetch latest VO audio for timing
    const { data: audioFiles } = await supabase
      .from("vo_audio_history")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);

    let builtTiming: ManifestTiming | null = null;
    if (audioFiles && audioFiles.length > 0) {
      const audio = audioFiles[0];
      const timepoints = (audio.shot_timepoints as unknown as ShotTimepoint[] | null) ?? null;
      const duration = audio.duration_estimate ?? 0;
      builtTiming = buildManifestTiming(manifest, timepoints, duration);
    }

    setTiming(builtTiming);
    const qa = runQaValidation(manifest, builtTiming);
    setReport(qa);
    onExportAllowedChange?.(qa.exportAllowed);
    setLoading(false);
  };

  useEffect(() => {
    runCheck();
  }, [projectId, manifest]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Validation en cours…</span>
      </div>
    );
  }

  if (!report) return null;

  const StatusIcon = report.criticalCount > 0 ? ShieldX : report.warningCount > 0 ? ShieldAlert : ShieldCheck;
  const statusColor = report.criticalCount > 0 ? "text-destructive" : report.warningCount > 0 ? "text-amber-500" : "text-emerald-500";
  const statusLabel = report.criticalCount > 0
    ? `${report.criticalCount} erreur(s) bloquante(s)`
    : report.warningCount > 0
      ? `${report.warningCount} avertissement(s)`
      : "Aucun problème détecté";

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-1.5 ${statusColor}`}>
          <StatusIcon className="h-4 w-4" />
          <span className="text-xs font-semibold">{statusLabel}</span>
        </div>
        {report.exportAllowed ? (
          <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
            Export autorisé
          </span>
        ) : (
          <span className="text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2 py-0.5">
            Export bloqué
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={runCheck} className="ml-auto h-6 px-2 text-[10px] gap-1">
          <RefreshCw className="h-3 w-3" /> Relancer
        </Button>
      </div>

      {/* Issues list */}
      {report.issues.length > 0 && (
        <div className="rounded border border-border bg-secondary/30 p-2 space-y-1 max-h-48 overflow-y-auto">
          {report.issues.map((issue, i) => {
            const cfg = levelConfig[issue.level];
            return (
              <div
                key={i}
                className={`flex items-start gap-2 text-[10px] pl-2 border-l-2 py-0.5 ${cfg.row}`}
              >
                <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 font-medium border text-[9px] ${cfg.badge}`}>
                  {cfg.label}
                </span>
                <span className="text-muted-foreground">
                  {issue.category === "structure" ? "Structure" : "Timing"}
                  {issue.sceneOrder != null && ` • S${issue.sceneOrder}`}
                  {issue.shotOrder != null && ` • Shot ${issue.shotOrder}`}
                </span>
                <span className="text-foreground">{issue.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Debug timing table */}
      {timing && timing.entries.length > 0 && (
        <details className="rounded border border-border bg-card">
          <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors px-3 py-2">
            Debug Timing — {timing.entries.length} segments
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="px-2 py-1 text-left font-medium">#</th>
                  <th className="px-2 py-1 text-left font-medium">Scène</th>
                  <th className="px-2 py-1 text-left font-medium">Texte source</th>
                  <th className="px-2 py-1 text-right font-medium">Start</th>
                  <th className="px-2 py-1 text-right font-medium">Durée</th>
                  <th className="px-2 py-1 text-center font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {timing.entries.map((entry, i) => {
                  const hasIssue = timing.issues.some((iss) => iss.shotId === entry.shotId);
                  return (
                    <tr
                      key={entry.shotId}
                      className={`border-t border-border ${hasIssue ? "bg-destructive/5" : i % 2 === 0 ? "bg-card" : "bg-secondary/20"}`}
                    >
                      <td className="px-2 py-1 font-mono text-muted-foreground">{entry.order}</td>
                      <td className="px-2 py-1 text-muted-foreground">S{entry.sceneOrder}</td>
                      <td className="px-2 py-1 text-foreground max-w-[250px] truncate" title={entry.fragmentText}>
                        {entry.fragmentText.length > 50 ? entry.fragmentText.slice(0, 50) + "…" : entry.fragmentText}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{entry.start.toFixed(2)}s</td>
                      <td className="px-2 py-1 text-right font-mono">{entry.duration.toFixed(2)}s</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`inline-flex rounded px-1 py-0.5 text-[9px] font-medium border ${
                          entry.source === "timepoint"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : entry.source === "proportional"
                            ? "bg-accent text-accent-foreground border-border"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}>
                          {entry.source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
