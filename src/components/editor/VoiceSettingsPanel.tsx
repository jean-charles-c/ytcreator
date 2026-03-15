import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VoiceSettings {
  languageCode: string;
  voiceGender: "MALE" | "FEMALE" | "NEUTRAL";
  voiceType: string; // "Standard" | "Wavenet" | "Neural2"
  style: string; // tone preset
  speakingRate: number;
}

// Style presets → pitch + speakingRate adjustments sent to Google TTS
export const STYLE_PRESETS: Record<string, { pitch: number; rateOffset: number; label: string }> = {
  neutral:    { pitch: 0,    rateOffset: 0,    label: "Neutre" },
  warm:       { pitch: -1.5, rateOffset: -0.05, label: "Chaleureux" },
  calm:       { pitch: -2,   rateOffset: -0.1,  label: "Calme" },
  energetic:  { pitch: 2,    rateOffset: 0.1,   label: "Énergique" },
  serious:    { pitch: -3,   rateOffset: -0.05, label: "Sérieux" },
  cheerful:   { pitch: 3,    rateOffset: 0.05,  label: "Joyeux" },
};

const VOICE_TYPES = [
  { value: "Standard", label: "Standard", desc: "Basique — gratuit" },
  { value: "Wavenet", label: "WaveNet", desc: "Naturelle — haute qualité" },
  { value: "Neural2", label: "Neural2", desc: "Très naturelle — premium" },
];

// Voice name letter mapping per language+gender (most reliable voices)
const VOICE_LETTER_MAP: Record<string, Record<string, string>> = {
  "fr-FR": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  "en-US": { FEMALE: "C", MALE: "D", NEUTRAL: "C" },
  "en-GB": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  "es-ES": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  "de-DE": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  "it-IT": { FEMALE: "A", MALE: "C", NEUTRAL: "A" },
  "pt-BR": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  "ja-JP": { FEMALE: "A", MALE: "C", NEUTRAL: "A" },
  "ar-XA": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
};

// Languages that support Neural2
const NEURAL2_LANGS = new Set(["fr-FR", "en-US", "en-GB", "de-DE", "it-IT", "pt-BR", "ja-JP", "es-US"]);

export function getVoiceName(lang: string, gender: string, voiceType: string): string {
  const letter = VOICE_LETTER_MAP[lang]?.[gender] || "A";
  return `${lang}-${voiceType}-${letter}`;
}

export function getAvailableVoiceTypes(lang: string) {
  const types = VOICE_TYPES.filter(t => t.value !== "Neural2" || NEURAL2_LANGS.has(lang));
  return types;
}

interface VoiceSettingsPanelProps {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
  hasFavorite?: boolean;
  hideHeader?: boolean;
}

const LANGUAGES = [
  { value: "fr-FR", label: "Français" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ar-XA", label: "العربية" },
];

const GENDERS = [
  { value: "FEMALE", label: "Féminin" },
  { value: "MALE", label: "Masculin" },
  { value: "NEUTRAL", label: "Neutre" },
];

export default function VoiceSettingsPanel({ settings, onChange, hasFavorite, hideHeader }: VoiceSettingsPanelProps) {
  const [savingFavorite, setSavingFavorite] = useState(false);
  const update = (patch: Partial<VoiceSettings>) => onChange({ ...settings, ...patch });

  const handleSaveFavorite = async () => {
    setSavingFavorite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Non connecté"); return; }

      // Upsert favorite (unique on user_id)
      const { error } = await (supabase as any)
        .from("favorite_voice_profile")
        .upsert(
          {
            user_id: user.id,
            language_code: settings.languageCode,
            voice_gender: settings.voiceGender,
            style: settings.voiceType,
            speaking_rate: settings.speakingRate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      toast.success("Voix favorite enregistrée");
    } catch (e: any) {
      console.error("Save favorite error:", e);
      toast.error(e?.message || "Erreur de sauvegarde");
    } finally {
      setSavingFavorite(false);
    }
  };

  return (
    <div className={hideHeader ? "space-y-4" : "rounded-lg border border-border bg-card p-4 space-y-4"}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Paramètres de voix
          </h3>
          {hasFavorite && (
            <span className="flex items-center gap-1 text-[10px] text-primary">
              <Star className="h-2.5 w-2.5 fill-primary" /> Favori chargé
            </span>
          )}
        </div>
      )}

      {/* Language */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-lang" className="text-xs text-muted-foreground">Langue</Label>
        <Select value={settings.languageCode} onValueChange={(v) => update({ languageCode: v })}>
          <SelectTrigger id="vo-lang" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Gender */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-gender" className="text-xs text-muted-foreground">Genre</Label>
        <Select value={settings.voiceGender} onValueChange={(v) => update({ voiceGender: v as VoiceSettings["voiceGender"] })}>
          <SelectTrigger id="vo-gender" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Type */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-type" className="text-xs text-muted-foreground">Type de voix</Label>
        <Select value={settings.voiceType} onValueChange={(v) => update({ voiceType: v })}>
          <SelectTrigger id="vo-type" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAvailableVoiceTypes(settings.languageCode).map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">
                  {t.label}
                  <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground/60">
          Voix : {getVoiceName(settings.languageCode, settings.voiceGender, settings.voiceType)}
        </p>
      </div>

      {/* Speaking Rate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Vitesse</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.speakingRate.toFixed(1)}x</span>
        </div>
        <Slider
          min={0.5} max={2.0} step={0.1}
          value={[settings.speakingRate]}
          onValueChange={([v]) => update({ speakingRate: v })}
          aria-label="Vitesse de la voix"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Lent</span><span>Normal</span><span>Rapide</span>
        </div>
      </div>

      {/* Save as favorite */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSaveFavorite}
        disabled={savingFavorite}
        className="w-full min-h-[36px] gap-1.5 text-xs"
      >
        {savingFavorite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
        Enregistrer comme voix favorite
      </Button>
    </div>
  );
}
