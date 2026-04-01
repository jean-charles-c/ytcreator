import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Star, Loader2, Mic2, Pencil, Check, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VoiceSettings {
  languageCode: string;
  voiceGender: "MALE" | "FEMALE" | "NEUTRAL";
  voiceType: string;
  voiceName: string;
  style: string;
  narrationProfile: "standard" | "storytelling" | "educational";
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
  effectsProfileId: string;
  pauseBetweenParagraphs: number;
  pauseAfterSentences: number;
  pauseAfterComma: number;
  dynamicPauseEnabled: boolean;
  dynamicPauseVariation: number;
  sentenceStartBoost: number;
  sentenceEndSlow: number;
}

export const NARRATION_PROFILES = [
  { value: "standard" as const, label: "Standard", desc: "Équilibre neutre — polyvalent", icon: "⚖️" },
  { value: "storytelling" as const, label: "Storytelling", desc: "Plus vivant — pauses dramatiques", icon: "🎭" },
  { value: "educational" as const, label: "Éducatif", desc: "Articulé — segmentation claire", icon: "🎓" },
];

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
  { value: "Studio", label: "Studio", desc: "Voix studio — très réaliste" },
  { value: "Chirp-HD", label: "Chirp HD", desc: "Haute définition — expressif" },
  { value: "Chirp3-HD", label: "Chirp3 HD", desc: "Dernière génération — ultra naturel" },
  { value: "Polyglot", label: "Polyglot", desc: "Multilingue" },
];

const NEURAL2_LANGS = new Set(["fr-FR", "en-US", "en-GB", "de-DE", "it-IT", "pt-BR", "ja-JP", "es-US"]);

export function getVoiceName(lang: string, gender: string, voiceType: string): string {
  // This is only a fallback — the real voice selection should come from the API list
  const VOICE_LETTER_MAP: Record<string, Record<string, string>> = {
    "fr-FR": { FEMALE: "F", MALE: "G", NEUTRAL: "F" },
    "en-US": { FEMALE: "C", MALE: "D", NEUTRAL: "C" },
    "en-GB": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
    "es-ES": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
    "de-DE": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
    "it-IT": { FEMALE: "A", MALE: "C", NEUTRAL: "A" },
    "pt-BR": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
    "ja-JP": { FEMALE: "A", MALE: "C", NEUTRAL: "A" },
    "ar-XA": { FEMALE: "A", MALE: "B", NEUTRAL: "A" },
  };
  const letter = VOICE_LETTER_MAP[lang]?.[gender] || "A";
  return `${lang}-${voiceType}-${letter}`;
}

export function getAvailableVoiceTypes(lang: string, availableVoices?: VoiceInfo[]) {
  // If we have live voice data, only show types that actually exist for this language
  if (availableVoices && availableVoices.length > 0) {
    const typesInData = new Set(availableVoices.map((v) => v.type));
    return VOICE_TYPES.filter((t) => typesInData.has(t.value));
  }
  // Fallback: show standard types, filter Neural2 by known langs
  return VOICE_TYPES.filter(t => {
    if (t.value === "Neural2") return NEURAL2_LANGS.has(lang);
    // Hide newer types without data
    if (["Studio", "Chirp3-HD", "Chirp-HD", "Polyglot"].includes(t.value)) return false;
    return true;
  });
}

interface VoiceInfo {
  name: string;
  gender: string;
  type: string;
  letter: string;
  sampleRate: number;
}

interface VoiceProfile {
  id: string;
  profile_name: string;
  language_code: string;
  voice_gender: string;
  voice_name: string;
  style: string;
  speaking_rate: number;
  pitch: number;
  volume_gain_db: number;
  effects_profile_id: string;
  pause_between_paragraphs: number;
  pause_after_sentences: number;
  pause_after_comma: number;
  narration_profile: string;
  dynamic_pause_enabled: boolean;
  dynamic_pause_variation: number;
  sentence_start_boost: number;
  sentence_end_slow: number;
}

interface VoiceSettingsPanelProps {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
  hasFavorite?: boolean;
  hideHeader?: boolean;
  onActiveProfileChange?: (profileName: string | null) => void;
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

const STYLES = Object.entries(STYLE_PRESETS).map(([value, { label }]) => ({ value, label }));

const EFFECTS_PROFILES = [
  { value: "none", label: "Aucun (défaut)" },
  { value: "headphone-class-device", label: "🎧 Casque / Écouteurs" },
  { value: "small-bluetooth-speaker-class-device", label: "🔈 Petite enceinte" },
  { value: "medium-bluetooth-speaker-class-device", label: "🔉 Enceinte moyenne" },
  { value: "large-home-entertainment-class-device", label: "🔊 Home cinéma" },
  { value: "handset-class-device", label: "📱 Smartphone" },
  { value: "large-automotive-class-device", label: "🚗 Système auto" },
];

const GENDER_LABELS: Record<string, string> = { MALE: "♂", FEMALE: "♀", NEUTRAL: "◎" };

export default function VoiceSettingsPanel({ settings, onChange, hideHeader, onActiveProfileChange }: VoiceSettingsPanelProps) {
  const [savingProfile, setSavingProfile] = useState(false);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [availableVoices, setAvailableVoices] = useState<VoiceInfo[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const update = (patch: Partial<VoiceSettings>) => onChange({ ...settings, ...patch });

  // Fetch voices when language changes
  const fetchVoices = useCallback(async (lang: string) => {
    setLoadingVoices(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-voices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ languageCode: lang }),
        }
      );
      if (!response.ok) throw new Error("Failed to fetch voices");
      const data = await response.json();
      setAvailableVoices(data.voices ?? []);
    } catch (e) {
      console.error("Fetch voices error:", e);
      setAvailableVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    fetchVoices(settings.languageCode);
  }, [settings.languageCode, fetchVoices]);

  // Load all profiles on mount
  useEffect(() => {
    loadProfiles();
  }, []);

  // Notify parent of active profile name changes
  useEffect(() => {
    const activeName = profiles.find((p) => p.id === activeProfileId)?.profile_name ?? null;
    onActiveProfileChange?.(activeName);
  }, [activeProfileId, profiles, onActiveProfileChange]);

  const loadProfiles = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("favorite_voice_profile")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        setProfiles(data);
        // Auto-select last used if none active
        if (!activeProfileId) {
          const last = data[data.length - 1];
          setActiveProfileId(last.id);
          applyProfile(last);
        }
      }
    } catch (e) {
      console.error("Load profiles error:", e);
    }
  };

  const applyProfile = (p: VoiceProfile) => {
    const rawStyle = p.style || "";
    const parts = rawStyle.split(":");
    const voiceType = ["Standard", "Wavenet", "Neural2", "Studio", "Chirp3-HD", "Chirp-HD", "Polyglot"].includes(parts[0]) ? parts[0] : "Standard";
    const tone = parts[1] && STYLE_PRESETS[parts[1]] ? parts[1] : (STYLE_PRESETS[parts[0]] ? parts[0] : "neutral");
    onChange({
      languageCode: p.language_code,
      voiceGender: p.voice_gender as VoiceSettings["voiceGender"],
      voiceType,
      voiceName: p.voice_name || "",
      style: tone,
      narrationProfile: (p.narration_profile as VoiceSettings["narrationProfile"]) || "standard",
      speakingRate: p.speaking_rate,
      pitch: p.pitch ?? 0,
      volumeGainDb: p.volume_gain_db ?? 0,
      effectsProfileId: p.effects_profile_id ?? "none",
      pauseBetweenParagraphs: p.pause_between_paragraphs ?? 500,
      pauseAfterSentences: p.pause_after_sentences ?? 0,
      pauseAfterComma: p.pause_after_comma ?? 0,
      dynamicPauseEnabled: p.dynamic_pause_enabled ?? false,
      dynamicPauseVariation: p.dynamic_pause_variation ?? 300,
      sentenceStartBoost: p.sentence_start_boost ?? 0,
      sentenceEndSlow: p.sentence_end_slow ?? 0,
    });
    setActiveProfileId(p.id);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Non connecté"); return; }

      const profileName = newProfileName.trim() || `Profil ${profiles.length + 1}`;

      const { data, error } = await (supabase as any)
        .from("favorite_voice_profile")
        .insert({
          user_id: user.id,
          profile_name: profileName,
          language_code: settings.languageCode,
          voice_gender: settings.voiceGender,
          voice_name: settings.voiceName,
          style: `${settings.voiceType}:${settings.style}`,
          speaking_rate: settings.speakingRate,
          pitch: settings.pitch,
          volume_gain_db: settings.volumeGainDb,
          effects_profile_id: settings.effectsProfileId,
          pause_between_paragraphs: settings.pauseBetweenParagraphs,
          pause_after_sentences: settings.pauseAfterSentences,
          pause_after_comma: settings.pauseAfterComma,
          narration_profile: settings.narrationProfile,
          dynamic_pause_enabled: settings.dynamicPauseEnabled,
          dynamic_pause_variation: settings.dynamicPauseVariation,
          sentence_start_boost: settings.sentenceStartBoost,
          sentence_end_slow: settings.sentenceEndSlow,
        })
        .select()
        .single();

      if (error) throw error;
      setProfiles((prev) => [...prev, data]);
      setActiveProfileId(data.id);
      setNewProfileName("");
      setShowNameInput(false);
      toast.success(`Profil « ${profileName} » enregistré`);
    } catch (e: any) {
      console.error("Save profile error:", e);
      toast.error(e?.message || "Erreur de sauvegarde");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateActiveProfile = async () => {
    if (!activeProfileId) return;
    setSavingProfile(true);
    try {
      const { error } = await (supabase as any)
        .from("favorite_voice_profile")
        .update({
          language_code: settings.languageCode,
          voice_gender: settings.voiceGender,
          voice_name: settings.voiceName,
          style: `${settings.voiceType}:${settings.style}`,
          speaking_rate: settings.speakingRate,
          pitch: settings.pitch,
          volume_gain_db: settings.volumeGainDb,
          effects_profile_id: settings.effectsProfileId,
          pause_between_paragraphs: settings.pauseBetweenParagraphs,
          pause_after_sentences: settings.pauseAfterSentences,
          pause_after_comma: settings.pauseAfterComma,
          narration_profile: settings.narrationProfile,
          dynamic_pause_enabled: settings.dynamicPauseEnabled,
          dynamic_pause_variation: settings.dynamicPauseVariation,
          sentence_start_boost: settings.sentenceStartBoost,
          sentence_end_slow: settings.sentenceEndSlow,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeProfileId);

      if (error) throw error;
      setProfiles((prev) => prev.map((p) => p.id === activeProfileId ? {
        ...p,
        language_code: settings.languageCode,
        voice_gender: settings.voiceGender,
        voice_name: settings.voiceName,
        style: `${settings.voiceType}:${settings.style}`,
        speaking_rate: settings.speakingRate,
        pitch: settings.pitch,
        volume_gain_db: settings.volumeGainDb,
        effects_profile_id: settings.effectsProfileId,
        pause_between_paragraphs: settings.pauseBetweenParagraphs,
        pause_after_sentences: settings.pauseAfterSentences,
        pause_after_comma: settings.pauseAfterComma,
        narration_profile: settings.narrationProfile,
        dynamic_pause_enabled: settings.dynamicPauseEnabled,
        dynamic_pause_variation: settings.dynamicPauseVariation,
        sentence_start_boost: settings.sentenceStartBoost,
        sentence_end_slow: settings.sentenceEndSlow,
      } : p));
      toast.success("Profil mis à jour");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRenameProfile = async (profileId: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      const { error } = await (supabase as any)
        .from("favorite_voice_profile")
        .update({ profile_name: name, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (error) throw error;
      setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, profile_name: name } : p));
      setEditingProfileId(null);
      toast.success("Nom modifié");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("favorite_voice_profile")
        .delete()
        .eq("id", profileId);
      if (error) throw error;
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      if (activeProfileId === profileId) setActiveProfileId(null);
      toast.success("Profil supprimé");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  };

  // Filter voices for current type AND gender
  const voicesForDropdown = availableVoices.filter((v) =>
    (v.type || "").toLowerCase() === settings.voiceType.toLowerCase() &&
    (v.gender || "").toLowerCase() === settings.voiceGender.toLowerCase()
  );

  return (
    <div className={hideHeader ? "space-y-4" : "rounded-lg border border-border bg-card p-4 space-y-4"}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Paramètres de voix
          </h3>
        </div>
      )}

      {/* Language */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-lang" className="text-xs text-muted-foreground">Langue</Label>
        <Select value={settings.languageCode} onValueChange={(v) => update({ languageCode: v, voiceName: "" })}>
          <SelectTrigger id="vo-lang" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Gender */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-gender" className="text-xs text-muted-foreground">Genre</Label>
        <Select value={settings.voiceGender} onValueChange={(v) => update({ voiceGender: v as VoiceSettings["voiceGender"], voiceName: "" })}>
          <SelectTrigger id="vo-gender" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Type */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-type" className="text-xs text-muted-foreground">Type de voix</Label>
        <Select value={settings.voiceType} onValueChange={(v) => update({ voiceType: v, voiceName: "" })}>
          <SelectTrigger id="vo-type" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAvailableVoiceTypes(settings.languageCode, availableVoices).map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">
                  {t.label}
                  <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Name (dynamic) */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-name" className="text-xs text-muted-foreground">
          Voix
          {loadingVoices && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
        </Label>
        <Select
          value={settings.voiceName || "auto"}
          onValueChange={(v) => update({ voiceName: v === "auto" ? "" : v })}
        >
          <SelectTrigger id="vo-name" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <span className="text-muted-foreground">Automatique</span>
            </SelectItem>
            {voicesForDropdown.map((v) => (
              <SelectItem key={v.name} value={v.name}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{v.letter}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {GENDER_LABELS[v.gender] || v.gender}
                  </span>
                  <span className="rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">
                    {v.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]">
                    {v.name}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {voicesForDropdown.length === 0 && !loadingVoices && (
          <p className="text-[10px] text-muted-foreground/60">
            Aucune voix trouvée pour cette combinaison. La sélection automatique sera utilisée.
          </p>
        )}
      </div>

      {/* Style / Tone */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-style" className="text-xs text-muted-foreground">Tonalité</Label>
        <Select value={settings.style} onValueChange={(v) => update({ style: v })}>
          <SelectTrigger id="vo-style" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Narration Profile */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Profil de narration</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {NARRATION_PROFILES.map((np) => (
            <button
              key={np.value}
              onClick={() => update({ narrationProfile: np.value })}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-3 sm:py-2 text-center transition-colors min-h-[48px] sm:min-h-0 ${
                settings.narrationProfile === np.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
              title={np.desc}
            >
              <span className="text-lg sm:text-base leading-none">{np.icon}</span>
              <span className="text-[11px] sm:text-[10px] font-medium leading-tight">{np.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          {NARRATION_PROFILES.find(p => p.value === settings.narrationProfile)?.desc}
        </p>
      </div>

      {/* Speaking Rate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Vitesse</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.speakingRate.toFixed(2)}x</span>
        </div>
        <Slider
          min={0.5} max={2.0} step={0.05}
          value={[settings.speakingRate]}
          onValueChange={([v]) => update({ speakingRate: v })}
          aria-label="Vitesse de la voix"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Lent</span><span>Normal</span><span>Rapide</span>
        </div>
      </div>

      {/* Volume Gain */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Volume</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.volumeGainDb > 0 ? "+" : ""}{settings.volumeGainDb.toFixed(0)} dB</span>
        </div>
        <Slider
          min={-10} max={10} step={1}
          value={[settings.volumeGainDb]}
          onValueChange={([v]) => update({ volumeGainDb: v })}
          aria-label="Volume gain"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>-10 dB</span><span>0</span><span>+10 dB</span>
        </div>
      </div>

      {/* Pitch */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Pitch (tonalité)</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.pitch > 0 ? "+" : ""}{settings.pitch.toFixed(0)}%</span>
        </div>
        <Slider
          min={-20} max={20} step={1}
          value={[settings.pitch]}
          onValueChange={([v]) => update({ pitch: v })}
          aria-label="Pitch"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Grave −20%</span><span>Normal</span><span>Aigu +20%</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Ajuste la hauteur de la voix. Négatif = plus grave, positif = plus aigu.
        </p>
      </div>

      {/* Effects Profile */}
      <div className="space-y-1.5">
        <Label htmlFor="vo-profile" className="text-xs text-muted-foreground">Profil audio</Label>
        <Select value={settings.effectsProfileId} onValueChange={(v) => update({ effectsProfileId: v })}>
          <SelectTrigger id="vo-profile" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EFFECTS_PROFILES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pause after sentences */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Pause en fin de phrase</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.pauseAfterSentences === 0 ? "Aucune" : `${settings.pauseAfterSentences} ms`}</span>
        </div>
        <Slider
          min={0} max={1000} step={50}
          value={[settings.pauseAfterSentences]}
          onValueChange={([v]) => update({ pauseAfterSentences: v })}
          aria-label="Pause en fin de phrase"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Aucune</span><span>500ms</span><span>1s</span>
        </div>
      </div>

      {/* Pause between paragraphs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Pause entre paragraphes</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.pauseBetweenParagraphs === 0 ? "Aucune" : `${settings.pauseBetweenParagraphs} ms`}</span>
        </div>
        <Slider
          min={0} max={2000} step={100}
          value={[settings.pauseBetweenParagraphs]}
          onValueChange={([v]) => update({ pauseBetweenParagraphs: v })}
          aria-label="Pause entre paragraphes"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Aucune</span><span>1s</span><span>2s</span>
        </div>
      </div>

      {/* Pause after comma */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Pause après virgule</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.pauseAfterComma === 0 ? "Aucune" : `${settings.pauseAfterComma} ms`}</span>
        </div>
        <Slider
          min={0} max={1000} step={25}
          value={[settings.pauseAfterComma]}
          onValueChange={([v]) => update({ pauseAfterComma: v })}
          aria-label="Pause après virgule"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Aucune</span><span>500ms</span><span>1s</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Ajoute un silence après chaque virgule pour un rythme plus posé et naturel.
        </p>
      </div>

      {/* Dynamic Pause Variation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Variation dynamique des pauses</Label>
          <Switch
            checked={settings.dynamicPauseEnabled}
            onCheckedChange={(v) => update({ dynamicPauseEnabled: v })}
            aria-label="Activer la variation dynamique des pauses"
          />
        </div>
        {settings.dynamicPauseEnabled && (
          <div className="space-y-1.5 pl-1 border-l-2 border-primary/20 ml-1">
            <Label className="text-[10px] text-muted-foreground">Amplitude de variation</Label>
            <div className="flex gap-1.5">
              {[300, 450, 600].map((ms) => (
                <button
                  key={ms}
                  onClick={() => update({ dynamicPauseVariation: ms })}
                  className={`flex-1 rounded-md px-2 py-2.5 sm:py-1.5 text-xs font-mono transition-colors min-h-[44px] sm:min-h-0 ${
                    settings.dynamicPauseVariation === ms
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {ms}ms
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Ajoute une variation aléatoire (±) aux pauses entre phrases pour un rendu plus organique.
            </p>
          </div>
        )}
      </div>

      {/* Sentence start boost */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Élan en début de phrase</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.sentenceStartBoost === 0 ? "Désactivé" : `+${settings.sentenceStartBoost}%`}</span>
        </div>
        <Slider
          min={0} max={100} step={5}
          value={[settings.sentenceStartBoost]}
          onValueChange={([v]) => update({ sentenceStartBoost: v })}
          aria-label="Élan en début de phrase"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Désactivé</span><span>+50%</span><span>+100%</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Accélère légèrement les premiers mots de chaque phrase pour un effet narratif plus dynamique.
        </p>
      </div>

      {/* Sentence end slow */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Ralentissement en fin de phrase</Label>
          <span className="text-xs font-mono text-muted-foreground">{settings.sentenceEndSlow === 0 ? "Désactivé" : `-${settings.sentenceEndSlow}%`}</span>
        </div>
        <Slider
          min={0} max={100} step={5}
          value={[settings.sentenceEndSlow]}
          onValueChange={([v]) => update({ sentenceEndSlow: v })}
          aria-label="Ralentissement en fin de phrase"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Désactivé</span><span>-50%</span><span>-100%</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Ralentit les derniers mots de chaque phrase déclarative (ignoré pour ? et !).
        </p>
      </div>

      {/* Prosody warning for Standard voices */}
      {(settings.sentenceStartBoost > 0 || settings.sentenceEndSlow > 0) && settings.voiceType === "Standard" && (
        <p className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1.5">
          ⚠️ Les réglages Élan et Ralentissement nécessitent une voix <strong>WaveNet</strong> ou <strong>Neural2</strong>. Les voix Standard ne supportent pas les variations de rythme intra-phrase (balises SSML prosody).
        </p>
      )}

      {/* Save / Update profile */}
      <div className="space-y-2 pt-2 border-t border-border">
        {showNameInput ? (
          <div className="flex gap-2 items-center">
            <Input
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder={`Profil ${profiles.length + 1}`}
              className="h-8 text-xs flex-1"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
            />
            <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile} className="h-8 px-3 gap-1 text-xs">
              {savingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              OK
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNameInput(false)} className="h-8 px-2">
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNameInput(true)}
              className="flex-1 min-h-[36px] gap-1.5 text-xs"
            >
              <Star className="h-3.5 w-3.5" />
              Nouveau profil de voix
            </Button>
            {activeProfileId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdateActiveProfile}
                disabled={savingProfile}
                className="min-h-[36px] gap-1.5 text-xs"
                title="Mettre à jour le profil actif"
              >
                {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Sauver
              </Button>
            )}
          </div>
        )}

        {/* Profile list */}
        {profiles.length > 0 && (
          <div className="space-y-1 pt-1">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                  p.id === activeProfileId
                    ? "bg-primary/10 border border-primary/30 text-primary"
                    : "bg-secondary/50 border border-transparent hover:border-border text-foreground"
                }`}
              >
                <Mic2 className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {editingProfileId === p.id ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-6 text-xs flex-1 min-w-0"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleRenameProfile(p.id)}
                    />
                    <button onClick={() => handleRenameProfile(p.id)} className="p-0.5 text-primary hover:text-primary/80">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditingProfileId(null)} className="p-0.5 text-muted-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="flex-1 truncate min-w-0"
                      onClick={() => applyProfile(p)}
                    >
                      {p.profile_name}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 shrink-0">
                      {p.voice_name ? p.voice_name.split("-").pop() : "auto"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingProfileId(p.id); setEditingName(p.profile_name); }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-primary text-muted-foreground transition-opacity"
                      style={{ opacity: p.id === activeProfileId ? 1 : undefined }}
                      title="Renommer"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-opacity"
                      style={{ opacity: p.id === activeProfileId ? 1 : undefined }}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
