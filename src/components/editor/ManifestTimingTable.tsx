import type { ManifestTiming } from "./manifestTiming";

interface ManifestTimingTableProps {
  timing: ManifestTiming;
  fps?: number;
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

export default function ManifestTimingTable({ timing }: ManifestTimingTableProps) {
  const { entries, issues, totalDuration } = timing;

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-4">
        Aucun timing disponible. Sélectionnez un fichier audio avec des marqueurs.
      </p>
    );
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs text-muted-foreground">
        <span>{entries.length} segments</span>
        <span className="hidden sm:inline">•</span>
        <span>Durée : {formatTime(totalDuration)}</span>
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

      {/* Mobile: card layout */}
      <div className="sm:hidden space-y-2">
        {entries.map((entry, i) => {
          const end = Math.round((entry.start + entry.duration) * 100) / 100;
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
                <span>{formatTime(entry.start)}</span>
                <span>{entry.duration.toFixed(2)}s</span>
                <span>→ {formatTime(end)}</span>
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
              <th className="px-2 py-1.5 text-right font-medium">Début</th>
              <th className="px-2 py-1.5 text-right font-medium">Durée</th>
              <th className="px-2 py-1.5 text-right font-medium">Fin</th>
              <th className="px-2 py-1.5 text-center font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const end = Math.round((entry.start + entry.duration) * 100) / 100;
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
                  <td className="px-2 py-1.5 text-right font-mono">{formatTime(entry.start)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{entry.duration.toFixed(2)}s</td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatTime(end)}</td>
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
