import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";
import { buildManifestTiming, type ManifestTiming } from "./manifestTiming";
import { runQaValidation, type QaReport, type QaCategory } from "./qaValidation";

interface QaPanelProps {
  projectId: string;
  manifest: VisualPromptManifest;
  onExportAllowedChange?: (allowed: boolean) => void;
  onReportChange?: (counts: { errors: number; warnings: number; issues: { level: string; sceneOrder?: number; shotOrder?: number }[] }) => void;
}

const categoryLabels: Record<QaCategory, string> = {
  structure: "Structure",
  timing: "Timing",
  allocation: "Allocation",
  redundancy: "Redondance",
  length: "Longueur",
};

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

export default function QaPanel({ projectId, manifest, onExportAllowedChange, onReportChange }: QaPanelProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<QaReport | null>(null);
  const [timing, setTiming] = useState<ManifestTiming | null>(null);

  const runCheck = async () => {
    setLoading(true);

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
    onReportChange?.({ errors: qa.criticalCount, warnings: qa.warningCount, issues: qa.issues });
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

  // Group issues by category
  const groupedIssues = report.issues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {} as Record<string, typeof report.issues>);

  // Separate critical vs warning
  const criticalIssues = report.issues.filter(i => i.level === "critical");
  const warningIssues = report.issues.filter(i => i.level === "warning");

  // Group criticals by scene for clarity
  const criticalsByScene = criticalIssues.reduce((acc, issue) => {
    const key = issue.sceneOrder != null ? `Scène ${issue.sceneOrder}` : "Général";
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {} as Record<string, typeof criticalIssues>);

  const renderIssueRow = (issue: typeof report.issues[0], i: number) => {
    const cfg = levelConfig[issue.level];
    return (
      <div
        key={i}
        className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-[10px] pl-2 border-l-2 py-1.5 sm:py-1 ${cfg.row}`}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium border text-[9px] ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-muted-foreground font-medium">
            {issue.sceneOrder != null && `S${issue.sceneOrder}`}
            {issue.shotOrder != null && issue.shotOrder > 0 && ` • Shot ${issue.shotOrder}`}
          </span>
        </div>
        <span className="text-foreground break-words">{issue.message}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className={`flex items-center gap-1.5 ${statusColor}`}>
          <StatusIcon className="h-4 w-4" />
          <span className="text-xs font-semibold">{statusLabel}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {report.exportAllowed ? (
            <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              Export autorisé
            </span>
          ) : (
            <span className="text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2 py-0.5">
              Export bloqué
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={runCheck} className="h-8 sm:h-6 px-2 text-[10px] gap-1 min-h-[44px] sm:min-h-0 ml-auto sm:ml-0">
            <RefreshCw className="h-3 w-3" /> Relancer
          </Button>
          {report.warningCount > 0 && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              {report.warningCount} avertissement{report.warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {report.criticalCount > 0 && report.issues.some((i) => i.category === "timing") && (
          <p className="text-[10px] text-muted-foreground bg-secondary/50 border border-border rounded px-2 py-1.5 leading-relaxed">
            💡 <strong>Pour corriger :</strong> re-générez les shots de la scène concernée, puis dans Voice Over cliquez sur « Coller le script généré », puis relancez la voix off.
          </p>
        )}
      </div>

      {/* CRITICAL ISSUES — always visible, open, detailed */}
      {criticalIssues.length > 0 && (
        <div className="rounded border-2 border-destructive/40 bg-destructive/5 overflow-hidden">
          <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
            <ShieldX className="h-4 w-4 text-destructive" />
            <span className="text-xs font-bold text-destructive">
              {criticalIssues.length} erreur{criticalIssues.length > 1 ? "s" : ""} bloquante{criticalIssues.length > 1 ? "s" : ""} — Export impossible
            </span>
          </div>
          <div className="p-2 space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(criticalsByScene).map(([sceneLabel, issues]) => (
              <div key={sceneLabel} className="space-y-1">
                <div className="text-[10px] font-bold text-destructive/80 uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                  {sceneLabel} — {issues.length} erreur{issues.length > 1 ? "s" : ""}
                </div>
                {issues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-[11px] pl-3 border-l-2 border-l-destructive/40 py-1.5 bg-destructive/5 rounded-r"
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 font-semibold border text-[9px] bg-destructive/20 text-destructive border-destructive/30">
                        {categoryLabels[issue.category as QaCategory] ?? issue.category}
                      </span>
                      {issue.shotOrder != null && issue.shotOrder > 0 && (
                        <span className="text-[9px] font-mono text-destructive/70">Shot {issue.shotOrder}</span>
                      )}
                    </div>
                    <span className="text-foreground break-words leading-relaxed">{issue.message}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocation summaries */}
      {report.allocationSummaries.length > 0 && (
        <details className="rounded border border-border bg-card">
          <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 flex items-center gap-1">
            <ChevronDown className="h-3 w-3" />
            Couverture textuelle par scène
          </summary>
          <div className="p-2 space-y-1">
            {report.allocationSummaries.map((s) => (
              <div key={s.sceneOrder} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${s.valid ? "bg-emerald-500/5" : "bg-amber-500/5"}`}>
                <span className={`font-mono font-medium ${s.valid ? "text-emerald-600" : "text-amber-600"}`}>
                  {s.coveragePercent}%
                </span>
                <span className="text-muted-foreground">Scène {s.sceneOrder}</span>
                <span className="text-foreground truncate">« {s.sceneTitle} »</span>
                {s.gapCount > 0 && (
                  <span className="text-amber-600 text-[9px]">({s.gapCount} trou{s.gapCount > 1 ? "s" : ""})</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* WARNINGS — collapsible */}
      {warningIssues.length > 0 && (() => {
        const warningsByCategory = warningIssues.reduce((acc, issue) => {
          if (!acc[issue.category]) acc[issue.category] = [];
          acc[issue.category].push(issue);
          return acc;
        }, {} as Record<string, typeof warningIssues>);

        return (
          <details className="rounded border border-amber-500/30 bg-card">
            <summary className="text-[10px] font-medium text-amber-600 cursor-pointer hover:text-amber-500 transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 flex items-center gap-1">
              <ChevronDown className="h-3 w-3" />
              {warningIssues.length} avertissement{warningIssues.length > 1 ? "s" : ""} (non bloquant{warningIssues.length > 1 ? "s" : ""})
            </summary>
            <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(warningsByCategory).map(([cat, catIssues]) => (
                <div key={cat} className="space-y-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    {categoryLabels[cat as QaCategory] ?? cat}
                  </span>
                  {catIssues.map((issue, i) => renderIssueRow(issue, i))}
                </div>
              ))}
            </div>
          </details>
        );
      })()}
      {/* Debug timing table */}
      {timing && timing.entries.length > 0 && (
        <details className="rounded border border-border bg-card">
          <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 flex items-center">
            Debug Timing — {timing.entries.length} segments
          </summary>

          {/* Mobile: card layout */}
          <div className="sm:hidden p-2 space-y-2">
            {timing.entries.map((entry) => {
              const hasIssue = timing.issues.some((iss) => iss.shotId === entry.shotId);
              return (
                <div
                  key={entry.shotId}
                  className={`rounded border p-2 space-y-1 text-[10px] ${hasIssue ? "border-destructive/30 bg-destructive/5" : "border-border bg-secondary/20"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-muted-foreground">#{entry.order} • S{entry.sceneOrder}</span>
                    <span className={`inline-flex rounded px-1 py-0.5 text-[9px] font-medium border ${
                      entry.source === "timepoint"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : entry.source === "proportional"
                        ? "bg-accent text-accent-foreground border-border"
                        : "bg-secondary text-muted-foreground border-border"
                    }`}>
                      {entry.source}
                    </span>
                  </div>
                  <p className="text-foreground break-words">{entry.fragmentText.length > 80 ? entry.fragmentText.slice(0, 80) + "…" : entry.fragmentText}</p>
                  <div className="flex gap-3 font-mono text-muted-foreground">
                    <span>Start: {entry.start.toFixed(2)}s</span>
                    <span>Dur: {entry.duration.toFixed(2)}s</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table layout */}
          <div className="hidden sm:block overflow-x-auto">
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
