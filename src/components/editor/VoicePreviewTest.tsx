import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { VoiceSettings } from "./VoiceSettingsPanel";

interface VoicePreviewTestProps {
  settings: VoiceSettings;
  hideHeader?: boolean;
}

export default function VoicePreviewTest({ settings, hideHeader }: VoicePreviewTestProps) {
  const [testText, setTestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async () => {
    const text = testText.trim();
    if (!text) {
      toast.error("Saisissez un court texte à tester.");
      return;
    }

    // Limit preview to 200 chars
    const previewText = text.slice(0, 200);

    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text: previewText,
            languageCode: settings.languageCode,
            voiceGender: settings.voiceGender,
            speakingRate: settings.speakingRate,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;

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
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="font-display text-sm font-semibold text-foreground">
        Test rapide
      </h3>
      <Textarea
        value={testText}
        onChange={(e) => setTestText(e.target.value)}
        placeholder="Saisissez un court texte pour tester la voix (max 200 car.)..."
        className="min-h-[80px] text-sm resize-none"
        maxLength={200}
        aria-label="Texte de test vocal"
      />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {testText.length}/200 caractères
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
