import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export interface VoiceSettings {
  languageCode: string;
  voiceGender: "MALE" | "FEMALE" | "NEUTRAL";
  style: string;
  speakingRate: number;
}

interface VoiceSettingsPanelProps {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
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

const STYLES = [
  { value: "neutral", label: "Neutre" },
  { value: "calm", label: "Calme" },
  { value: "energetic", label: "Énergique" },
  { value: "warm", label: "Chaleureux" },
  { value: "serious", label: "Sérieux" },
];

export default function VoiceSettingsPanel({ settings, onChange }: VoiceSettingsPanelProps) {
  const update = (patch: Partial<VoiceSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="font-display text-sm font-semibold text-foreground">
        Paramètres de voix
      </h3>

      {/* Language */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-lang" className="text-xs text-muted-foreground">
          Langue
        </Label>
        <Select value={settings.languageCode} onValueChange={(v) => update({ languageCode: v })}>
          <SelectTrigger id="vo-lang" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Gender */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-gender" className="text-xs text-muted-foreground">
          Genre
        </Label>
        <Select
          value={settings.voiceGender}
          onValueChange={(v) => update({ voiceGender: v as VoiceSettings["voiceGender"] })}
        >
          <SelectTrigger id="vo-gender" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Style */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-style" className="text-xs text-muted-foreground">
          Style
        </Label>
        <Select value={settings.style} onValueChange={(v) => update({ style: v })}>
          <SelectTrigger id="vo-style" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STYLES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Speaking Rate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Vitesse</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.speakingRate.toFixed(1)}x</span>
        </div>
        <Slider
          min={0.5}
          max={2.0}
          step={0.1}
          value={[settings.speakingRate]}
          onValueChange={([v]) => update({ speakingRate: v })}
          aria-label="Vitesse de la voix"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Lent</span>
          <span>Normal</span>
          <span>Rapide</span>
        </div>
      </div>
    </div>
  );
}
