import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ClipboardPaste, Mic, Volume2, Loader2, Pause, Play, Settings2, AudioLines, Clock, User, Music, ChevronDown, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import VoiceSettingsPanel, { type VoiceSettings, STYLE_PRESETS } from "./VoiceSettingsPanel";
import VoicePreviewTest from "./VoicePreviewTest";
import GeneratedAudioHistory from "./GeneratedAudioHistory";
import { validateExactAlignedShotSentences, validateExactShotTimepoints } from "./exactShotSync";
import MusicStudio from "./MusicStudio";
import { buildExactShotScript, buildExactShotSentences, normalizeExactSyncText } from "./voiceOverShotSync";

interface VoiceOverStudioProps {
  narration: string;
  generatedScript: string | null;
  projectId: string | null;
  projectTitle?: string;
  scenes?: { source_text: string; title: string; id: string }[];
  shots?: { id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null; description: string }[];
  /** Scenes with scene_order for sorting shots correctly */
  scenesForSort?: { id: string; scene_order: number }[];
  onMusicSelected?: (tracks: { url: string; name: string }[]) => void;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  languageCode: "fr-FR",
  voiceGender: "FEMALE",
  voiceType: "Standard",
  voiceName: "",
  style: "neutral",
  narrationProfile: "standard",
  speakingRate: 1.0,
  pitch: 0,
  volumeGainDb: 0,
  effectsProfileId: "none",
  pauseBetweenParagraphs: 500,
  pauseAfterSentences: 0,
  pauseAfterComma: 0,
  dynamicPauseEnabled: false,
  dynamicPauseVariation: 300,
  sentenceStartBoost: 0,
  sentenceEndSlow: 0,
};

interface PlayerState {
  audioUrl: string;
  fileName: string;
  durationEstimate: number;
  realDuration: number | null;
}

export default function VoiceOverStudio({ narration, generatedScript, projectId, projectTitle, scenes, shots, scenesForSort, onMusicSelected }: VoiceOverStudioProps) {
  const [voScript, setVoScript] = useState("");
  const [userEditedScript, setUserEditedScript] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [customFileName, setCustomFileName] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [forceStandardMode, setForceStandardMode] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Strip comma/dot thousand separators from numbers so TTS doesn't pronounce them */
  const stripThousandSeparators = (text: string): string =>
    text.replace(/(\d)[,.](\d{3})(?=\b)/g, "$1$2")
        .replace(/(\d)[,.](\d{3})(?=\b)/g, "$1$2"); // second pass for millions+

  const buildScriptFromCurrentShots = () => {
    const sorted = getSortedShots();
    if (sorted.length === 0) return "";

    return stripThousandSeparators(buildExactShotScript(sorted));
  };

  const handlePasteFromScript = () => {
    const currentShotScript = buildScriptFromCurrentShots();
    if (currentShotScript) {
      setVoScript(currentShotScript);
      setUserEditedScript(false);
      toast.success("Script VO reconstruit depuis les shots actuels");
      return;
    }

    // Priority fallback: use generated script with scene structure
    if (generatedScript?.trim()) {
      // If we have scenes, build structured text with scene breaks
      if (scenes && scenes.length > 0) {
        const sceneTexts = scenes.map((s) => s.source_text).filter(Boolean);
        if (sceneTexts.length > 0) {
          setVoScript(stripThousandSeparators(sceneTexts.join("\n\n")));
          setUserEditedScript(false);
          toast.success("Script généré collé (structure par scènes)");
          return;
        }
      }
      // Fallback: use the generated script directly
      setVoScript(stripThousandSeparators(generatedScript));
      setUserEditedScript(false);
      toast.success("Script généré collé");
      return;
    }
    // Last resort: narration
    const source = narration;
    if (!source?.trim()) {
      toast.error("Aucun script généré disponible. Générez d'abord un script dans l'onglet ScriptCreator.");
      return;
    }
    setVoScript(stripThousandSeparators(source));
    setUserEditedScript(false);
    toast.success("Narration collée");
  };

  const getSortedShots = () => {
    if (!shots || shots.length === 0 || !scenesForSort || scenesForSort.length === 0) return [];
    const sceneOrderMap = new Map(scenesForSort.map((s) => [s.id, s.scene_order]));

    return [...shots].sort((a, b) => {
      const oa = sceneOrderMap.get(a.scene_id) ?? 0;
      const ob = sceneOrderMap.get(b.scene_id) ?? 0;
      if (oa !== ob) return oa - ob;

      return a.shot_order - b.shot_order;
    });
  };

  // Build sorted shotSentences for marked sync mode.
  const buildShotSentences = (): { id: string; text: string; isNewScene?: boolean }[] | null => {
    const sorted = getSortedShots();
    if (sorted.length === 0) return null;

    const shotEntries = buildExactShotSentences(sorted);

    if (shotEntries.length === 0) return null;

    return shotEntries;
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

      // If user manually edited the textarea, force standard mode (no shot sync)
      const expectedShotIds = getSortedShots().map((shot) => shot.id);
      let useMarkedSync = false;
      let shotSentences: { id: string; text: string; isNewScene?: boolean }[] | null = null;

      if (forceStandardMode) {
        console.info("Force standard mode enabled — skipping shot sync validation.");
        useMarkedSync = false;
      } else if (expectedShotIds.length > 0 && userEditedScript) {
        toast.error("Pour un calage exact, le script VO doit être reconstruit depuis les shots actuels avant génération. Ou activez « Forcer sans synchronisation ».");
        return;
      } else if (!userEditedScript) {
        shotSentences = buildShotSentences();
        const syncValidation = validateExactAlignedShotSentences(expectedShotIds, shotSentences);
        const exactShotScript = stripThousandSeparators(buildExactShotScript(getSortedShots()));
        const voMatchesShots = normalizeExactSyncText(voScript) === normalizeExactSyncText(exactShotScript);

        if (expectedShotIds.length > 0 && !voMatchesShots) {
          toast.error("Le script VO doit correspondre exactement aux fragments actuels des shots. Recollez-le ou activez « Forcer sans synchronisation ».");
          return;
        }

        if (expectedShotIds.length > 0 && !syncValidation.ok) {
          toast.error(syncValidation.errors[0] || "Synchronisation exacte impossible avec les shots actuels.");
          return;
        }

        useMarkedSync = syncValidation.ok && shotSentences != null && shotSentences.length > 0;

        if (!useMarkedSync && expectedShotIds.length > 0 && shotSentences && shotSentences.length > 0) {
          console.warn("Shot sync validation failed, falling back to standard mode:", syncValidation.errors);
        }
      } else {
        console.info("User edited script detected — using standard TTS mode (no shot sync).");
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
            mode: "full",
            projectId,
            customFileName: customFileName.trim() || undefined,
            ...(useMarkedSync
              ? { shotSentences, syncMode: "shot_marked" }
              : { syncMode: "standard" }),
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
        realDuration: null,
      });

      // Refresh history
      setHistoryRefreshKey((k) => k + 1);

      const syncInfo = data.shotTimepoints ? ` • Sync précis (${data.shotTimepoints.length} marqueurs)` : "";
      toast.success(`Voix off générée — ${data.chunks} bloc(s), ${formatSize(data.fileSize)} • ${data.usedVoiceName ?? "auto"}${syncInfo}`);
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
    setPlayerState({ audioUrl, fileName, durationEstimate: duration, realDuration: null });
    setIsPlaying(false);
    setAudioProgress(0);

    // Auto-play
    setTimeout(() => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setPlayerState((prev) => prev ? { ...prev, realDuration: audio.duration } : prev);
        }
      };
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
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setPlayerState((prev) => prev ? { ...prev, realDuration: audio.duration } : prev);
        }
      };
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

  const [voOpen, setVoOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);

  // ── Desync detection: compare current shots with latest audio timepoints ──
  const [desyncWarning, setDesyncWarning] = useState<string | null>(null);
  const [syncChecked, setSyncChecked] = useState(false);

  useEffect(() => {
    if (!projectId || !shots || shots.length === 0) {
      setDesyncWarning(null);
      setSyncChecked(false);
      return;
    }
    let cancelled = false;

    const checkSync = async () => {
      const { data: audioFiles } = await supabase
        .from("vo_audio_history")
        .select("shot_timepoints")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (!audioFiles || audioFiles.length === 0) {
        setDesyncWarning(null);
        return;
      }

      const timepoints = audioFiles[0].shot_timepoints as unknown as { shotId: string; shotIndex: number; timeSeconds: number }[] | null;
      if (!timepoints || timepoints.length === 0) {
        setDesyncWarning(null);
        return;
      }

      const expectedShotIds = getSortedShots().map((shot) => shot.id);
      const validation = validateExactShotTimepoints(expectedShotIds, timepoints);

      setSyncChecked(true);
      if (!validation.ok) {
        setDesyncWarning(validation.errors[0] ?? "L'audio VO est désynchronisé avec les shots actuels.");
      } else {
        setDesyncWarning(null);
      }
    };

    checkSync();
    return () => { cancelled = true; };
  }, [projectId, shots, scenesForSort]);

  return (
    <div className="container max-w-6xl py-4 sm:py-6 lg:py-10 px-3 sm:px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <Mic className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg sm:text-xl lg:text-2xl font-semibold text-foreground">
          VO — Voice Over / Music
        </h2>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 lg:mb-8">
        Transformez votre script en fichier audio voice-over ou générez de la musique originale.
      </p>

      {/* ─── VoiceOver Collapsible ─── */}
      <Collapsible open={voOpen} onOpenChange={setVoOpen} className="mb-4">
        <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors group">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-display text-foreground flex-1 text-left">VoiceOver</span>
          {desyncWarning ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
              <XCircle className="h-3 w-3" />
              Désync
            </span>
          ) : syncChecked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-500 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
              <CheckCircle2 className="h-3 w-3" />
              Sync OK
            </span>
          ) : null}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${voOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          {/* Main grid: Left (script + bottom tools) | Right (settings) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* RIGHT column: Voice settings only — shown FIRST on mobile */}
            <div className="space-y-3 order-1 lg:order-2">
              <Accordion type="multiple" defaultValue={[]}>
                <AccordionItem value="settings" className="border rounded-lg border-border bg-card px-4">
                  <AccordionTrigger className="py-3 hover:no-underline gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold font-display">
                      <Settings2 className="h-4 w-4 text-primary" />
                      Paramètres de voix
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <VoiceSettingsPanel settings={settings} onChange={setSettings} hideHeader onActiveProfileChange={setActiveProfileName} />
                  </AccordionContent>
                  {/* Hidden mount for profile loading when accordion is closed */}
                  <div className="hidden">
                    <VoiceSettingsPanel settings={settings} onChange={setSettings} hideHeader onActiveProfileChange={setActiveProfileName} />
                  </div>
                </AccordionItem>
              </Accordion>
            </div>

            {/* LEFT column (2/3): Script + bottom row */}
            <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
              {/* Script block */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
                  <Input
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder={`${projectTitle || "vo"}_${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}`}
                    className="h-10 text-sm flex-1"
                    aria-label="Nom du fichier audio"
                  />
                  <Button
                    variant="hero"
                    disabled={!voScript.trim() || generating}
                    className="min-h-[48px] sm:min-h-[44px] gap-2 w-full sm:w-auto shrink-0"
                    onClick={handleGenerate}
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                    {generating ? "Génération..." : "Générer la voix off"}
                  </Button>
                </div>
                {/* Desync warning banner */}
                {desyncWarning && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-amber-300">{desyncWarning}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ➜ Cliquez sur « Coller le script généré » puis régénérez la voix off.
                      </p>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={forceStandardMode}
                          onChange={(e) => setForceStandardMode(e.target.checked)}
                          className="rounded border-amber-400/50 accent-amber-500"
                        />
                        <span className="text-[11px] text-amber-200">Forcer la génération sans synchronisation (mode standard)</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="vo-script">
                    Script narratif
                  </label>
                  <div className="flex items-center gap-2">
                    {activeProfileName && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        <User className="h-3 w-3" />
                        {activeProfileName}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePasteFromScript}
                      className="h-9 sm:h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground min-w-[44px]"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Coller le script généré</span>
                      <span className="sm:hidden">Coller</span>
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="vo-script"
                  value={voScript}
                  onChange={(e) => { setVoScript(e.target.value); setUserEditedScript(true); }}
                  placeholder="Collez ou saisissez votre texte narratif ici..."
                  className="min-h-[100px] sm:min-h-[120px] lg:min-h-[110px] text-sm leading-relaxed resize-y font-body"
                  aria-label="Script narratif pour la voix off"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {voScript.length.toLocaleString()} caractères
                  </span>
                </div>
              </div>

              {/* Bottom row under script: Test rapide | Player + History — 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Test rapide */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold font-display text-foreground">
                    <AudioLines className="h-3.5 w-3.5 text-primary" />
                    Test rapide
                  </h3>
                  <VoicePreviewTest settings={settings} hideHeader />
                </div>

                {/* Player + History combined */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  {/* Player */}
                  {playerState ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xs font-semibold text-foreground">Lecteur</h3>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatDuration(playerState.realDuration ?? playerState.durationEstimate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handlePlayPause}
                          className="flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                          aria-label={isPlaying ? "Pause" : "Lecture"}
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
                    <div className="rounded border border-dashed border-border bg-card/50 p-3 flex items-center justify-center gap-2 min-h-[60px]">
                      <Volume2 className="h-4 w-4 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground/50">Lecteur audio</p>
                    </div>
                  )}

                  {/* History */}
                  <Accordion type="multiple" defaultValue={["history"]}>
                    <AccordionItem value="history" className="border-0 border-t border-border pt-2">
                      <AccordionTrigger className="py-1.5 hover:no-underline gap-2">
                        <span className="flex items-center gap-2 text-xs font-semibold font-display">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          Historique
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <GeneratedAudioHistory
                          projectId={projectId}
                          refreshKey={historyRefreshKey}
                          onPlay={handlePlayFromHistory}
                          hideHeader
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ─── Music Collapsible ─── */}
      <Collapsible open={musicOpen} onOpenChange={setMusicOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors group">
          <Music className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-display text-foreground flex-1 text-left">Music</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${musicOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <MusicStudio projectId={projectId} onMusicSelected={onMusicSelected} />
          </div>
        </CollapsibleContent>
      </Collapsible>
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
