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
import { matchShotsStrictSequential } from "./whisperTextMatcher";
import { buildRepairedShotTimepoints } from "./whisperTimepointRepair";

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
  status: "ok" | "missing" | "manual" | "estimated" | "blocked";
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
  
  const [multiPassData, setMultiPassData] = useState<{
    passA: WhisperWord[];
    passB: WhisperWord[];
    passC?: WhisperWord[];
    comparison: { avgDeltaMs: number; maxDeltaMs: number; p95DeltaMs: number; wordCountA: number; wordCountB: number; biggestDiffs: { word: string; index: number; startA: number; startB: number; deltaMs: number }[] };
    timestamp?: string;
  } | null>(null);
  const [applyingPass, setApplyingPass] = useState(false);

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

  const getManualAnchorsStorageKey = useCallback(
    (audioId: string) => `whisper-manual-anchors-${projectId}-${audioId}`,
    [projectId]
  );

  const loadStoredManualAnchors = useCallback((audioId: string) => {
    try {
      const stored = localStorage.getItem(getManualAnchorsStorageKey(audioId));
      if (!stored) return new Map<string, number>();
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return new Map<string, number>();

      return new Map(
        parsed.filter(
          (entry): entry is [string, number] =>
            Array.isArray(entry) &&
            typeof entry[0] === "string" &&
            typeof entry[1] === "number" &&
            Number.isFinite(entry[1])
        )
      );
    } catch {
      return new Map<string, number>();
    }
  }, [getManualAnchorsStorageKey]);

  const persistManualAnchors = useCallback((audioId: string, anchors: Map<string, number>) => {
    try {
      localStorage.setItem(getManualAnchorsStorageKey(audioId), JSON.stringify([...anchors.entries()]));
    } catch {
      // ignore local persistence failures
    }
  }, [getManualAnchorsStorageKey]);

  const loadMultiPassData = useCallback(() => {
    if (!projectId) {
      setMultiPassData(null);
      return;
    }

    try {
      const stored = localStorage.getItem(`whisper-dual-${projectId}`);
      if (!stored) {
        setMultiPassData(null);
        return;
      }

      const parsed = JSON.parse(stored);
      if (parsed.passA && parsed.passB && parsed.comparison) {
        setMultiPassData(parsed);
        return;
      }
    } catch {
      // Ignore malformed local data and clear the panel state.
    }

    setMultiPassData(null);
  }, [projectId]);

  // ── Load data ──
  // Load dual pass data from localStorage (independent of DB data)
  useEffect(() => {
    loadMultiPassData();
  }, [loadMultiPassData, refreshKey]);

  useEffect(() => {
    const handleDualPassUpdated = (event: Event) => {
      const detailProjectId =
        event instanceof CustomEvent && typeof event.detail?.projectId === "string"
          ? event.detail.projectId
          : null;

      if (detailProjectId && detailProjectId !== projectId) return;
      loadMultiPassData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadMultiPassData();
      }
    };

    window.addEventListener("whisper-dual-updated", handleDualPassUpdated);
    window.addEventListener("storage", handleDualPassUpdated);
    window.addEventListener("focus", loadMultiPassData);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("whisper-dual-updated", handleDualPassUpdated);
      window.removeEventListener("storage", handleDualPassUpdated);
      window.removeEventListener("focus", loadMultiPassData);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [projectId, loadMultiPassData]);

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
        const storedManualAnchors = loadStoredManualAnchors(entry.id);

        const sorted = getSortedShots();
        const resolvedAudioDuration = entry.duration_estimate ?? 0;
        setAudioDuration(resolvedAudioDuration);

        const shotTexts = sorted.map((shot) => ({
          id: shot.id,
          text: getShotFragmentText(shot),
        }));

        const strictResults = matchShotsStrictSequential(
          shotTexts,
          words,
          storedManualAnchors.size > 0 ? storedManualAnchors : undefined
        );

        const aligned: AlignedShot[] = sorted.map((shot, idx) => {
          const text = getShotFragmentText(shot);
          const matchResult = strictResults[idx];
          const whisperStartIdx = matchResult?.whisperStartIdx ?? null;
          const isBlocked = matchResult?.blocked ?? false;
          const startTime = tpMap.get(shot.id) ?? (
            whisperStartIdx !== null ? words[whisperStartIdx].start : null
          );

          let endTime: number | null = null;
          for (let j = idx + 1; j < sorted.length; j++) {
            const nextMatch = strictResults[j];
            if (nextMatch?.whisperStartIdx !== null && nextMatch?.whisperStartIdx !== undefined) {
              endTime = words[nextMatch.whisperStartIdx].start;
              break;
            }
            const nextTp = tpMap.get(sorted[j].id);
            if (nextTp !== undefined) {
              endTime = nextTp;
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

          let status: AlignedShot["status"];
          if (storedManualAnchors.has(shot.id)) {
            status = "manual";
          } else if (isBlocked) {
            status = "blocked";
          } else if (whisperStartIdx !== null) {
            status = "ok";
          } else if (startTime !== null) {
            status = "estimated";
          } else {
            status = "missing";
          }

          return {
            shotId: shot.id,
            globalIndex: idx + 1,
            shotText: text,
            whisperStartIdx,
            whisperEndIdx: wEndIdx !== null && wEndIdx >= 0 ? wEndIdx : null,
            startTime,
            endTime,
            status,
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
  }, [projectId, refreshKey, getSortedShots, loadStoredManualAnchors]);

  // ── Stats ──
  const okCount = alignedShots.filter((s) => s.status === "ok" || s.status === "manual").length;
  const manualCount = alignedShots.filter((s) => s.status === "manual").length;
  const estimatedCount = alignedShots.filter((s) => s.status === "estimated").length;
  const blockedCount = alignedShots.filter((s) => s.status === "blocked").length;
  const missingCount = alignedShots.filter((s) => s.status === "missing").length;
  const totalCount = alignedShots.length;
  const firstBlockedShot = alignedShots.find((s) => s.status === "blocked");

  // ── Whisper gap detection ──
  const whisperGaps = useMemo(() => {
    if (whisperWords.length < 2) return [];
    const GAP_THRESHOLD_SEC = 5; // gaps > 5s are suspicious
    const gaps: { afterWordIdx: number; fromTime: number; toTime: number; durationSec: number }[] = [];
    for (let i = 0; i < whisperWords.length - 1; i++) {
      const gapDuration = whisperWords[i + 1].start - whisperWords[i].end;
      if (gapDuration > GAP_THRESHOLD_SEC) {
        gaps.push({
          afterWordIdx: i,
          fromTime: whisperWords[i].end,
          toTime: whisperWords[i + 1].start,
          durationSec: Math.round(gapDuration * 10) / 10,
        });
      }
    }
    return gaps;
  }, [whisperWords]);

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

    const manualAnchors = new Map<string, number>();
    const existingManualStartTimes = new Map<string, number>();
    for (const s of alignedShots) {
      if (s.status === "manual" && s.whisperStartIdx !== null) {
        manualAnchors.set(s.shotId, s.whisperStartIdx);
        if (s.startTime !== null) {
          existingManualStartTimes.set(s.shotId, s.startTime);
        }
      }
    }
    manualAnchors.set(editingShotId, selectionStart);
    persistManualAnchors(audioEntryId, manualAnchors);

    const sorted = getSortedShots();
    const shotTexts = sorted.map((shot) => ({
      id: shot.id,
      text: getShotFragmentText(shot),
    }));
    const strictResults = matchShotsStrictSequential(shotTexts, whisperWords, manualAnchors);

    const resolvedAudioDuration = audioDuration;
    const newAligned: AlignedShot[] = sorted.map((shot, idx) => {
      const text = getShotFragmentText(shot);
      const matchResult = strictResults[idx];
      const whisperStartIdx = matchResult?.whisperStartIdx ?? null;
      const isBlocked = matchResult?.blocked ?? false;
      const startTime = shot.id === editingShotId && whisperStartIdx !== null
        ? whisperWords[whisperStartIdx].start + globalOffset
        : manualAnchors.has(shot.id) && existingManualStartTimes.has(shot.id)
        ? existingManualStartTimes.get(shot.id) ?? null
        : whisperStartIdx !== null
        ? whisperWords[whisperStartIdx].start
        : null;

      let endTime: number | null = null;
      for (let j = idx + 1; j < sorted.length; j++) {
        const nextMatch = strictResults[j];
        if (nextMatch?.whisperStartIdx !== null && nextMatch?.whisperStartIdx !== undefined) {
          endTime = whisperWords[nextMatch.whisperStartIdx].start;
          break;
        }
      }
      if (endTime === null) endTime = resolvedAudioDuration;

      let wEndIdx: number | null = null;
      if (endTime !== null) {
        for (let wi = whisperWords.length - 1; wi >= 0; wi--) {
          if (whisperWords[wi].end <= endTime + 0.05) {
            wEndIdx = wi;
            break;
          }
        }
      }

      let status: AlignedShot["status"];
      if (manualAnchors.has(shot.id)) {
        status = "manual";
      } else if (isBlocked) {
        status = "blocked";
      } else if (whisperStartIdx !== null) {
        status = "ok";
      } else {
        status = "missing";
      }

      return {
        shotId: shot.id,
        globalIndex: idx + 1,
        shotText: text,
        whisperStartIdx,
        whisperEndIdx: wEndIdx !== null && wEndIdx >= 0 ? wEndIdx : null,
        startTime,
        endTime,
        status,
        editing: false,
      };
    });

    const recalculated = recalculateWhisperShotEndTimes(newAligned, resolvedAudioDuration);
    setAlignedShots(recalculated);

    try {
      const timepoints = recalculated
        .filter((s) => s.startTime !== null && s.status !== "missing" && s.status !== "blocked")
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

      const newOk = recalculated.filter((s) => s.status === "ok" || s.status === "manual").length;
      const newBlocked = recalculated.find((s) => s.status === "blocked");
      if (newBlocked) {
        toast.success(`Shot calé — matching repris jusqu'au shot #${newBlocked.globalIndex} (bloqué)`);
        setExpandedShotId(newBlocked.shotId);
      } else {
        toast.success(`Shot calé — ${newOk}/${recalculated.length} shots matchés ✓`);
      }
    } catch (e: any) {
      console.error("[WhisperAlignmentEditor] auto-save error:", e);
      toast.error("Calage appliqué localement mais erreur de sauvegarde");
    }

    setEditingShotId(null);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [editingShotId, selectionStart, selectionEnd, whisperWords, audioEntryId, alignedShots, globalOffset, audioDuration, getSortedShots, persistManualAnchors]);

  // ── Save all to DB ──
  const saveAllTimepoints = useCallback(async () => {
    if (!audioEntryId) return;
    setSaving(true);
    try {
      const timepoints = alignedShots
        .filter((s) => (s.status === "ok" || s.status === "manual" || s.status === "estimated") && s.startTime !== null)
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
    return alignedShots.some((s) => (s.status === "ok" || s.status === "manual" || s.status === "estimated") && s.startTime !== null);
  }, [alignedShots]);

  if (totalCount === 0 && !loading && !multiPassData) return null;

  return (
    <details className="rounded border border-border bg-card">
      <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors px-3 py-2 min-h-[44px] sm:min-h-0 flex items-center gap-1.5">
        <Search className="h-3 w-3 shrink-0" />
        <span>Alignement Whisper par shot</span>
        {totalCount > 0 && (
          <span
            className={`ml-auto text-[9px] font-bold ${
                blockedCount > 0 ? "text-destructive" : missingCount > 0 ? "text-destructive" : estimatedCount > 0 ? "text-orange-500" : "text-emerald-500"
            }`}
          >
            {okCount}/{totalCount}
            {manualCount > 0 && <span className="text-orange-500 ml-1">({manualCount} manuels)</span>}
            {estimatedCount > 0 && <span className="text-orange-500 ml-1">({estimatedCount} estimés)</span>}
            {blockedCount > 0 && <span className="text-destructive ml-1">⛔ bloqué shot #{firstBlockedShot?.globalIndex}</span>}
          </span>
        )}
      </summary>

      <div className="p-2 space-y-2">
        {/* Whisper gap warnings */}
        {whisperGaps.length > 0 && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              ⚠️ Trous détectés dans la transcription Whisper ({whisperGaps.length}) — des sections audio n'ont pas été transcrites :
            </p>
            {whisperGaps.map((gap, i) => (
              <p key={i} className="text-[9px] text-amber-700 dark:text-amber-400 font-mono">
                • Trou de {gap.durationSec}s entre {formatTimecode(gap.fromTime)} et {formatTimecode(gap.toTime)}
                {" "}(après mot #{gap.afterWordIdx}: &quot;{whisperWords[gap.afterWordIdx]?.word}&quot;)
              </p>
            ))}
            <p className="text-[9px] text-muted-foreground">
              Les shots correspondants ne pourront pas être calés automatiquement. Relancez l'alignement Whisper ou calez manuellement.
            </p>
          </div>
        )}
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
                        .filter((s) => (s.status === "ok" || s.status === "manual" || s.status === "estimated") && s.startTime !== null)
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

        {/* Recaler sur Whisper button */}
        {!loading && whisperWords.length > 0 && alignedShots.some((s) => s.whisperStartIdx !== null) && (
          <div className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2">
            <GitCompareArrows className="h-3 w-3 text-primary shrink-0" />
            <span className="text-[10px] text-muted-foreground flex-1">
              Remplacer les timecodes Chirp par les timestamps Whisper réels
            </span>
            <Button
              size="sm"
              variant="default"
              className="h-6 text-[9px] px-2"
              disabled={saving}
              onClick={async () => {
                if (!audioEntryId) return;
                setSaving(true);
                try {
                  const sceneOrderMap = new Map(scenesForSort.map((scene) => [scene.id, scene.scene_order]));
                  const sortedShotSources = [...shots].sort((a, b) => {
                    const sceneOrderA = sceneOrderMap.get(a.scene_id) ?? 0;
                    const sceneOrderB = sceneOrderMap.get(b.scene_id) ?? 0;
                    if (sceneOrderA !== sceneOrderB) return sceneOrderA - sceneOrderB;
                    return a.shot_order - b.shot_order;
                  });

                  const shotTexts = sortedShotSources.map((shot) => ({
                    id: shot.id,
                    text: getShotFragmentText(shot),
                  }));

                  const manualAnchors = new Map<string, number>();
                  for (const s of alignedShots) {
                    if (s.status === "manual" && s.whisperStartIdx !== null) {
                      manualAnchors.set(s.shotId, s.whisperStartIdx);
                    }
                  }

                  const strictResults = matchShotsStrictSequential(
                    shotTexts,
                    whisperWords,
                    manualAnchors.size > 0 ? manualAnchors : undefined
                  );

                  const strictMatchMap = new Map(strictResults.map((result) => [result.shotId, result]));
                  const repairedTimepoints = buildRepairedShotTimepoints({
                    shots: sortedShotSources,
                    scenesForSort,
                    whisperWords,
                    existingTimepoints: alignedShots
                      .filter((s) => s.startTime !== null)
                      .map((s, idx) => ({ shotId: s.shotId, shotIndex: idx, timeSeconds: s.startTime! })),
                    audioDuration,
                  });

                  const repairedMap = new Map(repairedTimepoints.map((tp) => [tp.shotId, tp.timeSeconds]));
                  const recalculated = recalculateWhisperShotEndTimes(
                    alignedShots.map((s) => {
                      const strictMatch = strictMatchMap.get(s.shotId);
                      const whisperStartIdx = strictMatch?.whisperStartIdx ?? null;
                      const isBlocked = strictMatch?.blocked ?? false;
                      const startTime = whisperStartIdx !== null
                        ? whisperWords[whisperStartIdx]?.start ?? repairedMap.get(s.shotId) ?? s.startTime
                        : repairedMap.get(s.shotId) ?? null;

                      let status: AlignedShot["status"];
                      if (manualAnchors.has(s.shotId)) {
                        status = "manual";
                      } else if (isBlocked) {
                        status = "blocked";
                      } else if (whisperStartIdx !== null) {
                        status = "ok";
                      } else if (startTime !== null) {
                        status = "estimated";
                      } else {
                        status = "missing";
                      }

                      return {
                        ...s,
                        whisperStartIdx,
                        startTime,
                        status,
                      };
                    }),
                    audioDuration
                  ).map((s) => {
                    let whisperEndIdx: number | null = null;
                    if (s.whisperStartIdx !== null && s.endTime !== null) {
                      for (let wi = whisperWords.length - 1; wi >= 0; wi--) {
                        if (whisperWords[wi].end <= s.endTime + 0.05) {
                          whisperEndIdx = wi;
                          break;
                        }
                      }
                    }
                    return {
                      ...s,
                      whisperEndIdx,
                    };
                  });
                  setAlignedShots(recalculated);

                  const { error } = await supabase
                    .from("vo_audio_history")
                    .update({ shot_timepoints: repairedTimepoints as any })
                    .eq("id", audioEntryId);

                  if (error) throw error;

                  const blockedShot = recalculated.find((s) => s.status === "blocked");
                  toast.success(
                    blockedShot
                      ? `${repairedTimepoints.length} shots recalés — bloqué au shot #${blockedShot.globalIndex}`
                      : `${repairedTimepoints.length} shots recalés sur Whisper`
                  );
                } catch (e: any) {
                  console.error("[WhisperAlignmentEditor] recaler error:", e);
                  toast.error("Erreur lors du recalage Whisper");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Recaler sur Whisper"}
            </Button>
          </div>
        )}

        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
          </p>
        )}

        {/* Triple pass trigger button */}
        {!loading && (
          <div className="flex items-center gap-2 rounded border border-dashed border-border bg-muted/20 px-3 py-2">
            <GitCompareArrows className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground flex-1">
              {multiPassData ? `Triple passe du ${new Date(multiPassData.timestamp || "").toLocaleString("fr-FR")}` : "Aucune comparaison multi-passe disponible."}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[9px] px-2"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const { data: audioData } = await supabase
                    .from("vo_audio_history")
                    .select("file_path")
                    .eq("project_id", projectId)
                    .eq("style", "chirp3hd")
                    .order("created_at", { ascending: false })
                    .limit(1);
                  if (!audioData?.[0]?.file_path) {
                    toast.error("Aucun audio Chirp trouvé pour ce projet");
                    return;
                  }
                  const { data: urlData } = await supabase.storage
                    .from("vo-audio")
                    .createSignedUrl(audioData[0].file_path, 600);
                  if (!urlData?.signedUrl) {
                    toast.error("Impossible de récupérer l'URL audio");
                    return;
                  }
                  const { data: sessionData } = await supabase.auth.getSession();
                  if (!sessionData?.session) {
                    toast.error("Session expirée");
                    return;
                  }
                  toast.info("Lancement de la triple passe Whisper (3 transcriptions parallèles)…");
                  const resp = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-align`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                        Authorization: `Bearer ${sessionData.session.access_token}`,
                      },
                      body: JSON.stringify({ audioUrl: urlData.signedUrl, projectId, triplePass: true }),
                    }
                  );
                  if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err?.error || `Erreur ${resp.status}`);
                  }
                  const result = await resp.json();
                  if (result.passA && result.passB && result.dualPassComparison) {
                    const stored = {
                      passA: result.passA,
                      passB: result.passB,
                      passC: result.passC || undefined,
                      comparison: result.dualPassComparison,
                      timestamp: new Date().toISOString(),
                    };
                    localStorage.setItem(`whisper-dual-${projectId}`, JSON.stringify(stored));
                    setMultiPassData(stored);
                    const passCount = result.passC ? 3 : 2;
                    toast.success(`${passCount} passes terminées — écart moyen: ${result.dualPassComparison.avgDeltaMs}ms`);
                  } else {
                    toast.warning("La réponse ne contient pas de données multi-passe");
                  }
                } catch (e: any) {
                  console.error("[WhisperAlignmentEditor] triple pass error:", e);
                  toast.error(`Erreur triple passe: ${e.message}`);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {multiPassData ? "Relancer triple passe" : "Lancer triple passe"}
            </Button>
          </div>
        )}

        {/* Multi-pass comparison panel with pass selection */}
        {!loading && multiPassData && (
          <details className="rounded border border-border bg-muted/20 mb-2">
            <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground px-3 py-2 flex items-center gap-1.5">
              <GitCompareArrows className="h-3 w-3 shrink-0" />
              <span>Comparaison {multiPassData.passC ? "triple" : "double"} passe Whisper</span>
              <span className="ml-auto text-[9px] font-mono">
                Δ moy: {multiPassData.comparison.avgDeltaMs}ms · max: {multiPassData.comparison.maxDeltaMs}ms · p95: {multiPassData.comparison.p95DeltaMs}ms
              </span>
            </summary>
            <div className="p-2 space-y-2">
              <div className="text-[9px] text-muted-foreground">
                Passe A : {multiPassData.passA.length} mots · Passe B : {multiPassData.passB.length} mots
                {multiPassData.passC && ` · Passe C : ${multiPassData.passC.length} mots`}
              </div>

              {/* Pass selection buttons */}
              <div className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2">
                <span className="text-[10px] font-medium text-muted-foreground">Utiliser comme référence :</span>
                {(["A", "B", ...(multiPassData.passC ? ["C"] : [])] as const).map((passLabel) => {
                  const passWords = passLabel === "A" ? multiPassData.passA : passLabel === "B" ? multiPassData.passB : multiPassData.passC!;
                  return (
                    <Button
                      key={passLabel}
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-3"
                      disabled={applyingPass}
                      onClick={async () => {
                        setApplyingPass(true);
                        try {
                          if (!audioEntryId) {
                            toast.error("Aucun audio trouvé");
                            return;
                          }
                          // Update whisper_words in DB with selected pass
                          const { error } = await supabase
                            .from("vo_audio_history")
                            .update({ whisper_words: passWords as any })
                            .eq("id", audioEntryId);
                          if (error) throw error;

                          // Update local state
                          setWhisperWords(passWords);

                          // Re-run matching with new words
                          const sorted = getSortedShots();
                          const manualAnchors = loadStoredManualAnchors(audioEntryId);
                          const shotTexts = sorted.map((shot) => ({
                            id: shot.id,
                            text: getShotFragmentText(shot),
                          }));
                          const strictResults = matchShotsStrictSequential(shotTexts, passWords, manualAnchors.size > 0 ? manualAnchors : undefined);

                          const newAligned: AlignedShot[] = sorted.map((shot, idx) => {
                            const text = getShotFragmentText(shot);
                            const matchResult = strictResults[idx];
                            const wsi = matchResult?.whisperStartIdx ?? null;
                            const isBlocked = matchResult?.blocked ?? false;
                            const startTime = wsi !== null ? passWords[wsi].start : null;

                            let endTime: number | null = null;
                            for (let j = idx + 1; j < sorted.length; j++) {
                              const nm = strictResults[j];
                              if (nm?.whisperStartIdx !== null && nm?.whisperStartIdx !== undefined) {
                                endTime = passWords[nm.whisperStartIdx].start;
                                break;
                              }
                            }
                            if (endTime === null) endTime = audioDuration;

                            let status: AlignedShot["status"];
                            if (manualAnchors.has(shot.id)) status = "manual";
                            else if (isBlocked) status = "blocked";
                            else if (wsi !== null) status = "ok";
                            else if (startTime !== null) status = "estimated";
                            else status = "missing";

                            return { shotId: shot.id, globalIndex: idx + 1, shotText: text, whisperStartIdx: wsi, whisperEndIdx: null, startTime, endTime, status, editing: false };
                          });

                          const recalculated = recalculateWhisperShotEndTimes(newAligned, audioDuration);
                          setAlignedShots(recalculated);

                          // Save timepoints
                          const timepoints = recalculated
                            .filter((s) => s.startTime !== null && s.status !== "missing" && s.status !== "blocked")
                            .map((s, i) => ({ shotId: s.shotId, shotIndex: i, timeSeconds: s.startTime }));
                          await supabase.from("vo_audio_history").update({ shot_timepoints: timepoints as any }).eq("id", audioEntryId);

                          const okN = recalculated.filter((s) => s.status === "ok" || s.status === "manual").length;
                          toast.success(`Passe ${passLabel} appliquée comme référence — ${okN}/${recalculated.length} shots matchés`);
                        } catch (e: any) {
                          console.error("[WhisperAlignmentEditor] apply pass error:", e);
                          toast.error(`Erreur: ${e.message}`);
                        } finally {
                          setApplyingPass(false);
                        }
                      }}
                    >
                      {applyingPass ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Passe {passLabel} ({(passLabel === "A" ? multiPassData.passA : passLabel === "B" ? multiPassData.passB : multiPassData.passC!).length} mots)
                    </Button>
                  );
                })}
              </div>

              {multiPassData.comparison.biggestDiffs.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground mb-1">
                    Plus gros écarts (top {multiPassData.comparison.biggestDiffs.length})
                  </p>
                  <div className="overflow-auto max-h-[200px] rounded border border-border">
                    <table className="w-full text-[9px]">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">#</th>
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">Mot</th>
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">Passe A</th>
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">Passe B</th>
                          {multiPassData.passC && <th className="px-2 py-1 text-right font-medium text-muted-foreground">Passe C</th>}
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">Δ max ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiPassData.comparison.biggestDiffs.map((d, i) => {
                          const cStart = multiPassData.passC?.[d.index]?.start;
                          const allStarts = [d.startA, d.startB, ...(cStart !== undefined ? [cStart] : [])];
                          const maxDelta = Math.round((Math.max(...allStarts) - Math.min(...allStarts)) * 1000);
                          return (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-2 py-0.5 font-mono text-muted-foreground">{d.index}</td>
                              <td className="px-2 py-0.5 font-medium text-foreground">{d.word}</td>
                              <td className="px-2 py-0.5 text-right font-mono">{d.startA.toFixed(3)}s</td>
                              <td className="px-2 py-0.5 text-right font-mono">{d.startB.toFixed(3)}s</td>
                              {multiPassData.passC && <td className="px-2 py-0.5 text-right font-mono">{cStart !== undefined ? `${cStart.toFixed(3)}s` : "—"}</td>}
                              <td className={`px-2 py-0.5 text-right font-mono font-bold ${
                                maxDelta > 100 ? "text-destructive" : maxDelta > 50 ? "text-orange-500" : "text-emerald-500"
                              }`}>{maxDelta}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <details className="rounded border border-border">
                <summary className="text-[9px] font-medium text-muted-foreground cursor-pointer px-2 py-1">
                  Comparaison mot à mot ({Math.min(multiPassData.passA.length, multiPassData.passB.length, multiPassData.passC?.length ?? Infinity)} mots)
                </summary>
                <div className="overflow-auto max-h-[300px]">
                  <table className="w-full text-[9px]">
                    <thead className="sticky top-0">
                      <tr className="bg-muted border-b border-border">
                        <th className="px-1.5 py-1 text-left font-medium text-muted-foreground w-8">#</th>
                        <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">Mot A</th>
                        <th className="px-1.5 py-1 text-right font-medium text-muted-foreground">A</th>
                        <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">Mot B</th>
                        <th className="px-1.5 py-1 text-right font-medium text-muted-foreground">B</th>
                        {multiPassData.passC && <>
                          <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">Mot C</th>
                          <th className="px-1.5 py-1 text-right font-medium text-muted-foreground">C</th>
                        </>}
                        <th className="px-1.5 py-1 text-right font-medium text-muted-foreground">Δ max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.min(multiPassData.passA.length, multiPassData.passB.length, multiPassData.passC?.length ?? Infinity) }).map((_, i) => {
                        const wA = multiPassData.passA[i];
                        const wB = multiPassData.passB[i];
                        const wC = multiPassData.passC?.[i];
                        const allStarts = [wA.start, wB.start, ...(wC ? [wC.start] : [])];
                        const maxDelta = Math.round((Math.max(...allStarts) - Math.min(...allStarts)) * 1000);
                        const wordMismatch = wA.word.toLowerCase() !== wB.word.toLowerCase() || (wC && wC.word.toLowerCase() !== wA.word.toLowerCase());
                        return (
                          <tr key={i} className={`border-b border-border/30 ${wordMismatch ? "bg-orange-500/10" : ""}`}>
                            <td className="px-1.5 py-0.5 font-mono text-muted-foreground">{i}</td>
                            <td className={`px-1.5 py-0.5 ${wordMismatch ? "text-orange-500 font-bold" : "text-foreground"}`}>{wA.word}</td>
                            <td className="px-1.5 py-0.5 text-right font-mono">{wA.start.toFixed(3)}</td>
                            <td className={`px-1.5 py-0.5 ${wordMismatch ? "text-orange-500 font-bold" : "text-foreground"}`}>{wB.word}</td>
                            <td className="px-1.5 py-0.5 text-right font-mono">{wB.start.toFixed(3)}</td>
                            {wC && <>
                              <td className={`px-1.5 py-0.5 ${wC.word.toLowerCase() !== wA.word.toLowerCase() ? "text-orange-500 font-bold" : "text-foreground"}`}>{wC.word}</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">{wC.start.toFixed(3)}</td>
                            </>}
                            {!wC && multiPassData.passC && <>
                              <td className="px-1.5 py-0.5 text-muted-foreground">—</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">—</td>
                            </>}
                            <td className={`px-1.5 py-0.5 text-right font-mono font-bold ${
                              maxDelta > 100 ? "text-destructive" : maxDelta > 50 ? "text-orange-500" : "text-emerald-500"
                            }`}>{maxDelta}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
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
                      shot.status === "blocked"
                        ? "border-destructive bg-destructive/10 ring-2 ring-destructive/40"
                        : shot.status === "manual"
                        ? "border-orange-500/30 bg-orange-500/5"
                        : shot.status === "ok"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : shot.status === "estimated"
                        ? "border-orange-500/30 bg-orange-500/5"
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
                      {shot.status === "blocked" ? (
                        <XCircle className="h-3 w-3 text-destructive shrink-0 animate-pulse" />
                      ) : shot.status === "manual" ? (
                        <CheckCircle2 className="h-3 w-3 text-orange-500 shrink-0" />
                      ) : shot.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      ) : shot.status === "estimated" ? (
                        <Clock className="h-3 w-3 text-orange-500 shrink-0" />
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
                         {shot.status === "blocked" ? (
                            <p className="text-destructive font-semibold">
                              ⛔ Matching bloqué ici — les 3 premiers mots n'ont pas été trouvés dans les 50 mots suivants du transcript Whisper.
                              Calez manuellement ce shot pour que le matching automatique reprenne.
                            </p>
                          ) : shot.whisperStartIdx !== null && shot.whisperEndIdx !== null ? (
                             <p className="text-emerald-600 leading-relaxed whitespace-pre-wrap break-words">
                              {getWhisperSegment(shot.whisperStartIdx, shot.whisperEndIdx)}
                            </p>
                          ) : shot.startTime !== null ? (
                            <p className="text-orange-500 italic">Timecode conservé, mais aucune correspondance Whisper automatique.</p>
                          ) : (
                            <p className="text-destructive italic">Aucune correspondance trouvée</p>
                          )}
                        </div>

                        {/* Diagnostic: tokenized source vs nearby whisper */}
                        {shot.whisperStartIdx === null && (
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
                                        .filter((s) => (s.status === "ok" || s.status === "manual" || s.status === "estimated") && s.startTime !== null)
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
                                        .filter((s) => (s.status === "ok" || s.status === "manual" || s.status === "estimated") && s.startTime !== null)
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
                            variant={shot.status === "blocked" || shot.status === "missing" ? "destructive" : "outline"}
                            className={`h-7 text-[10px] ${shot.status === "blocked" ? "animate-pulse" : ""}`}
                            onClick={() => startEditing(shot.shotId)}
                          >
                            <Search className="h-3 w-3 mr-1" />
                            {shot.status === "blocked"
                              ? "⛔ Caler manuellement pour continuer"
                              : shot.status === "missing"
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
