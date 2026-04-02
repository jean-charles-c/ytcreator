import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Save,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getShotFragmentText } from "./voiceOverShotSync";

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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
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
        const audioDuration = entry.duration_estimate ?? 0;

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
          if (endTime === null) endTime = audioDuration;

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

        setAlignedShots(aligned);
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

    const startTime = whisperWords[selectionStart].start;
    const endTime = whisperWords[selectionEnd].end;

    // Update local state
    const updatedShots = alignedShots.map((s) =>
      s.shotId === editingShotId
        ? {
            ...s,
            whisperStartIdx: selectionStart,
            whisperEndIdx: selectionEnd,
            startTime,
            endTime,
            status: "manual" as const,
          }
        : s
    );
    setAlignedShots(updatedShots);

    // Auto-save to DB immediately
    try {
      const timepoints = updatedShots
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
  }, [editingShotId, selectionStart, selectionEnd, whisperWords, audioEntryId, alignedShots]);

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
          </span>
        )}
      </summary>

      <div className="p-2 space-y-2">
        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
          </p>
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
                        <span className="font-mono text-muted-foreground shrink-0">
                          {formatTime(shot.startTime)}
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

                        {/* Timing info */}
                        {shot.startTime !== null && shot.endTime !== null && (
                          <div className="flex gap-3 font-mono text-muted-foreground">
                            <span>Début: {formatTime(shot.startTime)}</span>
                            <span>Fin: {formatTime(shot.endTime)}</span>
                            <span>
                              Durée: {(shot.endTime - shot.startTime).toFixed(2)}s
                            </span>
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
                              <div className="flex items-center gap-2 text-[10px]">
                                <span className="font-mono text-muted-foreground">
                                  {formatTime(whisperWords[selectionStart].start)} →{" "}
                                  {formatTime(whisperWords[selectionEnd].end)}
                                </span>
                                <span className="text-muted-foreground">
                                  ({selectionEnd - selectionStart + 1} mots)
                                </span>
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
