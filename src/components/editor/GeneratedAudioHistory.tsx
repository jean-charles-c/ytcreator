import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, Trash2, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

interface GeneratedAudioHistoryProps {
  projectId: string | null;
  refreshKey: number;
  onPlay: (audioUrl: string, fileName: string, duration: number) => void;
  hideHeader?: boolean;
}

export default function GeneratedAudioHistory({ projectId, refreshKey, onPlay, hideHeader }: GeneratedAudioHistoryProps) {
  const [entries, setEntries] = useState<AudioEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("vo-audio")
        .remove([entry.file_path]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
      }

      // Delete from DB
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
          {entries.map((entry) => (
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
                </div>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                  {formatDate(entry.created_at)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
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
          ))}
        </div>
      )}
    </div>
  );
}
