import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Save,
  Search,
  Loader2,
  Clock,
  GitCompareArrows,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getShotFragmentText } from "./voiceOverShotSync";
import { recalculateWhisperShotEndTimes } from "./whisperAlignmentTiming";

// ── Types ──

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface ShotTimepoint {
  shotId: string;
  shotIndex: number;
  timeSeconds: number;
}

interface ShotInfo {
  id: string;
  scene_id: string;
  shot_order: number;
  source_sentence: string | null;
  source_sentence_fr: string | null;
  description: string;
}

interface AlignedShot {
  shotId: string;
  globalIndex: number;
  shotText: string;
  /** Matched whisper word range */
  whisperStartIdx: number | null;
  whisperEndIdx: number | null;
  startTime: number | null;
  endTime: number | null;
  status: "ok" | "missing" | "manual";
  /** Is user currently editing this? */
  editing: boolean;
}

interface WhisperAlignmentEditorProps {
  projectId: string;
  shots: ShotInfo[];
  scenesForSort: { id: string; scene_order: number }[];
  refreshKey?: number;
}

const TIMECODE_FPS = 24;

function formatTimecode(sec: number, fps = TIMECODE_FPS): string {
  const totalFrames = Math.max(0, Math.round(sec * fps));
  const ff = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

function formatSeconds(sec: number): string {
  return `${sec.toFixed(3)}s`;
}

export default function WhisperAlignmentEditor({
  projectId,
  shots,
  scenesForSort,
  refreshKey,
}: WhisperAlignmentEditorProps) {
  const [whisperWords, setWhisperWords] = useState<WhisperWord[]>([]);
  const [audioEntryId, setAudioEntryId] = useState<string | null>(null);
  const [alignedShots, setAlignedShots] = useState<AlignedShot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [globalOffset, setGlobalOffset] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  
  const [dualPassData, setDualPassData] = useState<{
    passA: WhisperWord[];
    passB: WhisperWord[];
    comparison: { avgDeltaMs: number; maxDeltaMs: number; p95DeltaMs: number; wordCountA: number; wordCountB: number; biggestDiffs: { word: string; index: number; startA: number; startB: number; deltaMs: number }[] };
  } | null>(null);

  const getSortedShots = useCallback(() => {
    if (!shots.length || !scenesForSort.length) return [];
    const sceneOrderMap = new Map(scenesForSort.map((s) => [s.id, s.scene_order]));
    return [...shots].sort((a, b) => {
      const oa = sceneOrderMap.get(a.scene_id) ?? 0;
      const ob = sceneOrderMap.get(b.scene_id) ?? 0;
      if (oa !== ob) return oa - ob;
      return a.shot_order - b.shot_order;
    });
  }, [shots, scenesForSort]);

  // ── Load data ──
  // Load dual pass data from localStorage (independent of DB data)
  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = localStorage.getItem(`whisper-dual-${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.passA && parsed.passB && parsed.comparison) {
          setDualPassData(parsed);
        }
      }
    } catch {}
  }, [projectId, refreshKey]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("vo_audio_history")
          .select("id, whisper_words, shot_timepoints, duration_estimate")
          .eq("project_id", projectId)
          .eq("style", "chirp3hd")
          .order("created_at", { ascending: false })
          .limit(1);

        const entry = data?.[0];
        if (!entry || !entry.whisper_words) {
          setWhisperWords([]);
          setAlignedShots([]);
          setAudioEntryId(null);
          setAudioDuration(0);
          setLoading(false);
          return;
        }

        setAudioEntryId(entry.id);
        const words: WhisperWord[] = Array.isArray(entry.whisper_words)
          ? (entry.whisper_words as any[]).filter(
              (w) => w && typeof w.word === "string" && typeof w.start === "number"
            )
          : [];
        setWhisperWords(words);

        const timepoints: ShotTimepoint[] = Array.isArray(entry.shot_timepoints)
          ? (entry.shot_timepoints as any[]).filter((tp) => tp && tp.shotId)
          : [];
        const tpMap = new Map(timepoints.map((tp) => [tp.shotId, tp.timeSeconds as number]));

        const sorted = getSortedShots();
        const resolvedAudioDuration = entry.duration_estimate ?? 0;
        setAudioDuration(resolvedAudioDuration);

        const aligned: AlignedShot[] = sorted.map((shot, idx) => {
          const text = getShotFragmentText(shot);
          const startTime = tpMap.get(shot.id) ?? null;

          if (startTime === null) {
            return {
              shotId: shot.id,
              globalIndex: idx + 1,
              shotText: text,
              whisperStartIdx: null,
              whisperEndIdx: null,
              startTime: null,
              endTime: null,
              status: "missing" as const,
              editing: false,
            };
          }

          // Find whisper word indices that match this startTime
          const wStartIdx = words.findIndex((w) => Math.abs(w.start - startTime) < 0.05);

          // Find end time from next shot
          let endTime: number | null = null;
          for (let j = idx + 1; j < sorted.length; j++) {
            const nextStart = tpMap.get(sorted[j].id);
            if (nextStart !== undefined) {
              endTime = nextStart;
              break;
            }
          }
          if (endTime === null) endTime = resolvedAudioDuration;

          let wEndIdx: number | null = null;
          if (endTime !== null) {
            for (let wi = words.length - 1; wi >= 0; wi--) {
              if (words[wi].end <= endTime + 0.05) {
                wEndIdx = wi;
                break;
              }
            }
          }

          return {
            shotId: shot.id,
            globalIndex: idx + 1,
            shotText: text,
            whisperStartIdx: wStartIdx >= 0 ? wStartIdx : null,
            whisperEndIdx: wEndIdx !== null && wEndIdx >= 0 ? wEndIdx : null,
            startTime,
            endTime,
            status: "ok" as const,
            editing: false,
          };
        });

        setAlignedShots(recalculateWhisperShotEndTimes(aligned, resolvedAudioDuration));
      } catch (e) {
        console.error("[WhisperAlignmentEditor] load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, refreshKey, getSortedShots]);

  // ── Stats ──
  const okCount = alignedShots.filter((s) => s.status === "ok" || s.status === "manual").length;
  const manualCount = alignedShots.filter((s) => s.status === "manual").length;
  const missingCount = alignedShots.filter((s) => s.status === "missing").length;
  const totalCount = alignedShots.length;

  // ── Manual selection handlers ──
  const startEditing = (shotId: string) => {
    setEditingShotId(shotId);
    setSelectionStart(null);
    setSelectionEnd(null);
    setExpandedShotId(shotId);
  };

  const handleWordClick = (idx: number) => {
    if (!editingShotId) return;
    if (selectionStart === null) {
      setSelectionStart(idx);
      setSelectionEnd(idx);
    } else if (selectionEnd === null || idx >= selectionStart) {
      setSelectionEnd(idx);
    } else {
      setSelectionStart(idx);
      setSelectionEnd(null);
    }
  };

  const applyManualAlignment = useCallback(async () => {
    if (!editingShotId || selectionStart === null || selectionEnd === null || !audioEntryId) return;

    const startTime = whisperWords[selectionStart].start + globalOffset;

    // Update local state
    const recalculatedShots = recalculateWhisperShotEndTimes(
      alignedShots.map((s) =>
        s.shotId === editingShotId
          ? {
              ...s,
              whisperStartIdx: selectionStart,
              whisperEndIdx: selectionEnd,
              startTime,
              status: "manual" as const,
            }
          : s
      ),
      audioDuration
    );
    setAlignedShots(recalculatedShots);

    // Auto-save to DB immediately
    try {
      const timepoints = recalculatedShots
        .filter((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null)
        .map((s, idx) => ({
          shotId: s.shotId,
          shotIndex: idx,
          timeSeconds: s.startTime,
        }));

      const { error } = await supabase
        .from("vo_audio_history")
        .update({ shot_timepoints: timepoints as any })
        .eq("id", audioEntryId);

      if (error) throw error;
      toast.success(`Shot calé — ${timepoints.length} timepoints sauvegardés`);
    } catch (e: any) {
      console.error("[WhisperAlignmentEditor] auto-save error:", e);
      toast.error("Calage appliqué localement mais erreur de sauvegarde");
    }

    setEditingShotId(null);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [editingShotId, selectionStart, selectionEnd, whisperWords, audioEntryId, alignedShots, globalOffset, audioDuration]);

  // ── Save all to DB ──
  const saveAllTimepoints = useCallback(async () => {
    if (!audioEntryId) return;
    setSaving(true);
    try {
      const timepoints = alignedShots
        .filter((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null)
        .map((s, idx) => ({
          shotId: s.shotId,
          shotIndex: idx,
          timeSeconds: s.startTime,
        }));

      const { error } = await supabase
        .from("vo_audio_history")
        .update({ shot_timepoints: timepoints as any })
        .eq("id", audioEntryId);

      if (error) throw error;
      toast.success(`${timepoints.length} timepoints sauvegardés`);
    } catch (e: any) {
      console.error("[WhisperAlignmentEditor] save error:", e);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }, [audioEntryId, alignedShots]);

  // ── Whisper text for selection display ──
  const getWhisperSegment = (startIdx: number | null, endIdx: number | null) => {
    if (startIdx === null || endIdx === null) return "";
    return whisperWords
      .slice(startIdx, endIdx + 1)
      .map((w) => w.word)
      .join(" ");
  };

  const hasChanges = useMemo(() => {
    return alignedShots.some((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null);
  }, [alignedShots]);

  if (totalCount === 0 && !loading) return null;

  return (
    <details className="rounded border border-border bg-card">
      <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 flex items-center gap-1.5">
        <Search className="h-3 w-3 shrink-0" />
        <span>Alignement Whisper par shot</span>
        {totalCount > 0 && (
          <span
            className={`ml-auto text-[9px] font-bold ${
              missingCount === 0 ? "text-emerald-500" : "text-destructive"
            }`}
          >
            {okCount}/{totalCount}
            {manualCount > 0 && <span className="text-orange-500 ml-1">({manualCount} manuels)</span>}
          </span>
        )}
      </summary>

      <div className="p-2 space-y-2">
        {/* Global offset control */}
        {!loading && whisperWords.length > 0 && (
          <div className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Offset global :</span>
            <Slider
              min={-5}
              max={10}
              step={0.01}
              value={[globalOffset]}
              onValueChange={(v) => setGlobalOffset(v[0])}
              className="flex-1 max-w-[180px]"
            />
            <input
              type="number"
              step="0.01"
              value={globalOffset}
              onChange={(e) => setGlobalOffset(parseFloat(e.target.value) || 0)}
              className="w-16 text-[10px] font-mono text-center bg-background border border-border rounded px-1 py-0.5"
            />
            <span className="text-[10px] text-muted-foreground">s</span>
            {globalOffset !== 0 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[9px] px-1.5"
                  onClick={() => setGlobalOffset(0)}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-[9px] px-2"
                  disabled={saving}
                  onClick={async () => {
                    if (!audioEntryId) return;
                    setSaving(true);
                    try {
                      // Recalculate all shot start times with offset applied
                      const recalculated = recalculateWhisperShotEndTimes(alignedShots.map((s) => {
                        if (s.status === "missing" || s.startTime === null) return s;
                        const newStart = Math.max(0, s.startTime + globalOffset);
                        return { ...s, startTime: newStart };
                      }), audioDuration);
                      setAlignedShots(recalculated);

                      const timepoints = recalculated
                        .filter((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null)
                        .map((s, idx) => ({
                          shotId: s.shotId,
                          shotIndex: idx,
                          timeSeconds: s.startTime,
                        }));

                      const { error } = await supabase
                        .from("vo_audio_history")
                        .update({ shot_timepoints: timepoints as any })
                        .eq("id", audioEntryId);

                      if (error) throw error;
                      toast.success(`Offset de ${globalOffset.toFixed(2)}s appliqué à ${timepoints.length} shots`);
                      setGlobalOffset(0); // reset after applying
                    } catch (e: any) {
                      console.error("[WhisperAlignmentEditor] offset apply error:", e);
                      toast.error("Erreur lors de l'application de l'offset");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Appliquer à tous
                </Button>
              </>
            )}
          </div>
        )}

        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
          </p>
        )}

        {/* Dual pass comparison panel — always visible when data exists */}
        {!loading && dualPassData && (
          <details className="rounded border border-border bg-muted/20 mb-2">
            <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground px-3 py-2 flex items-center gap-1.5">
              <GitCompareArrows className="h-3 w-3 shrink-0" />
              <span>Comparaison double passe Whisper</span>
              <span className="ml-auto text-[9px] font-mono">
                Δ moy: {dualPassData.comparison.avgDeltaMs}ms · max: {dualPassData.comparison.maxDeltaMs}ms · p95: {dualPassData.comparison.p95DeltaMs}ms
              </span>
            </summary>
            <div className="p-2 space-y-2">
              <div className="text-[9px] text-muted-foreground">
                Passe A : {dualPassData.passA.length} mots · Passe B : {dualPassData.passB.length} mots
              </div>
            </div>
          </details>
        )}

        {!loading && whisperWords.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-3">
            Aucune donnée Whisper. Régénérez l'audio Chirp 3 HD pour activer l'alignement manuel.
          </p>
        )}

        {!loading && whisperWords.length > 0 && (
          <>
            {/* Shot list */}
            <div className="space-y-1">
              {alignedShots.map((shot) => {
                const isExpanded = expandedShotId === shot.shotId;
                const isEditing = editingShotId === shot.shotId;
                return (
                  <div
                    key={shot.shotId}
                    className={`rounded border text-[10px] ${
                      shot.status === "manual"
                        ? "border-orange-500/30 bg-orange-500/5"
                        : shot.status === "ok"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-destructive/30 bg-destructive/5"
                    }`}
                  >
                    {/* Header row */}
                    <button
                      onClick={() => {
                        if (isEditing) return;
                        setExpandedShotId(isExpanded ? null : shot.shotId);
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left min-h-[36px]"
                    >
                      {shot.status === "manual" ? (
                        <CheckCircle2 className="h-3 w-3 text-orange-500 shrink-0" />
                      ) : shot.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <span className="font-mono font-medium text-muted-foreground shrink-0">
                        #{shot.globalIndex}
                      </span>
                      <span className="text-foreground truncate flex-1 min-w-0">
                        {shot.shotText.slice(0, 60)}
                        {shot.shotText.length > 60 ? "…" : ""}
                      </span>
                      {shot.startTime !== null && (
                        <span
                          className="font-mono text-muted-foreground shrink-0"
                          title={formatSeconds(shot.startTime)}
                        >
                          {formatTimecode(shot.startTime)}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-2 pb-2 space-y-2 border-t border-border pt-2">
                        {/* Shot text */}
                        <div>
                          <span className="font-semibold text-muted-foreground block mb-0.5">
                            Texte du shot :
                          </span>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap break-words">
                            {shot.shotText}
                          </p>
                        </div>

                        {/* Current Whisper match */}
                        <div>
                          <span className="font-semibold text-muted-foreground block mb-0.5">
                            Transcription Whisper correspondante :
                          </span>
                          {shot.whisperStartIdx !== null && shot.whisperEndIdx !== null ? (
                            <p className="text-emerald-600 leading-relaxed whitespace-pre-wrap break-words">
                              {getWhisperSegment(shot.whisperStartIdx, shot.whisperEndIdx)}
                            </p>
                          ) : (
                            <p className="text-destructive italic">Aucune correspondance trouvée</p>
                          )}
                        </div>

                        {/* Diagnostic: tokenized source vs nearby whisper */}
                        {shot.status === "missing" && (
                          <div className="rounded bg-muted/50 border border-border p-2 space-y-1">
                            <span className="font-semibold text-orange-500 block text-[9px]">
                              🔍 Diagnostic de matching
                            </span>
                            <div>
                              <span className="text-muted-foreground text-[9px]">Tokens source (premiers 8) : </span>
                              <span className="font-mono text-[9px] text-foreground">
                                {shot.shotText.split(/\s+/).slice(0, 8).map(w => 
                                  `"${w}"`
                                ).join(" ")}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-[9px]">Whisper autour pos attendue : </span>
                              <span className="font-mono text-[9px] text-foreground">
                                {(() => {
                                  // Estimate expected position based on surrounding shots
                                  const idx = alignedShots.indexOf(shot);
                                  let nearbyStart = 0;
                                  for (let i = idx - 1; i >= 0; i--) {
                                    if (alignedShots[i].whisperEndIdx !== null) {
                                      nearbyStart = alignedShots[i].whisperEndIdx! + 1;
                                      break;
                                    }
                                  }
                                  return whisperWords
                                    .slice(nearbyStart, nearbyStart + 12)
                                    .map(w => `"${w.word}"`)
                                    .join(" ");
                                })()}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Timing info + per-shot fine-tune */}
                        {shot.startTime !== null && shot.endTime !== null && (
                          <div className="space-y-1">
                            <div className="flex gap-3 font-mono text-muted-foreground">
                              <span>Début: {formatTimecode(shot.startTime)} ({formatSeconds(shot.startTime)})</span>
                              <span>Fin: {formatTimecode(shot.endTime)} ({formatSeconds(shot.endTime)})</span>
                              <span>
                                Durée: {(shot.endTime - shot.startTime).toFixed(2)}s
                              </span>
                            </div>
                            {/* Per-shot frame nudge */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-muted-foreground">Ajuster :</span>
                              {[-5, -1].map((delta) => (
                                <Button
                                  key={delta}
                                  size="sm"
                                  variant="outline"
                                  className="h-5 w-7 text-[9px] px-0 font-mono"
                                  onClick={async () => {
                                    const frameOffset = delta / TIMECODE_FPS;
                                    const newStart = Math.max(0, (shot.startTime ?? 0) + frameOffset);
                                    const recalculated = recalculateWhisperShotEndTimes(
                                      alignedShots.map((s) =>
                                        s.shotId === shot.shotId
                                          ? { ...s, startTime: newStart, status: "manual" as const }
                                          : s
                                      ),
                                      audioDuration
                                    );
                                    setAlignedShots(recalculated);
                                    if (audioEntryId) {
                                      const timepoints = recalculated
                                        .filter((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null)
                                        .map((s, idx) => ({ shotId: s.shotId, shotIndex: idx, timeSeconds: s.startTime }));
                                      await supabase.from("vo_audio_history").update({ shot_timepoints: timepoints as any }).eq("id", audioEntryId);
                                    }
                                  }}
                                >
                                  {delta}f
                                </Button>
                              ))}
                              {[+1, +5].map((delta) => (
                                <Button
                                  key={delta}
                                  size="sm"
                                  variant="outline"
                                  className="h-5 w-7 text-[9px] px-0 font-mono"
                                  onClick={async () => {
                                    const frameOffset = delta / TIMECODE_FPS;
                                    const newStart = Math.max(0, (shot.startTime ?? 0) + frameOffset);
                                    const recalculated = recalculateWhisperShotEndTimes(
                                      alignedShots.map((s) =>
                                        s.shotId === shot.shotId
                                          ? { ...s, startTime: newStart, status: "manual" as const }
                                          : s
                                      ),
                                      audioDuration
                                    );
                                    setAlignedShots(recalculated);
                                    if (audioEntryId) {
                                      const timepoints = recalculated
                                        .filter((s) => (s.status === "ok" || s.status === "manual") && s.startTime !== null)
                                        .map((s, idx) => ({ shotId: s.shotId, shotIndex: idx, timeSeconds: s.startTime }));
                                      await supabase.from("vo_audio_history").update({ shot_timepoints: timepoints as any }).eq("id", audioEntryId);
                                    }
                                  }}
                                >
                                  +{delta}f
                                </Button>
                              ))}
                              <span className="text-[8px] text-muted-foreground ml-1">(1f = {(1/TIMECODE_FPS*1000).toFixed(0)}ms)</span>
                            </div>
                          </div>
                        )}

                        {/* Edit button */}
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant={shot.status === "missing" ? "destructive" : "outline"}
                            className="h-7 text-[10px]"
                            onClick={() => startEditing(shot.shotId)}
                          >
                            <Search className="h-3 w-3 mr-1" />
                            {shot.status === "missing"
                              ? "Caler manuellement"
                              : "Recaler"}
                          </Button>
                        )}

                        {/* Manual selection UI */}
                        {isEditing && (
                          <div className="space-y-2">
                            <p className="text-muted-foreground font-medium">
                              Cliquez sur le premier mot puis le dernier mot correspondant à ce shot :
                            </p>
                            <div className="max-h-[200px] overflow-y-auto rounded border border-border bg-background p-2 leading-relaxed flex flex-wrap gap-0.5">
                              {whisperWords.map((w, idx) => {
                                const isSelected =
                                  selectionStart !== null &&
                                  selectionEnd !== null &&
                                  idx >= selectionStart &&
                                  idx <= selectionEnd;
                                const isStart = idx === selectionStart;
                                const isEnd = idx === selectionEnd;
                                return (
                                  <span
                                    key={idx}
                                    onClick={() => handleWordClick(idx)}
                                    className={`cursor-pointer rounded px-0.5 py-0.5 transition-colors ${
                                      isSelected
                                        ? "bg-primary/20 text-primary font-medium"
                                        : "hover:bg-muted text-foreground"
                                    } ${isStart ? "ring-1 ring-primary" : ""} ${
                                      isEnd ? "ring-1 ring-primary" : ""
                                    }`}
                                  >
                                    {w.word}
                                  </span>
                                );
                              })}
                            </div>

                            {selectionStart !== null && selectionEnd !== null && (
                              <div className="space-y-1 text-[10px]">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground">
                                    {formatTimecode(whisperWords[selectionStart].start + globalOffset)} →{" "}
                                    {formatTimecode(whisperWords[selectionEnd].end + globalOffset)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    ({selectionEnd - selectionStart + 1} mots)
                                  </span>
                                  {globalOffset !== 0 && (
                                    <span className="text-orange-500 text-[9px]">
                                      (offset {globalOffset > 0 ? "+" : ""}{globalOffset.toFixed(2)}s)
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[9px] text-muted-foreground/80">
                                  {formatSeconds(whisperWords[selectionStart].start + globalOffset)} →{" "}
                                  {formatSeconds(whisperWords[selectionEnd].end + globalOffset)}
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-[10px]"
                                disabled={selectionStart === null || selectionEnd === null}
                                onClick={applyManualAlignment}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Appliquer
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px]"
                                onClick={() => {
                                  setEditingShotId(null);
                                  setSelectionStart(null);
                                  setSelectionEnd(null);
                                }}
                              >
                                Annuler
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save button */}
            {hasChanges && (
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={saveAllTimepoints}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                Sauvegarder tous les timepoints ({okCount}/{totalCount})
              </Button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
