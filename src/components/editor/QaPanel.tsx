import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RefreshCw, ChevronDown, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";
import { getNarrativeSegments } from "./narrativeSegmentation";
import { buildManifestTiming, type ManifestTiming } from "./manifestTiming";
import { runQaValidation, type QaReport, type QaCategory, type QaIssue, type AllocationSummary } from "./qaValidation";

interface QaPanelProps {
  projectId: string;
  manifest: VisualPromptManifest;
  onExportAllowedChange?: (allowed: boolean) => void;
  onReportChange?: (counts: { errors: number; warnings: number; issues: { level: string; sceneOrder?: number; shotOrder?: number }[] }) => void;
  /** Called when force-override syncs scene source_text in DB — parent should refresh scenes state */
  onScenesUpdated?: () => void;
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

/** Generate a stable key for a QA issue to track force-overrides */
function issueKey(issue: { category: string; sceneOrder?: number; shotOrder?: number; message: string }): string {
  return `${issue.category}:${issue.sceneOrder ?? "g"}:${issue.shotOrder ?? ""}:${issue.message.slice(0, 80)}`;
}

export default function QaPanel({ projectId, manifest, onExportAllowedChange, onReportChange, onScenesUpdated }: QaPanelProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<QaReport | null>(null);
  const [timing, setTiming] = useState<ManifestTiming | null>(null);
  const [forcedKeys, setForcedKeys] = useState<Set<string>>(new Set());
  const [_forcedKeysLoaded, setForcedKeysLoaded] = useState(false);

  // ── Load persisted forced keys from DB ──
  useEffect(() => {
    const loadForcedKeys = async () => {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const saved = (data?.timeline_state as any)?.qaForcedKeys as string[] | null;
      if (saved && Array.isArray(saved)) {
        setForcedKeys(new Set(saved));
      }
      setForcedKeysLoaded(true);
    };
    loadForcedKeys();
  }, [projectId]);

  // ── Persist forced keys to DB ──
  const persistForcedKeys = async (keys: Set<string>) => {
    const { data } = await supabase
      .from("project_scriptcreator_state")
      .select("timeline_state")
      .eq("project_id", projectId)
      .single();
    const currentState = (data?.timeline_state as any) ?? {};
    await supabase
      .from("project_scriptcreator_state")
      .update({
        timeline_state: {
          ...currentState,
          qaForcedKeys: [...keys],
        } as any,
      })
      .eq("project_id", projectId);
  };

  /**
   * When forcing an allocation issue, update only the expected fragment inside
   * the canonical scene source_text — never rebuild the whole scene from shot order.
   */
  const syncSceneTextForIssue = async (issue: QaIssue) => {
    if (issue.category !== "allocation" || !issue.sceneId || !issue.actualFullText) return;

    const { data: sceneRow } = await supabase
      .from("scenes")
      .select("source_text")
      .eq("id", issue.sceneId)
      .single();

    const currentSourceText = sceneRow?.source_text?.trim();
    if (!currentSourceText) return;

    let newSourceText = currentSourceText;
    const expected = issue.expectedFullText?.trim();
    const actual = issue.actualFullText.trim();

    if (expected && currentSourceText.includes(expected)) {
      newSourceText = currentSourceText.replace(expected, actual);
    } else {
      const canonicalSegments = getNarrativeSegments(currentSourceText);
      if (issue.shotOrder && canonicalSegments[issue.shotOrder - 1]) {
        canonicalSegments[issue.shotOrder - 1] = actual;
        newSourceText = canonicalSegments.join("\n");
      } else {
        return;
      }
    }

    await supabase
      .from("scenes")
      .update({ source_text: newSourceText, updated_at: new Date().toISOString() })
      .eq("id", issue.sceneId);

    onScenesUpdated?.();
    const qa = runQaValidation(manifest, timing ?? buildManifestTiming(manifest, null, 0));
    setReport(qa);
  };

  const toggleForce = async (key: string, issue?: QaIssue) => {
    const isAdding = !forcedKeys.has(key);
    setForcedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistForcedKeys(next);
      return next;
    });
    // When forcing (not unforcing) an allocation issue, sync scene text
    if (isAdding && issue) {
      await syncSceneTextForIssue(issue);
    }
  };

  const forceAll = async (issues: QaIssue[]) => {
    const keys = issues.map(i => issueKey(i));
    setForcedKeys(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      persistForcedKeys(next);
      return next;
    });
    // Sync scene text for all allocation issues
    for (const issue of issues) {
      await syncSceneTextForIssue(issue);
    }
  };

  // Recalculate export allowed when forcedKeys changes
  useEffect(() => {
    if (!report) return;
    const criticals = report.issues.filter(i => i.level === "critical");
    const unblockedCount = criticals.filter(i => !forcedKeys.has(issueKey(i))).length;
    const allowed = unblockedCount === 0;
    onExportAllowedChange?.(allowed);
    onReportChange?.({ errors: unblockedCount, warnings: report.warningCount, issues: report.issues });
  }, [forcedKeys, report]);

  const runCheck = async () => {
    setLoading(true);
    // Keep forced keys — they are persisted and should survive re-checks

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

  const unblockedCriticals = report.issues.filter(i => i.level === "critical" && !forcedKeys.has(issueKey(i)));
  const forcedCount = report.issues.filter(i => i.level === "critical" && forcedKeys.has(issueKey(i))).length;
  const effectiveBlocked = unblockedCriticals.length;

  const StatusIcon = effectiveBlocked > 0 ? ShieldX : report.warningCount > 0 ? ShieldAlert : ShieldCheck;
  const statusColor = effectiveBlocked > 0 ? "text-destructive" : report.warningCount > 0 ? "text-amber-500" : "text-emerald-500";
  const statusLabel = effectiveBlocked > 0
    ? `${effectiveBlocked} erreur(s) bloquante(s)${forcedCount > 0 ? ` (${forcedCount} forcée${forcedCount > 1 ? "s" : ""})` : ""}`
    : forcedCount > 0
      ? `${forcedCount} erreur(s) forcée(s) — export autorisé`
      : report.warningCount > 0
        ? `${report.warningCount} avertissement(s)`
        : "Aucun problème détecté";

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
          {effectiveBlocked === 0 ? (
            <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              Export autorisé{forcedCount > 0 ? ` (${forcedCount} forcée${forcedCount > 1 ? "s" : ""})` : ""}
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

      {criticalIssues.length > 0 && (
        <div className={`rounded border-2 overflow-hidden ${effectiveBlocked > 0 ? "border-destructive/40 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className={`px-3 py-2 border-b flex items-center gap-2 justify-between ${effectiveBlocked > 0 ? "bg-destructive/10 border-destructive/20" : "bg-amber-500/10 border-amber-500/20"}`}>
            <div className="flex items-center gap-2">
              {effectiveBlocked > 0 ? <ShieldX className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-amber-500" />}
              <span className={`text-xs font-bold ${effectiveBlocked > 0 ? "text-destructive" : "text-amber-600"}`}>
                {effectiveBlocked > 0
                  ? `${effectiveBlocked} erreur${effectiveBlocked > 1 ? "s" : ""} bloquante${effectiveBlocked > 1 ? "s" : ""} — Export impossible`
                  : `${forcedCount} erreur${forcedCount > 1 ? "s" : ""} forcée${forcedCount > 1 ? "s" : ""} — Export autorisé`
                }
              </span>
            </div>
            {effectiveBlocked > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[9px] gap-1 px-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => forceAll(criticalIssues)}
              >
                <ShieldOff className="h-3 w-3" />
                Tout forcer
              </Button>
            )}
          </div>
          <div className="p-2 space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(criticalsByScene).map(([sceneLabel, issues]) => (
              <div key={sceneLabel} className="space-y-1">
                <div className="text-[10px] font-bold text-destructive/80 uppercase tracking-wider px-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                  {sceneLabel} — {issues.length} erreur{issues.length > 1 ? "s" : ""}
                </div>
                {issues.map((issue, i) => {
                  const key = issueKey(issue);
                  const isForced = forcedKeys.has(key);
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-[11px] pl-3 border-l-2 py-1.5 rounded-r ${
                        isForced
                          ? "border-l-amber-500/40 bg-amber-500/5 opacity-70"
                          : "border-l-destructive/40 bg-destructive/5"
                      }`}
                    >
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-semibold border text-[9px] ${
                            isForced
                              ? "bg-amber-500/20 text-amber-600 border-amber-500/30 line-through"
                              : "bg-destructive/20 text-destructive border-destructive/30"
                          }`}>
                            {categoryLabels[issue.category as QaCategory] ?? issue.category}
                          </span>
                          {issue.shotOrder != null && issue.shotOrder > 0 && (
                            <span className={`text-[9px] font-mono ${isForced ? "text-amber-600/70" : "text-destructive/70"}`}>Shot {issue.shotOrder}</span>
                          )}
                        </div>
                        <span className={`break-words leading-relaxed ${isForced ? "text-muted-foreground line-through" : "text-foreground"}`}>
                          {issue.message}
                        </span>
                        {(issue.expectedText || issue.actualText) && !isForced && (
                          <div className="w-full mt-1 space-y-1 text-[10px]">
                            {issue.expectedText && (
                              <div className="flex gap-1.5 items-start">
                                <span className="shrink-0 font-semibold text-emerald-500">Attendu :</span>
                                <span className="text-muted-foreground break-words whitespace-pre-wrap">« {issue.expectedText} »</span>
                              </div>
                            )}
                            {issue.actualText && (
                              <div className="flex gap-1.5 items-start">
                                <span className="shrink-0 font-semibold text-destructive">Shot :</span>
                                <span className="text-muted-foreground break-words whitespace-pre-wrap">« {issue.actualText} »</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 text-[9px] gap-1 px-1.5 shrink-0 ${
                          isForced
                            ? "text-amber-600 hover:bg-amber-500/10"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        }`}
                        onClick={() => toggleForce(key, issue)}
                        title={isForced ? "Rétablir le blocage" : "Forcer — ignorer cette erreur"}
                      >
                        {isForced ? (
                          <><ShieldX className="h-3 w-3" /> Rebloquer</>
                        ) : (
                          <><ShieldOff className="h-3 w-3" /> Forcer</>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {report.allocationSummaries.length > 0 && (
        <AllocationCoverageSection summaries={report.allocationSummaries} />
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
