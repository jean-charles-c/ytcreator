import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, Mic, Volume2 } from "lucide-react";
import { toast } from "sonner";
import VoiceSettingsPanel, { type VoiceSettings } from "./VoiceSettingsPanel";
import VoicePreviewTest from "./VoicePreviewTest";

interface VoiceOverStudioProps {
  narration: string;
  generatedScript: string | null;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  languageCode: "fr-FR",
  voiceGender: "FEMALE",
  style: "neutral",
  speakingRate: 1.0,
};

export default function VoiceOverStudio({ narration, generatedScript }: VoiceOverStudioProps) {
  const [voScript, setVoScript] = useState("");
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);

  const handlePasteFromScript = () => {
    const source = generatedScript || narration;
    if (!source?.trim()) {
      toast.error("Aucun script disponible à coller. Générez d'abord un script dans ScriptCreator ou saisissez une narration dans ScriptInput.");
      return;
    }
    setVoScript(source);
    toast.success("Script collé depuis l'onglet source");
  };

  return (
    <div className="container max-w-6xl py-6 sm:py-10 px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Mic className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground">
          VO — Voice Over
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Transformez votre script en fichier audio voice-over.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Script */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="vo-script">
              Script narratif
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePasteFromScript}
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Coller depuis ScriptInput
            </Button>
          </div>
          <Textarea
            id="vo-script"
            value={voScript}
            onChange={(e) => setVoScript(e.target.value)}
            placeholder="Collez ou saisissez votre texte narratif ici..."
            className="min-h-[350px] sm:min-h-[450px] text-sm leading-relaxed resize-y font-body"
            aria-label="Script narratif pour la voix off"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {voScript.length.toLocaleString()} caractères
            </span>
            <Button
              variant="hero"
              disabled={!voScript.trim()}
              className="min-h-[44px] gap-2"
              title="Génération complète disponible à l'étape 5"
              onClick={() => toast.info("La génération complète sera disponible à l'étape suivante.")}
            >
              <Volume2 className="h-4 w-4" />
              Générer la voix off
            </Button>
          </div>
        </div>

        {/* Right column — Settings + Preview + Placeholders */}
        <div className="space-y-4">
          <VoiceSettingsPanel settings={settings} onChange={setSettings} />
          <VoicePreviewTest settings={settings} />

          {/* Audio player placeholder */}
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 flex flex-col items-center justify-center gap-2 min-h-[80px]">
            <Volume2 className="h-5 w-5 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground/50 text-center">
              Lecteur audio
            </p>
          </div>

          {/* History placeholder */}
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 flex flex-col items-center justify-center gap-2 min-h-[100px]">
            <Mic className="h-5 w-5 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground/50 text-center">
              Historique des audios
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
