import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, Mic, Volume2, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import VoiceSettingsPanel, { type VoiceSettings } from "./VoiceSettingsPanel";
import VoicePreviewTest from "./VoicePreviewTest";
import GeneratedAudioHistory from "./GeneratedAudioHistory";

interface VoiceOverStudioProps {
  narration: string;
  generatedScript: string | null;
  projectId: string | null;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  languageCode: "fr-FR",
  voiceGender: "FEMALE",
  style: "neutral",
  speakingRate: 1.0,
};

interface PlayerState {
  audioUrl: string;
  fileName: string;
  durationEstimate: number;
}

export default function VoiceOverStudio({ narration, generatedScript, projectId }: VoiceOverStudioProps) {
  const [voScript, setVoScript] = useState("");
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [hasFavorite, setHasFavorite] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load favorite voice profile on mount
  useEffect(() => {
    const loadFavorite = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("favorite_voice_profile")
          .select("*")
          .maybeSingle();

        if (!error && data) {
          setSettings({
            languageCode: data.language_code,
            voiceGender: data.voice_gender,
            style: data.style,
            speakingRate: data.speaking_rate,
          });
          setHasFavorite(true);
        }
      } catch (e) {
        console.error("Load favorite voice error:", e);
      }
    };
    loadFavorite();
  }, []);

  const handlePasteFromScript = () => {
    const source = narration;
    if (!source?.trim()) {
      toast.error("Aucun texte disponible dans ScriptInput. Saisissez d'abord votre narration dans l'onglet ScriptInput.");
      return;
    }
    setVoScript(source);
    toast.success("Script collé depuis ScriptInput");
  };

  const handleGenerate = async () => {
    if (!voScript.trim()) {
      toast.error("Saisissez ou collez un script avant de générer.");
      return;
    }
    if (!projectId) {
      toast.error("Sauvegardez d'abord le projet.");
      return;
    }

    setGenerating(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        toast.error("Vous devez être connecté.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            text: voScript,
            languageCode: settings.languageCode,
            voiceGender: settings.voiceGender,
            speakingRate: settings.speakingRate,
            mode: "full",
            projectId,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();

      // Load into player
      setPlayerState({
        audioUrl: data.audioUrl,
        fileName: data.fileName,
        durationEstimate: data.durationEstimate,
      });

      // Refresh history
      setHistoryRefreshKey((k) => k + 1);

      toast.success(`Voix off générée — ${data.chunks} bloc(s), ${formatSize(data.fileSize)}`);
    } catch (e: any) {
      console.error("Full TTS generation error:", e);
      toast.error(e?.message || "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  };

  // Play from history or from generation
  const handlePlayFromHistory = (audioUrl: string, fileName: string, duration: number) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayerState({ audioUrl, fileName, durationEstimate: duration });
    setIsPlaying(false);
    setAudioProgress(0);

    // Auto-play
    setTimeout(() => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
      };
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
      audio.ontimeupdate = () => {
        if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
      };
      audio.onended = () => { setIsPlaying(false); setAudioProgress(0); };
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  // Reset audio element when player state changes
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
    setAudioProgress(0);
  }, [playerState?.audioUrl]);

  return (
    <div className="container max-w-6xl py-4 sm:py-6 lg:py-10 px-3 sm:px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Mic className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg sm:text-xl lg:text-2xl font-semibold text-foreground">
          VO — Voice Over
        </h2>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 lg:mb-8">
        Transformez votre script en fichier audio voice-over.
      </p>

      {/* Mobile: settings first, then script. Desktop: script left, settings right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Right column on desktop — shown FIRST on mobile for quick config */}
        <div className="space-y-3 sm:space-y-4 order-1 lg:order-2">
          <VoiceSettingsPanel settings={settings} onChange={setSettings} hasFavorite={hasFavorite} />
          <VoicePreviewTest settings={settings} />

          {/* Audio player */}
          {playerState ? (
            <div className="rounded-lg border border-border bg-card p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-foreground">Lecteur audio</h3>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatDuration(playerState.durationEstimate)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayPause}
                  className="flex items-center justify-center h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                  aria-label={isPlaying ? "Pause" : "Lecture"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="h-2 sm:h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${audioProgress}%` }} />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{playerState.fileName}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-3 sm:p-4 flex flex-col items-center justify-center gap-2 min-h-[60px] sm:min-h-[80px]">
              <Volume2 className="h-5 w-5 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/50 text-center">Lecteur audio</p>
            </div>
          )}

          {/* History */}
          <GeneratedAudioHistory
            projectId={projectId}
            refreshKey={historyRefreshKey}
            onPlay={handlePlayFromHistory}
          />
        </div>

        {/* Left column — Script (shown SECOND on mobile, FIRST on desktop) */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="vo-script">
              Script narratif
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePasteFromScript}
              className="h-9 sm:h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground min-w-[44px]"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Coller depuis ScriptInput</span>
              <span className="sm:hidden">Coller</span>
            </Button>
          </div>
          <Textarea
            id="vo-script"
            value={voScript}
            onChange={(e) => setVoScript(e.target.value)}
            placeholder="Collez ou saisissez votre texte narratif ici..."
            className="min-h-[200px] sm:min-h-[350px] lg:min-h-[450px] text-sm leading-relaxed resize-y font-body"
            aria-label="Script narratif pour la voix off"
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {voScript.length.toLocaleString()} caractères
            </span>
            <Button
              variant="hero"
              disabled={!voScript.trim() || generating}
              className="min-h-[48px] sm:min-h-[44px] gap-2 w-full sm:w-auto"
              onClick={handleGenerate}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              {generating ? "Génération en cours..." : "Générer la voix off"}
            </Button>
          </div>
        </div>
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
