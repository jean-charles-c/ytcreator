import { useState } from "react";
import type { ManifestTiming, ManifestTimingEntry } from "./manifestTiming";
import type { ShotTimepoint } from "./timelineAssembly";

interface ManifestTimingTableProps {
  timing: ManifestTiming;
  fps?: number;
  rawTimepoints?: ShotTimepoint[] | null;
}

/** Format seconds as timecode mm:ss:ff (frame-accurate) */
function formatTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  const ff = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

/** Frame number from seconds */
function toFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

// ── Replicate exact XML export frame logic ────────────────────────

interface XmlClipFrame {
  start: number;
  end: number;
}

/**
 * Exact replica of buildClipFramesFromManifest from xmlExportEngine.ts
 * so we can compare what the XML will actually produce.
 * Key rule: endFrame of clip i = startFrame of clip i+1 (no cumulative drift).
 */
function simulateXmlFrames(entries: ManifestTimingEntry[], fps: number): XmlClipFrame[] {
  if (entries.length === 0) return [];
  const frames: XmlClipFrame[] = [];
  for (let i = 0; i < entries.length; i++) {
    const startFrame = Math.max(0, Math.round(entries[i].start * fps));
    const endFrame = i < entries.length - 1
      ? Math.round(entries[i + 1].start * fps)
      : Math.round((entries[i].start + entries[i].duration) * fps);
    frames.push({
      start: startFrame,
      end: Math.max(endFrame, startFrame + 1),
    });
  }
  return frames;
}

export default function ManifestTimingTable({ timing, fps = 24, rawTimepoints }: ManifestTimingTableProps) {
  const { entries, issues, totalDuration } = timing;
  const [showComparison, setShowComparison] = useState(false);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-4">
        Aucun timing disponible. Sélectionnez un fichier audio avec des marqueurs.
      </p>
    );
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  // Build raw timepoint lookup
  const rawTpMap = new Map<string, number>();
  if (rawTimepoints) {
    for (const tp of rawTimepoints) {
      if (!tp.shotId.startsWith("_missing_")) {
        rawTpMap.set(tp.shotId, tp.timeSeconds);
      }
    }
  }

  // Simulate XML frames
  const xmlFrames = simulateXmlFrames(entries, fps);

  // Count drifts
  const drifts = entries.reduce((count, entry, i) => {
    const rawSec = rawTpMap.get(entry.shotId);
    if (rawSec === undefined) return count;
    const idealFrame = toFrame(rawSec, fps);
    const xmlFrame = xmlFrames[i]?.start ?? 0;
    return xmlFrame !== idealFrame ? count + 1 : count;
  }, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs text-muted-foreground">
        <span>{entries.length} segments</span>
        <span className="hidden sm:inline">•</span>
        <span>Durée : {formatTimecode(totalDuration, fps)}</span>
        <span className="hidden sm:inline">•</span>
        <span>{fps} fps</span>
        {errorCount > 0 && (
          <span className="text-destructive font-medium">⚠ {errorCount} erreur(s)</span>
        )}
        {warningCount > 0 && (
          <span className="text-amber-600 font-medium">⚠ {warningCount} avert.</span>
        )}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="rounded border border-border bg-secondary/30 p-2 space-y-1">
          {issues.map((issue, i) => (
            <p
              key={i}
              className={`text-[10px] pl-2 border-l-2 break-words ${
                issue.level === "error"
                  ? "text-destructive border-destructive/40"
                  : "text-amber-600 border-amber-500/40"
              }`}
            >
              Shot #{issue.order} — {issue.message}
            </p>
          ))}
        </div>
      )}

      {/* Toggle comparison mode */}
      {rawTimepoints && rawTimepoints.length > 0 && (
        <button
          onClick={() => setShowComparison((v) => !v)}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          {showComparison ? "◂ Masquer comparaison TTS vs XML" : "▸ Comparaison TTS brut vs XML export"}
          {drifts > 0 && !showComparison && (
            <span className="ml-1.5 text-destructive">({drifts} décalage{drifts > 1 ? "s" : ""})</span>
          )}
        </button>
      )}

      {/* ── Comparison table TTS vs XML ── */}
      {showComparison && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-secondary/50 text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">#</th>
                <th className="px-2 py-1.5 text-left font-medium">S</th>
                <th className="px-2 py-1.5 text-right font-medium">TTS brut (s)</th>
                <th className="px-2 py-1.5 text-right font-medium">TTS → Frame</th>
                <th className="px-2 py-1.5 text-right font-medium">TTS → TC</th>
                <th className="px-2 py-1.5 text-right font-medium">Manifest (s)</th>
                <th className="px-2 py-1.5 text-right font-medium">Manifest → Frame</th>
                <th className="px-2 py-1.5 text-right font-medium">XML Frame</th>
                <th className="px-2 py-1.5 text-right font-medium">XML TC</th>
                <th className="px-2 py-1.5 text-center font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const rawSec = rawTpMap.get(entry.shotId);
                const ttsFrame = rawSec !== undefined ? toFrame(rawSec, fps) : null;
                const ttsTc = rawSec !== undefined ? formatTimecode(rawSec, fps) : "—";
                const manifestFrame = toFrame(entry.start, fps);
                const xmlFrame = xmlFrames[i]?.start ?? 0;
                const xmlTc = formatTimecode(xmlFrame / fps, fps);
                const delta = ttsFrame !== null ? xmlFrame - ttsFrame : null;
                const hasDrift = delta !== null && delta !== 0;
                return (
                  <tr
                    key={entry.shotId}
                    className={`border-t border-border ${
                      hasDrift ? "bg-destructive/5" : i % 2 === 0 ? "bg-card" : "bg-secondary/20"
                    }`}
                  >
                    <td className="px-2 py-1 font-mono text-muted-foreground">{entry.order}</td>
                    <td className="px-2 py-1 text-muted-foreground">S{entry.sceneOrder}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {rawSec !== undefined ? rawSec.toFixed(3) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {ttsFrame !== null ? ttsFrame : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{ttsTc}</td>
                    <td className="px-2 py-1 text-right font-mono">{entry.start.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right font-mono">{manifestFrame}</td>
                    <td className={`px-2 py-1 text-right font-mono font-semibold ${hasDrift ? "text-destructive" : ""}`}>
                      {xmlFrame}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono ${hasDrift ? "text-destructive" : ""}`}>
                      {xmlTc}
                    </td>
                    <td className="px-2 py-1 text-center font-mono">
                      {delta === null ? "—" : delta === 0 ? (
                        <span className="text-emerald-500">✓</span>
                      ) : (
                        <span className="text-destructive font-semibold">{delta > 0 ? `+${delta}` : delta}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Drift summary */}
          <div className="px-3 py-2 bg-secondary/30 border-t border-border text-[10px] text-muted-foreground">
            {drifts === 0 ? (
              <span className="text-emerald-500 font-medium">✓ Aucun décalage : TTS brut et XML export sont parfaitement alignés.</span>
            ) : (
              <span className="text-destructive font-medium">
                ⚠ {drifts} shot{drifts > 1 ? "s" : ""} décalé{drifts > 1 ? "s" : ""} entre TTS brut et XML export.
                Le décalage vient du Math.max(startFrame, prevEnd) dans la construction des frames XML.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Mobile: card layout */}
      <div className="sm:hidden space-y-2">
        {entries.map((entry) => {
          const end = entry.start + entry.duration;
          const hasIssue = issues.some((iss) => iss.shotId === entry.shotId);
          return (
            <div
              key={entry.shotId}
              className={`rounded border p-2 space-y-1 text-[10px] ${
                hasIssue ? "border-destructive/30 bg-destructive/5" : "border-border bg-secondary/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-muted-foreground">#{entry.order} • S{entry.sceneOrder}</span>
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border ${
                  entry.source === "timepoint"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : entry.source === "proportional"
                    ? "bg-accent text-accent-foreground border-border"
                    : "bg-secondary text-muted-foreground border-border"
                }`}>
                  {entry.source}
                </span>
              </div>
              <p className="text-foreground break-words">
                {entry.fragmentText.length > 80 ? entry.fragmentText.slice(0, 80) + "…" : entry.fragmentText}
              </p>
              <div className="flex gap-3 font-mono text-muted-foreground">
                <span>{formatTimecode(entry.start, fps)}</span>
                <span>f{toFrame(entry.start, fps)}</span>
                <span>→ {formatTimecode(end, fps)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block overflow-x-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">Scène</th>
              <th className="px-2 py-1.5 text-left font-medium">Fragment</th>
              <th className="px-2 py-1.5 text-right font-medium">Début (TC)</th>
              <th className="px-2 py-1.5 text-right font-medium">Frame</th>
              <th className="px-2 py-1.5 text-right font-medium">Durée</th>
              <th className="px-2 py-1.5 text-right font-medium">Fin (TC)</th>
              <th className="px-2 py-1.5 text-center font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const end = entry.start + entry.duration;
              const startF = toFrame(entry.start, fps);
              const durFrames = toFrame(end, fps) - startF;
              const hasIssue = issues.some((iss) => iss.shotId === entry.shotId);
              return (
                <tr
                  key={entry.shotId}
                  className={`border-t border-border transition-colors ${
                    hasIssue ? "bg-destructive/5" : i % 2 === 0 ? "bg-card" : "bg-secondary/20"
                  }`}
                >
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">{entry.order}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">S{entry.sceneOrder}</td>
                  <td className="px-2 py-1.5 text-foreground max-w-[300px] truncate" title={entry.fragmentText}>
                    {entry.fragmentText.length > 60 ? entry.fragmentText.slice(0, 60) + "…" : entry.fragmentText}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatTimecode(entry.start, fps)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{startF}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{durFrames}f</td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatTimecode(end, fps)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border ${
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
    </div>
  );
}
