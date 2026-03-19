import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Music,
  Loader2,
  Volume2,
  Pause,
  Play,
  Clock,
  Download,
  Trash2,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface MusicStudioProps {
  projectId: string | null;
  onMusicSelected?: (audioUrl: string, fileName: string) => void;
}

interface MusicEntry {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  duration_seconds: number;
  prompt: string;
  created_at: string;
}

interface PlayerState {
  audioUrl: string;
  fileName: string;
  duration: number;
}

interface ElevenLabsBalance {
  character_count: number;
  character_limit: number;
  tier: string;
}

export default function MusicStudio({ projectId, onMusicSelected }: MusicStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(30);
  const [customFileName, setCustomFileName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [entries, setEntries] = useState<MusicEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [balance, setBalance] = useState<ElevenLabsBalance | null>(null);

  // Player
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load saved settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data } = await supabase
        .from("music_settings" as any)
        .select("*")
        .eq("user_id", session.session.user.id)
        .single();
      if (data) {
        setPrompt((data as any).prompt || "");
        setDuration((data as any).duration_seconds || 30);
      }
    };
    loadSettings();
  }, []);

  // Fetch ElevenLabs balance
  const fetchBalance = useCallback(async () => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-balance`,
        {
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (e) {
      console.error("Balance fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // Save settings on change
  const saveSettings = useCallback(async (newPrompt: string, newDuration: number) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    const userId = session.session.user.id;
    await (supabase as any).from("music_settings").upsert(
      { user_id: userId, prompt: newPrompt, duration_seconds: newDuration, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }, []);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("music_history")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Cleanup audio
  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Décrivez la musique souhaitée."); return; }
    if (!projectId) { toast.error("Sauvegardez d'abord le projet."); return; }

    setGenerating(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) { toast.error("Connectez-vous."); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            duration,
            projectId,
            customFileName: customFileName.trim() || undefined,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();

      setPlayerState({ audioUrl: data.audioUrl, fileName: data.fileName, duration: data.durationSeconds });
      fetchHistory();
      fetchBalance();
      saveSettings(prompt, duration);

      toast.success(`Musique générée — ${data.fileName} (${formatSize(data.fileSize)})`);
    } catch (e: any) {
      console.error("Music generation error:", e);
      toast.error(e?.message || "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  };

  const handlePlay = (entry: MusicEntry) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const { data } = supabase.storage.from("music-audio").getPublicUrl(entry.file_path);
    setPlayerState({ audioUrl: data.publicUrl, fileName: entry.file_name, duration: entry.duration_seconds });
    setIsPlaying(false);
    setAudioProgress(0);
    setTimeout(() => {
      const audio = new Audio(data.publicUrl);
      audioRef.current = audio;
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setPlayerState(prev => prev ? { ...prev, duration: audio.duration } : prev);
        }
      };
      audio.ontimeupdate = () => { if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100); };
      audio.onended = () => { setIsPlaying(false); setAudioProgress(0); };
      audio.play();
      setIsPlaying(true);
    }, 100);
  };

  const handlePlayPause = () => {
    if (!playerState) return;
    if (!audioRef.current) {
      const audio = new Audio(playerState.audioUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => { if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100); };
      audio.onended = () => { setIsPlaying(false); setAudioProgress(0); };
    }
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const handleDownload = (entry: MusicEntry) => {
    const { data } = supabase.storage.from("music-audio").getPublicUrl(entry.file_path, { download: entry.file_name });
    window.open(data.publicUrl, "_blank");
  };

  const handleDelete = async (entry: MusicEntry) => {
    setDeletingId(entry.id);
    try {
      await supabase.storage.from("music-audio").remove([entry.file_path]);
      await (supabase as any).from("music_history").delete().eq("id", entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      if (selectedId === entry.id) { setSelectedId(null); }
      toast.success("Musique supprimée");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = (entry: MusicEntry) => {
    const { data } = supabase.storage.from("music-audio").getPublicUrl(entry.file_path);
    setSelectedId(entry.id);
    onMusicSelected?.(data.publicUrl, entry.file_name);
    toast.success(`"${entry.file_name}" sélectionné pour l'export`);
  };

  return (
    <div className="space-y-4">
      {/* ElevenLabs Balance */}
      {balance && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
          <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Crédits ElevenLabs <span className="text-foreground font-medium capitalize">({balance.tier})</span>
              </span>
              <span className="font-mono text-foreground">
                {balance.character_count.toLocaleString()} / {balance.character_limit.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min((balance.character_count / balance.character_limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Décrivez la musique souhaitée
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); }}
          placeholder="Ex: Cinematic orchestral music with rising tension, strings and brass, dark mood..."
          className="min-h-[100px] text-sm resize-y"
        />
      </div>

      {/* Duration slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Durée</label>
          <span className="text-xs text-muted-foreground font-mono">{duration}s</span>
        </div>
        <Slider
          value={[duration]}
          onValueChange={([v]) => setDuration(v)}
          min={5}
          max={300}
          step={5}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50">
          <span>5s</span>
          <span>5 min</span>
        </div>
      </div>

      {/* File name + Generate */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={customFileName}
          onChange={(e) => setCustomFileName(e.target.value)}
          placeholder="Nom du fichier (optionnel)"
          className="h-10 text-sm flex-1"
        />
        <Button
          variant="hero"
          disabled={!prompt.trim() || generating}
          className="min-h-[48px] sm:min-h-[44px] gap-2 w-full sm:w-auto shrink-0"
          onClick={handleGenerate}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
          {generating ? "Génération..." : "Générer la musique"}
        </Button>
      </div>

      {/* Player */}
      {playerState ? (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">Lecteur</h4>
            <span className="text-[10px] text-muted-foreground font-mono">{formatDuration(playerState.duration)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              {isPlaying ? <Pause className="h-4 w-4 sm:h-3 sm:w-3" /> : <Play className="h-4 w-4 sm:h-3 sm:w-3 ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${audioProgress}%` }} />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{playerState.fileName}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-3 flex items-center justify-center gap-2 min-h-[60px]">
          <Music className="h-4 w-4 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/50">Lecteur musique</p>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Historique des musiques
        </h4>

        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-4">
            Aucune musique générée pour ce projet.
          </p>
        )}

        {entries.length > 0 && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-2 rounded border p-3 sm:p-2.5 group hover:border-primary/30 transition-colors ${
                  selectedId === entry.id ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <button
                  onClick={() => handlePlay(entry)}
                  className="flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
                >
                  <Play className="h-4 w-4 sm:h-3.5 sm:w-3.5 ml-0.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{entry.file_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{entry.prompt}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{formatDuration(entry.duration_seconds)}</span>
                    <span>{formatSize(entry.file_size)}</span>
                    <span>{formatDate(entry.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleSelect(entry)}
                    className={`h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded transition-colors ${
                      selectedId === entry.id
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                    }`}
                    title="Sélectionner pour l'export"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownload(entry)}
                    className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Télécharger"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={deletingId === entry.id}
                    className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    title="Supprimer"
                  >
                    {deletingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
