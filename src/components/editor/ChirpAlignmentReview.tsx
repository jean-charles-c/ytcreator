import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Clock, FlaskConical } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getShotFragmentText } from "./voiceOverShotSync";

interface ShotTimepointRow {
  shotId: string;
  shotIndex: number;
  timeSeconds: number;
}

interface ChirpAlignmentReviewProps {
  projectId: string | null;
  shots?: { id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null; description: string }[];
  scenesForSort?: { id: string; scene_order: number }[];
  refreshKey?: number;
}

interface ShotRow {
  shotId: string;
  globalIndex: number;
  text: string;
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  status: "ok" | "missing" | "error";
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export default function ChirpAlignmentReview({ projectId, shots, scenesForSort, refreshKey }: ChirpAlignmentReviewProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ShotRow[]>([]);
  const [audioEntry, setAudioEntry] = useState<{ id: string; duration_estimate: number; created_at: string; file_name: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const getSortedShots = () => {
    if (!shots || shots.length === 0 || !scenesForSort || scenesForSort.length === 0) return [];
    const sceneOrderMap = new Map(scenesForSort.map((s) => [s.id, s.scene_order]));
    return [...shots].sort((a, b) => {
      const oa = sceneOrderMap.get(a.scene_id) ?? 0;
      const ob = sceneOrderMap.get(b.scene_id) ?? 0;
      if (oa !== ob) return oa - ob;
      return a.shot_order - b.shot_order;
    });
  };

  useEffect(() => {
    if (!projectId || !open) return;

    const load = async () => {
      setLoading(true);
      try {
        // Get latest chirp3hd audio entry
        const { data: audioData } = await supabase
          .from("vo_audio_history")
          .select("id, shot_timepoints, duration_estimate, created_at, file_name")
          .eq("project_id", projectId)
          .in("style", ["chirp3hd", "chirp3hd-assembled"])
          .order("created_at", { ascending: false })
          .limit(1);

        const entry = audioData?.[0];
        if (!entry) {
          setRows([]);
          setAudioEntry(null);
          setLoading(false);
          return;
        }

        setAudioEntry({
          id: entry.id,
          duration_estimate: entry.duration_estimate ?? 0,
          created_at: entry.created_at ?? "",
          file_name: entry.file_name,
        });

        const timepoints: ShotTimepointRow[] = Array.isArray(entry.shot_timepoints)
          ? (entry.shot_timepoints as any[]).filter((tp) => tp && tp.shotId && typeof tp.timeSeconds === "number")
          : [];

        const timepointMap = new Map<string, number>(
          timepoints.map((tp) => [tp.shotId, tp.timeSeconds])
        );

        const sorted = getSortedShots();
        const audioDuration = entry.duration_estimate ?? 0;

        const shotRows: ShotRow[] = sorted.map((shot, idx) => {
          const text = getShotFragmentText(shot);
          const startTime = timepointMap.get(shot.id) ?? null;

          if (startTime === null) {
            return {
              shotId: shot.id,
              globalIndex: idx + 1,
              text,
              startTime: null,
              endTime: null,
              duration: null,
              status: "missing" as const,
            };
          }

          // Find next mapped shot's start for endTime
          let endTime: number | null = null;
          for (let j = idx + 1; j < sorted.length; j++) {
            const nextStart = timepointMap.get(sorted[j].id);
            if (nextStart !== undefined) {
              endTime = nextStart;
              break;
            }
          }
          if (endTime === null) endTime = audioDuration;

          const duration = endTime - startTime;

          return {
            shotId: shot.id,
            globalIndex: idx + 1,
            text,
            startTime,
            endTime,
            duration,
            status: duration > 0 ? "ok" as const : "error" as const,
          };
        });

        setRows(shotRows);
      } catch (e) {
        console.error("[ChirpAlignmentReview] load error:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId, open, refreshKey, shots?.length]);

  const okCount = rows.filter((r) => r.status === "ok").length;
  const missingCount = rows.filter((r) => r.status === "missing").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const totalCount = rows.length;
  const allOk = totalCount > 0 && okCount === totalCount;
  const xmlReady = allOk;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg border border-border bg-card px-3 sm:px-4 py-3 hover:bg-muted/50 transition-colors min-h-[48px]">
        <FlaskConical className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs sm:text-sm font-semibold font-display text-foreground flex-1 text-left">
          Contrôle Chirp 3 HD
        </span>
        {totalCount > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
            allOk
              ? "bg-emerald-500/15 text-emerald-500"
              : missingCount > 0
                ? "bg-destructive/15 text-destructive"
                : "bg-amber-500/15 text-amber-500"
          }`}>
            {allOk ? <CheckCircle2 className="h-3 w-3" /> : missingCount > 0 ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {allOk ? "Prêt" : `${okCount}/${totalCount}`}
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3 space-y-3">
        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse">Chargement…</p>
        )}

        {!loading && !audioEntry && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">Aucun audio Chirp 3 HD généré pour ce projet.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Générez un audio en mode Chirp 3 HD pour voir le contrôle qualité.</p>
          </div>
        )}

        {!loading && audioEntry && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">Audio trouvé mais aucun shot à mapper.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <div className="rounded-lg border border-border bg-card p-1.5 sm:p-2 text-center">
                <p className="text-sm sm:text-lg font-bold text-foreground">{totalCount}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">Shots</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-1.5 sm:p-2 text-center">
                <p className="text-sm sm:text-lg font-bold text-emerald-500">{okCount}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">Calés</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-1.5 sm:p-2 text-center">
                <p className="text-sm sm:text-lg font-bold text-destructive">{missingCount}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">Manquants</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-1.5 sm:p-2 text-center">
                <p className="text-sm sm:text-lg font-bold text-amber-500">{errorCount}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">Erreurs</p>
              </div>
            </div>

            {/* XML readiness banner */}
            {xmlReady ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 sm:p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-[11px] sm:text-xs text-emerald-400 font-medium">
                  Tous les shots sont calés — export XML disponible.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 sm:p-3">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] sm:text-xs text-destructive font-medium">
                    Export XML bloqué — {missingCount} shot(s) sans timepoint.
                  </p>
                  <ul className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                    {missingCount > 0 && (
                      <li>• Vérifiez la correspondance script ↔ shots.</li>
                    )}
                    <li>• Régénérez après avoir collé le script actuel.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Audio info */}
            {audioEntry && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {audioEntry.duration_estimate.toFixed(1)}s
                </span>
                <span className="truncate max-w-[150px] sm:max-w-none">{audioEntry.file_name}</span>
                <span className="hidden sm:inline">{new Date(audioEntry.created_at).toLocaleString("fr-FR")}</span>
              </div>
            )}

            {/* ── Mobile: card layout (<640px) ── */}
            <div className="sm:hidden space-y-2">
              {rows.map((row) => (
                <div
                  key={row.shotId}
                  className={`rounded-lg border p-3 space-y-1.5 ${
                    row.status === "missing"
                      ? "border-destructive/30 bg-destructive/5"
                      : row.status === "error"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">#{row.globalIndex}</span>
                    {row.status === "ok" && (
                      <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px] font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    )}
                    {row.status === "missing" && (
                      <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-medium">
                        <XCircle className="h-3.5 w-3.5" /> Absent
                      </span>
                    )}
                    {row.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-amber-500 text-[11px] font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" /> Erreur
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground leading-relaxed line-clamp-2">
                    {row.text || <span className="text-muted-foreground italic">—</span>}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                    <span>{row.startTime !== null ? formatTime(row.startTime) : "—"}</span>
                    <span>→</span>
                    <span>{row.endTime !== null ? formatTime(row.endTime) : "—"}</span>
                    <span className={`ml-auto font-semibold ${
                      row.duration !== null && row.duration > 0 ? "text-foreground" : "text-destructive"
                    }`}>
                      {row.duration !== null ? `${row.duration.toFixed(2)}s` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: table layout (≥640px) ── */}
            <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-20">Statut</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Texte</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Début</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Fin</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TooltipProvider>
                      {rows.map((row) => (
                        <tr
                          key={row.shotId}
                          className={`border-b border-border last:border-0 ${
                            row.status === "missing"
                              ? "bg-destructive/5"
                              : row.status === "error"
                                ? "bg-amber-500/5"
                                : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-muted-foreground">{row.globalIndex}</td>
                          <td className="px-3 py-2">
                            <Tooltip>
                              <TooltipTrigger>
                                {row.status === "ok" && (
                                  <span className="inline-flex items-center gap-1 text-emerald-500">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span className="font-medium">OK</span>
                                  </span>
                                )}
                                {row.status === "missing" && (
                                  <span className="inline-flex items-center gap-1 text-destructive">
                                    <XCircle className="h-3.5 w-3.5" />
                                    <span className="font-medium">Absent</span>
                                  </span>
                                )}
                                {row.status === "error" && (
                                  <span className="inline-flex items-center gap-1 text-amber-500">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="font-medium">Erreur</span>
                                  </span>
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                {row.status === "ok" && <p>Calage exact — correspondance mot-à-mot validée.</p>}
                                {row.status === "missing" && <p>Aucun timepoint trouvé. Le texte du shot ne correspond pas à la transcription audio.</p>}
                                {row.status === "error" && <p>Timepoint trouvé mais durée invalide ({row.duration?.toFixed(2)}s).</p>}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-3 py-2 max-w-[250px] lg:max-w-[400px] truncate text-foreground" title={row.text}>
                            {row.text || <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {row.startTime !== null ? formatTime(row.startTime) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {row.endTime !== null ? formatTime(row.endTime) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.duration !== null ? (
                              <span className={row.duration > 0 ? "text-foreground" : "text-destructive"}>
                                {row.duration.toFixed(2)}s
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </TooltipProvider>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
