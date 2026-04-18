import { useState, useEffect, useCallback } from "react";
import { Play, Download, Trash2, Clock, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getShotFragmentText } from "./voiceOverShotSync";

interface AudioEntry {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  duration_estimate: number;
  language_code: string;
  voice_gender: string;
  style: string;
  speaking_rate: number;
  text_length: number;
  created_at: string;
  whisper_words?: any;
}

interface ShotForAlignment {
  id: string;
  scene_id: string;
  shot_order: number;
  source_sentence: string | null;
  source_sentence_fr: string | null;
  description: string;
}

interface GeneratedAudioHistoryProps {
  projectId: string | null;
  refreshKey: number;
  onPlay: (audioUrl: string, fileName: string, duration: number) => void;
  hideHeader?: boolean;
  shots?: ShotForAlignment[];
  scenesForSort?: { id: string; scene_order: number }[];
}

export default function GeneratedAudioHistory({
  projectId,
  refreshKey,
  onPlay,
  hideHeader,
  shots,
  scenesForSort,
}: GeneratedAudioHistoryProps) {
  const [entries, setEntries] = useState<AudioEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [aligningId, setAligningId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("vo_audio_history")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch VO history error:", error);
    } else {
      setEntries(data ?? []);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  const handleDelete = async (entry: AudioEntry) => {
    setDeletingId(entry.id);
    try {
      const { error: storageError } = await supabase.storage
        .from("vo-audio")
        .remove([entry.file_path]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
      }

      const { error: dbError } = await (supabase as any)
        .from("vo_audio_history")
        .delete()
        .eq("id", entry.id);

      if (dbError) {
        throw new Error(dbError.message);
      }

      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success("Audio supprimé");
    } catch (e: any) {
      console.error("Delete error:", e);
      toast.error(e?.message || "Erreur de suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (entry: AudioEntry) => {
    try {
      const { data } = supabase.storage.from("vo-audio").getPublicUrl(entry.file_path, {
        download: entry.file_name,
      });
      window.open(data.publicUrl, "_blank");
    } catch (e: any) {
      console.error("Download error:", e);
      toast.error(e?.message || "Erreur de téléchargement");
    }
  };

  const handlePlay = (entry: AudioEntry) => {
    const { data } = supabase.storage.from("vo-audio").getPublicUrl(entry.file_path);
    onPlay(data.publicUrl, entry.file_name, entry.duration_estimate);
  };

  const handleAlignWhisper = async (entry: AudioEntry) => {
    if (!projectId) return;
    setAligningId(entry.id);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        toast.error("Vous devez être connecté.");
        return;
      }

      const { data: urlData } = supabase.storage.from("vo-audio").getPublicUrl(entry.file_path);
      const audioUrl = urlData.publicUrl;

      toast.info("Lancement de la triple passe Whisper… (peut prendre 1-2 min)");

      const alignResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-align`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            audioUrl,
            projectId,
            triplePass: true,
            audioHistoryId: entry.id,
          }),
        }
      );

      if (!alignResponse.ok) {
        const alignErr = await alignResponse.json().catch(() => ({}));
        throw new Error(alignErr?.error || `Alignement échoué (${alignResponse.status})`);
      }

      const alignData = await alignResponse.json();

      // Persist whisper_words on this specific entry
      if (alignData.alignmentRun?.words) {
        await (supabase as any)
          .from("vo_audio_history")
          .update({ whisper_words: alignData.alignmentRun.words })
          .eq("id", entry.id);
      }

      // Persist multi-pass data for the comparison panel
      if (alignData.passA && alignData.passB) {
        localStorage.setItem(
          `whisper-dual-${projectId}`,
          JSON.stringify({
            passA: alignData.passA,
            passB: alignData.passB,
            passC: alignData.passC ?? null,
            comparison: alignData.dualPassComparison ?? null,
            timestamp: new Date().toISOString(),
          })
        );
        window.dispatchEvent(
          new CustomEvent("whisper-dual-updated", { detail: { projectId } })
        );
      }

      toast.success(`Alignement terminé — ${alignData.wordCount ?? "?"} mots détectés.`);

      // Optional shot mapping if shots are provided
      if (alignData.alignmentRun && shots && shots.length > 0) {
        toast.info("Mapping des timecodes vers les shots…");
        const orderMap = new Map(scenesForSort?.map((s) => [s.id, s.scene_order]) ?? []);
        const sortedShots = [...shots].sort((a, b) => {
          const sa = orderMap.get(a.scene_id) ?? 0;
          const sb = orderMap.get(b.scene_id) ?? 0;
          if (sa !== sb) return sa - sb;
          return a.shot_order - b.shot_order;
        });
        const shotSources = sortedShots
          .map((s) => ({ shotId: s.id, text: getShotFragmentText(s) }))
          .filter((s) => s.text.length > 0);

        const mapResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chirp-shot-mapping`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              alignmentRun: alignData.alignmentRun,
              shots: shotSources,
              projectId,
              audioHistoryId: entry.id,
            }),
          }
        );

        if (mapResponse.ok) {
          const mapData = await mapResponse.json();
          const exact = mapData.shotTimelines?.filter((s: any) => s.status === "exact").length ?? 0;
          const total = mapData.shotTimelines?.length ?? 0;
          if (exact === total) {
            toast.success(`Mapping parfait — ${exact}/${total} shots calés.`);
          } else {
            toast.warning(`Mapping partiel — ${exact}/${total} shots calés.`);
          }
        } else {
          toast.warning("Mapping des shots échoué.");
        }
      }

      // Notify WhisperAlignmentEditor that whisper_words changed for this entry,
      // so it reloads the fresh transcript instead of showing the stale one.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("vo-audio-timepoints-updated", {
            detail: { projectId, audioEntryId: entry.id },
          })
        );
      }

      await fetchHistory();
    } catch (e: any) {
      console.error("Align error:", e);
      toast.error(e?.message || "Erreur d'alignement Whisper");
    } finally {
      setAligningId(null);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const genderLabel = (g: string) => {
    if (g === "FEMALE") return "F";
    if (g === "MALE") return "M";
    return "N";
  };

  if (!projectId) return null;

  return (
    <div className={hideHeader ? "space-y-3" : "rounded-lg border border-border bg-card p-4 space-y-3"}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Historique des audios
          </h3>
          {entries.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {entries.length} fichier{entries.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground/50 text-center py-4">
          Aucun audio généré pour ce projet.
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2 sm:space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-1">
          {entries.map((entry) => {
            const hasAlignment = !!entry.whisper_words;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 sm:gap-2 rounded border border-border bg-background p-3 sm:p-2.5 group hover:border-primary/30 transition-colors"
              >
                {/* Play button */}
                <button
                  onClick={() => handlePlay(entry)}
                  className="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
                  aria-label={`Lire ${entry.file_name}`}
                >
                  <Play className="h-4 w-4 sm:h-3.5 sm:w-3.5 ml-0.5" />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {entry.file_name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDuration(entry.duration_estimate)}
                    </span>
                    <span>{formatSize(entry.file_size)}</span>
                    <span>{entry.language_code}</span>
                    <span>{genderLabel(entry.voice_gender)}</span>
                    <span>{entry.speaking_rate}x</span>
                    {hasAlignment && (
                      <span className="text-primary font-medium">✓ aligné</span>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                    {formatDate(entry.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAlignWhisper(entry)}
                    disabled={aligningId === entry.id}
                    className={`h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded transition-colors disabled:opacity-50 ${
                      hasAlignment
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                    }`}
                    aria-label={`Aligner Whisper ${entry.file_name}`}
                    title={hasAlignment ? "Réaligner Whisper (triple passe)" : "Aligner Whisper (triple passe)"}
                  >
                    {aligningId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDownload(entry)}
                    className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label={`Télécharger ${entry.file_name}`}
                    title="Télécharger"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={deletingId === entry.id}
                    className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    aria-label={`Supprimer ${entry.file_name}`}
                    title="Supprimer"
                  >
                    {deletingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
