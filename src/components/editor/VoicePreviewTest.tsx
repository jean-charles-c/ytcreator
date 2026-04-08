import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Play, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type VoiceSettings, STYLE_PRESETS } from "./VoiceSettingsPanel";

interface VoicePreviewTestProps {
  settings: VoiceSettings;
  hideHeader?: boolean;
}

export default function VoicePreviewTest({ settings, hideHeader }: VoicePreviewTestProps) {
  const [testText, setTestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [customPronunciations, setCustomPronunciations] = useState<{ phrase: string; pronunciation: string }[]>([]);

  useEffect(() => {
    const loadPronunciations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("custom_pronunciations")
        .select("phrase, pronunciation")
        .eq("user_id", user.id);
      if (data) setCustomPronunciations(data);
    };
    loadPronunciations();
  }, []);

  const isChirpVoice = (name?: string) =>
    !!name && /chirp/i.test(name);

  const handlePreview = async () => {
    const text = testText.trim();
    if (!text) {
      toast.error("Saisissez un court texte à tester.");
      return;
    }

    const previewText = text.slice(0, 1000);
    const useChirp = isChirpVoice(settings.voiceName);

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (useChirp && !accessToken) {
        throw new Error("Vous devez être connecté pour tester une voix Chirp.");
      }

      const endpoint = useChirp ? "generate-tts-chirp3hd" : "generate-tts";
      const body = useChirp
        ? {
            text: previewText,
            projectId: "preview",
            voiceName: settings.voiceName,
            customFileName: "preview",
            speakingRate: settings.speakingRate + (STYLE_PRESETS[settings.style]?.rateOffset || 0),
            pitch: (settings.pitch || 0) + (STYLE_PRESETS[settings.style]?.pitch || 0),
            pauseBetweenParagraphs: settings.pauseBetweenParagraphs ?? 0,
            pauseAfterSentences: settings.pauseAfterSentences ?? 0,
            pauseAfterComma: settings.pauseAfterComma ?? 0,
            customPronunciations,
          }
        : {
            text: previewText,
            languageCode: settings.languageCode,
            voiceGender: settings.voiceGender,
            voiceName: settings.voiceName || undefined,
            voiceType: settings.voiceType,
            speakingRate: settings.speakingRate + (STYLE_PRESETS[settings.style]?.rateOffset || 0),
            pitch: (settings.pitch || 0) + (STYLE_PRESETS[settings.style]?.pitch || 0),
            volumeGainDb: settings.volumeGainDb,
            effectsProfileId: settings.effectsProfileId !== "none" ? settings.effectsProfileId : undefined,
            pauseBetweenParagraphs: settings.pauseBetweenParagraphs,
            pauseAfterSentences: settings.pauseAfterSentences,
            pauseAfterComma: settings.pauseAfterComma,
            dynamicPauseEnabled: settings.dynamicPauseEnabled,
            dynamicPauseVariation: settings.dynamicPauseVariation,
            sentenceStartBoost: settings.sentenceStartBoost,
            sentenceEndSlow: settings.sentenceEndSlow,
            narrationProfile: settings.narrationProfile,
            style: settings.style,
          };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      const audioUrl = useChirp
        ? data.audioUrl
        : `data:audio/mpeg;base64,${data.audioContent}`;
      toast.success(`Voix appliquée: ${useChirp ? data.voiceName : (data.usedVoiceName ?? "automatique")}`);

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlaying(true);

      audio.onended = () => {
        setPlaying(false);
        audioRef.current = null;
      };

      await audio.play();
    } catch (e: any) {
      console.error("Preview TTS error:", e);
      toast.error(e?.message || "Erreur de prévisualisation");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
  };

  return (
    <div className={hideHeader ? "space-y-3" : "rounded-lg border border-border bg-card p-4 space-y-3"}>
      {!hideHeader && (
        <h3 className="font-display text-sm font-semibold text-foreground">
          Test rapide
        </h3>
      )}
      <Textarea
        value={testText}
        onChange={(e) => setTestText(e.target.value)}
        placeholder="Saisissez un texte pour tester la voix..."
        className="min-h-[120px] text-sm resize-y"
        aria-label="Texte de test vocal"
      />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {testText.length} caractères
        </span>
        <div className="flex gap-2 w-full sm:w-auto">
          {playing && (
            <Button variant="destructive" size="sm" onClick={handleStop} className="min-h-[44px] sm:min-h-[36px] flex-1 sm:flex-none">
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={loading || !testText.trim()}
            className="min-h-[44px] sm:min-h-[36px] flex-1 sm:flex-none"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {loading ? "Génération..." : "Écouter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
