import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ClipboardPaste, Mic, Volume2, Loader2, Pause, Play, Settings2, AudioLines, Clock, User, Music, ChevronDown, AlertTriangle, CheckCircle2, XCircle, FlaskConical, RotateCcw, BookA, Replace, RefreshCw, Download } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import VoiceSettingsPanel, { type VoiceSettings, STYLE_PRESETS, DEFAULT_VOICE_SETTINGS } from "./VoiceSettingsPanel";
import VoicePreviewTest from "./VoicePreviewTest";
import GeneratedAudioHistory from "./GeneratedAudioHistory";
import { validateExactAlignedShotSentences, validateExactShotTimepoints } from "./exactShotSync";
import MusicStudio from "./MusicStudio";
import { buildExactShotScript, buildExactShotSentences, getShotFragmentText, normalizeExactSyncText } from "./voiceOverShotSync";
import CustomPronunciationsPanel from "./CustomPronunciationsPanel";
import CustomTtsTransformsPanel from "./CustomTtsTransformsPanel";
import ChirpAlignmentReview from "./ChirpAlignmentReview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const DEFAULT_SETTINGS = DEFAULT_VOICE_SETTINGS;

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
  const [freeMode, setFreeMode] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<"ssml" | "chirp3hd">("ssml");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [customPronunciations, setCustomPronunciations] = useState<{ phrase: string; pronunciation: string }[]>([]);

  // ── Per-scene generation state ──
  type SceneGenStatus = "pending" | "generating" | "done" | "error";
  const [sceneStatuses, setSceneStatuses] = useState<Map<string, SceneGenStatus>>(new Map());
  const [sceneErrors, setSceneErrors] = useState<Map<string, string>>(new Map());
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);

  // ── Per-scene audio data (persisted in DB) ──
  interface SceneAudioInfo {
    filePath: string;
    fileName: string;
    durationSeconds: number;
    createdAt: string;
  }
  const [sceneAudioMap, setSceneAudioMap] = useState<Map<string, SceneAudioInfo>>(new Map());

  // Load existing scene audio from DB on mount / projectId change
  useEffect(() => {
    if (!projectId || !scenes || scenes.length === 0) {
      setSceneAudioMap(new Map());
      return;
    }
    let cancelled = false;

    const loadSceneAudio = async () => {
      const { data, error } = await supabase
        .from("scene_vo_audio")
        .select("scene_id, file_path, file_name, duration_seconds, created_at")
        .eq("project_id", projectId);

      if (cancelled || error || !data) return;

      const audioMap = new Map<string, SceneAudioInfo>();
      const statusMap = new Map<string, SceneGenStatus>();
      for (const row of data) {
        audioMap.set(row.scene_id, {
          filePath: row.file_path,
          fileName: row.file_name,
          durationSeconds: row.duration_seconds ?? 0,
          createdAt: row.created_at,
        });
        statusMap.set(row.scene_id, "done");
      }
      setSceneAudioMap(audioMap);
      // Only set statuses if not currently generating
      if (!generating) {
        setSceneStatuses(statusMap);
      }
    };

    loadSceneAudio();
    return () => { cancelled = true; };
  }, [projectId, scenes, historyRefreshKey]);

  // ── Quick profile selector state ──
  interface QuickProfile { id: string; profile_name: string; language_code: string; voice_gender: string; voice_name: string; style: string; speaking_rate: number; pitch: number; volume_gain_db: number; effects_profile_id: string; pause_between_paragraphs: number; pause_after_sentences: number; pause_after_comma: number; narration_profile: string; dynamic_pause_enabled: boolean; dynamic_pause_variation: number; sentence_start_boost: number; sentence_end_slow: number; }
  const [quickProfiles, setQuickProfiles] = useState<QuickProfile[]>([]);
  const [selectedQuickProfileId, setSelectedQuickProfileId] = useState<string>(() => {
    return localStorage.getItem("vo-quick-profile-id") || "";
  });

  const loadQuickProfiles = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("favorite_voice_profile")
        .select("*")
        .order("created_at", { ascending: true });
      if (!error && data) {
        setQuickProfiles(data);
        // If saved profile no longer exists, clear
        if (selectedQuickProfileId && !data.some((p: QuickProfile) => p.id === selectedQuickProfileId)) {
          setSelectedQuickProfileId("");
          localStorage.removeItem("vo-quick-profile-id");
        }
      }
    } catch (e) {
      console.error("Load quick profiles error:", e);
    }
  }, [selectedQuickProfileId]);

  useEffect(() => { loadQuickProfiles(); }, [loadQuickProfiles]);

  const applyQuickProfile = useCallback((profileId: string) => {
    setSelectedQuickProfileId(profileId);
    localStorage.setItem("vo-quick-profile-id", profileId);
    const p = quickProfiles.find((pr) => pr.id === profileId);
    if (!p) return;
    const rawStyle = p.style || "";
    const parts = rawStyle.split(":");
    const voiceType = ["Standard", "Wavenet", "Neural2", "Studio", "Chirp3-HD", "Chirp-HD", "Polyglot"].includes(parts[0]) ? parts[0] : "Standard";
    const tone = parts[1] && STYLE_PRESETS[parts[1]] ? parts[1] : (STYLE_PRESETS[parts[0]] ? parts[0] : "neutral");
    setSettings({
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
    setActiveProfileName(p.profile_name);
    toast.success(`Profil « ${p.profile_name} » appliqué`);
  }, [quickProfiles]);

  // Auto-apply saved profile on mount when profiles load
  useEffect(() => {
    if (selectedQuickProfileId && quickProfiles.length > 0) {
      const p = quickProfiles.find((pr) => pr.id === selectedQuickProfileId);
      if (p) {
        const rawStyle = p.style || "";
        const parts = rawStyle.split(":");
        const voiceType = ["Standard", "Wavenet", "Neural2", "Studio", "Chirp3-HD", "Chirp-HD", "Polyglot"].includes(parts[0]) ? parts[0] : "Standard";
        const tone = parts[1] && STYLE_PRESETS[parts[1]] ? parts[1] : (STYLE_PRESETS[parts[0]] ? parts[0] : "neutral");
        setSettings({
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
        setActiveProfileName(p.profile_name);
      }
    }
  }, [quickProfiles.length]); // only on initial load
  /** Strip comma/dot thousand separators from numbers so TTS doesn't pronounce them */
  const stripThousandSeparators = (text: string): string =>
    text.replace(/\*/g, "")
        .replace(/(\d)[,.](\d{3})(?=\b)/g, "$1$2")
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

  // ── Generate a single scene's audio via chirp3hd ──
  const generateSceneAudio = async (
    scene: { id: string; source_text: string; title: string },
    sceneOrder: number,
    session: { access_token: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    const sceneText = stripThousandSeparators(scene.source_text || "").trim();
    if (!sceneText) return { ok: true }; // skip empty scenes

    setSceneStatuses((prev) => new Map(prev).set(scene.id, "generating"));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tts-chirp3hd`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            text: sceneText,
            projectId,
            sceneId: scene.id,
            sceneOrder,
            voiceName: settings.voiceName || undefined,
            customFileName: customFileName.trim() || undefined,
            speakingRate: settings.speakingRate + (STYLE_PRESETS[settings.style]?.rateOffset || 0),
            customPronunciations: customPronunciations.length > 0 ? customPronunciations : undefined,
            pauseBetweenParagraphs: settings.pauseBetweenParagraphs ?? 0,
            pauseAfterSentences: settings.pauseAfterSentences ?? 0,
            pauseAfterComma: settings.pauseAfterComma ?? 0,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error || `Erreur ${response.status}`;
        setSceneStatuses((prev) => new Map(prev).set(scene.id, "error"));
        setSceneErrors((prev) => new Map(prev).set(scene.id, errMsg));
        return { ok: false, error: errMsg };
      }

      await response.json();
      setSceneStatuses((prev) => new Map(prev).set(scene.id, "done"));
      return { ok: true };
    } catch (e: any) {
      const errMsg = e?.message || "Erreur réseau";
      setSceneStatuses((prev) => new Map(prev).set(scene.id, "error"));
      setSceneErrors((prev) => new Map(prev).set(scene.id, errMsg));
      return { ok: false, error: errMsg };
    }
  };

  // ── Assemble all scene audio files into final audio ──
  const assembleSceneAudio = async (session: { access_token: string }): Promise<any | null> => {
    setAssembling(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assemble-scene-audio`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            projectId,
            pauseBetweenScenes: settings.pauseBetweenParagraphs ?? 0,
            customFileName: customFileName.trim() || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `Erreur ${response.status}`);
      }

      return await response.json();
    } catch (e: any) {
      toast.error(`Assemblage échoué : ${e?.message || "erreur"}`);
      return null;
    } finally {
      setAssembling(false);
    }
  };

  // ── Generate all scenes then assemble ──
  const handleGenerateAllScenes = async () => {
    if (!scenes || scenes.length === 0 || !projectId) return;

    setGenerating(true);
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      toast.error("Vous devez être connecté.");
      setGenerating(false);
      return;
    }

    // Sort scenes by scene_order
    const sortedScenes = [...scenes].sort((a, b) => {
      const orderA = scenesForSort?.find((s) => s.id === a.id)?.scene_order ?? 0;
      const orderB = scenesForSort?.find((s) => s.id === b.id)?.scene_order ?? 0;
      return orderA - orderB;
    });

    // Initialize statuses
    const initStatuses = new Map<string, SceneGenStatus>();
    sortedScenes.forEach((s) => initStatuses.set(s.id, "pending"));
    setSceneStatuses(initStatuses);
    setSceneErrors(new Map());

    // Generate each scene sequentially (to maintain consistent voice)
    let allOk = true;
    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const sceneOrder = scenesForSort?.find((s) => s.id === scene.id)?.scene_order ?? i;
      toast.info(`Génération scène ${i + 1}/${sortedScenes.length} : ${scene.title || "Sans titre"}…`);

      const result = await generateSceneAudio(scene, sceneOrder, session);
      if (!result.ok) {
        allOk = false;
        toast.error(`Scène ${i + 1} échouée : ${result.error}`);
        break;
      }
    }

    if (!allOk) {
      toast.error("Génération interrompue. Corrigez les erreurs puis régénérez les scènes en échec.");
      setGenerating(false);
      return;
    }

    toast.success(`${sortedScenes.length} scènes générées. Assemblage en cours…`);

    // Assemble
    const assembled = await assembleSceneAudio(session);
    if (!assembled) {
      setGenerating(false);
      return;
    }

    setPlayerState({
      audioUrl: assembled.audioUrl,
      fileName: assembled.fileName,
      durationEstimate: assembled.durationEstimate,
      realDuration: null,
    });
    setHistoryRefreshKey((k) => k + 1);

    toast.success(
      `Audio assemblé — ${assembled.fileName} • ${formatSize(assembled.fileSize)} • ~${assembled.durationEstimate.toFixed(1)}s (${assembled.sceneCount} scènes)`
    );

    // Whisper alignment + shot mapping (same as existing flow)
    if (!freeMode) {
      toast.info("Alignement audio en cours via Whisper…");
      try {
        const alignResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-align`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              audioUrl: assembled.audioUrl,
              projectId,
              dualPass: true,
            }),
          }
        );

        if (!alignResponse.ok) {
          const alignErr = await alignResponse.json().catch(() => ({}));
          toast.warning(`Alignement échoué : ${alignErr?.error || "erreur"}`);
        } else {
          const alignData = await alignResponse.json();

          if (alignData.passA && alignData.passB && alignData.dualPassComparison) {
            await supabase
              .from("vo_audio_history")
              .update({ whisper_words: alignData.alignmentRun.words })
              .eq("project_id", projectId)
              .eq("style", "chirp3hd-assembled")
              .order("created_at", { ascending: false })
              .limit(1);

            localStorage.setItem(
              `whisper-dual-${projectId}`,
              JSON.stringify({
                passA: alignData.passA,
                passB: alignData.passB,
                comparison: alignData.dualPassComparison,
                timestamp: new Date().toISOString(),
              })
            );
            window.dispatchEvent(new CustomEvent("whisper-dual-updated", { detail: { projectId } }));

            toast.success(
              `Alignement — ${alignData.wordCount} mots, écart moyen: ${alignData.dualPassComparison.avgDeltaMs}ms`
            );
          } else {
            toast.success(`Alignement terminé — ${alignData.wordCount} mots`);
          }

          // Shot mapping
          if (alignData.alignmentRun && shots && shots.length > 0) {
            toast.info("Mapping des timecodes vers les shots…");
            const sortedShots = getSortedShots();
            const shotSources = sortedShots.map((s) => ({
              shotId: s.id,
              text: getShotFragmentText(s),
            })).filter((s) => s.text.length > 0);

            const { data: latestAudio } = await supabase
              .from("vo_audio_history")
              .select("id")
              .eq("project_id", projectId)
              .eq("style", "chirp3hd-assembled")
              .order("created_at", { ascending: false })
              .limit(1);

            const mapResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chirp-shot-mapping`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  alignmentRun: alignData.alignmentRun,
                  shots: shotSources,
                  projectId,
                  audioHistoryId: latestAudio?.[0]?.id,
                }),
              }
            );

            if (!mapResponse.ok) {
              const mapErr = await mapResponse.json().catch(() => ({}));
              toast.warning(`Mapping shots échoué : ${mapErr?.error || "erreur"}`);
            } else {
              const mapData = await mapResponse.json();
              const exactShots = mapData.shotTimelines?.filter((s: any) => s.status === "exact").length ?? 0;
              const total = mapData.shotTimelines?.length ?? 0;
              if (exactShots === total) {
                toast.success(`Mapping parfait — ${exactShots}/${total} shots calés.`);
              } else {
                toast.warning(`Mapping partiel — ${exactShots}/${total} shots calés précisément.`);
              }
              setHistoryRefreshKey((k) => k + 1);
            }
          }
        }
      } catch (alignErr: any) {
        toast.warning("Alignement Whisper échoué.");
      }
    }

    setGenerating(false);
  };

  // ── Regenerate a single scene then reassemble ──
  const handleRegenerateScene = async (sceneId: string) => {
    if (!scenes || !projectId) return;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      toast.error("Vous devez être connecté.");
      return;
    }

    const sceneOrder = scenesForSort?.find((s) => s.id === sceneId)?.scene_order ?? 0;
    setGenerating(true);

    toast.info(`Régénération scène "${scene.title || "Sans titre"}"…`);
    const result = await generateSceneAudio(scene, sceneOrder, session);

    if (!result.ok) {
      toast.error(`Régénération échouée : ${result.error}`);
      setGenerating(false);
      return;
    }

    toast.success("Scène régénérée. Réassemblage…");
    const assembled = await assembleSceneAudio(session);
    if (!assembled) {
      setGenerating(false);
      return;
    }

    setPlayerState({
      audioUrl: assembled.audioUrl,
      fileName: assembled.fileName,
      durationEstimate: assembled.durationEstimate,
      realDuration: null,
    });
    setHistoryRefreshKey((k) => k + 1);
    toast.success(`Audio réassemblé — ${assembled.durationEstimate.toFixed(1)}s`);

    // Re-run whisper + shot mapping
    if (!freeMode && shots && shots.length > 0) {
      toast.info("Réalignement Whisper…");
      try {
        const alignResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-align`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ audioUrl: assembled.audioUrl, projectId, dualPass: true }),
          }
        );

        if (alignResponse.ok) {
          const alignData = await alignResponse.json();

          if (alignData.alignmentRun) {
            const sortedShots = getSortedShots();
            const shotSources = sortedShots.map((s) => ({
              shotId: s.id,
              text: getShotFragmentText(s),
            })).filter((s) => s.text.length > 0);

            const { data: latestAudio } = await supabase
              .from("vo_audio_history")
              .select("id")
              .eq("project_id", projectId)
              .eq("style", "chirp3hd-assembled")
              .order("created_at", { ascending: false })
              .limit(1);

            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chirp-shot-mapping`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  alignmentRun: alignData.alignmentRun,
                  shots: shotSources,
                  projectId,
                  audioHistoryId: latestAudio?.[0]?.id,
                }),
              }
            );
          }

          toast.success("Réalignement terminé.");
          setHistoryRefreshKey((k) => k + 1);
        }
      } catch {
        toast.warning("Réalignement Whisper échoué.");
      }
    }

    setGenerating(false);
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

      // ── Chirp 3 HD pipeline (separate route) ──
      if (pipelineMode === "chirp3hd") {
        try {
          const chirpResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tts-chirp3hd`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                text: voScript,
                projectId,
                voiceName: settings.voiceName || undefined,
                customFileName: customFileName.trim() || undefined,
                speakingRate: settings.speakingRate + (STYLE_PRESETS[settings.style]?.rateOffset || 0),
                customPronunciations: customPronunciations.length > 0 ? customPronunciations : undefined,
                pauseBetweenParagraphs: settings.pauseBetweenParagraphs ?? 0,
                pauseAfterSentences: settings.pauseAfterSentences ?? 0,
                pauseAfterComma: settings.pauseAfterComma ?? 0,
              }),
            }
          );

          if (!chirpResponse.ok) {
            const errData = await chirpResponse.json().catch(() => ({}));
            throw new Error(errData?.error || `Erreur ${chirpResponse.status}`);
          }

          const chirpData = await chirpResponse.json();

          setPlayerState({
            audioUrl: chirpData.audioUrl,
            fileName: chirpData.fileName,
            durationEstimate: chirpData.durationEstimate,
            realDuration: null,
          });
          setHistoryRefreshKey((k) => k + 1);

          toast.success(
            `Audio Chirp 3 HD généré — ${chirpData.fileName} • ${formatSize(chirpData.fileSize)} • ~${chirpData.durationEstimate}s`
          );

          // ── Step 2: Whisper alignment (skip in free mode) ──
          if (!freeMode) {
          toast.info("Alignement audio en cours via Whisper (double passe)…");
          let alignmentRun: any = null;
          try {
            const alignResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-align`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  audioUrl: chirpData.audioUrl,
                  projectId,
                  dualPass: true,
                }),
              }
            );

            if (!alignResponse.ok) {
              const alignErr = await alignResponse.json().catch(() => ({}));
              console.error("[chirp3hd] Alignment error:", alignErr);
              toast.warning(
                `Audio généré mais alignement échoué : ${alignErr?.error || "erreur inconnue"}`
              );
            } else {
              const alignData = await alignResponse.json();
              alignmentRun = alignData.alignmentRun;

              // Store dual pass raw data if available
              if (alignData.passA && alignData.passB && alignData.dualPassComparison) {
                const cmp = alignData.dualPassComparison;
                console.log("[chirp3hd] Dual pass comparison:", cmp);
                console.log("[chirp3hd] Pass A words:", alignData.passA.length);
                console.log("[chirp3hd] Pass B words:", alignData.passB.length);

                // Persist dual pass data alongside whisper_words
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session) {
                  await supabase
                    .from("vo_audio_history")
                    .update({
                      whisper_words: alignData.alignmentRun.words,
                    })
                    .eq("project_id", projectId)
                    .eq("style", "chirp3hd")
                    .order("created_at", { ascending: false })
                    .limit(1);
                }

                // Store dual pass data in localStorage for the comparison panel
                localStorage.setItem(
                  `whisper-dual-${projectId}`,
                  JSON.stringify({
                    passA: alignData.passA,
                    passB: alignData.passB,
                    comparison: cmp,
                    timestamp: new Date().toISOString(),
                  })
                );

                window.dispatchEvent(
                  new CustomEvent("whisper-dual-updated", {
                    detail: { projectId },
                  })
                );

                toast.success(
                  `Alignement double passe — ${alignData.wordCount} mots, écart moyen: ${cmp.avgDeltaMs}ms, max: ${cmp.maxDeltaMs}ms, p95: ${cmp.p95DeltaMs}ms`,
                  { duration: 8000 }
                );
              } else {
                toast.success(
                  `Alignement terminé — ${alignData.wordCount} mots détectés, durée ${alignData.audioDuration?.toFixed(1)}s`
                );
              }
            }
          } catch (alignErr: any) {
            console.error("[chirp3hd] Alignment fetch error:", alignErr);
            toast.warning("Audio généré mais l'alignement Whisper a échoué.");
          }

          // ── Step 3: Shot mapping ──
          if (alignmentRun && shots && shots.length > 0) {
            toast.info("Mapping des timecodes vers les shots…");
            try {
              // Build sorted shot text list
              const sortedShots = getSortedShots();
               const shotSources = sortedShots.map((s) => ({
                 shotId: s.id,
                 text: getShotFragmentText(s),
               })).filter((s) => s.text.length > 0);

              // Get the audio history ID for this chirp3hd entry
              const { data: latestAudio } = await supabase
                .from("vo_audio_history")
                .select("id")
                .eq("project_id", projectId)
                .eq("style", "chirp3hd")
                .order("created_at", { ascending: false })
                .limit(1);

              const audioHistoryId = latestAudio?.[0]?.id || undefined;

              const mapResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chirp-shot-mapping`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    alignmentRun,
                    shots: shotSources,
                    projectId,
                    audioHistoryId,
                  }),
                }
              );

              if (!mapResponse.ok) {
                const mapErr = await mapResponse.json().catch(() => ({}));
                console.error("[chirp3hd] Shot mapping error:", mapErr);
                toast.warning(`Mapping shots échoué : ${mapErr?.error || "erreur"}`);
              } else {
                const mapData = await mapResponse.json();
                const exactShots = mapData.shotTimelines?.filter((s: any) => s.status === "exact").length ?? 0;
                const partialShots = mapData.shotTimelines?.filter((s: any) => s.status === "partial").length ?? 0;
                const missingShots = mapData.shotTimelines?.filter((s: any) => s.status === "missing").length ?? 0;
                const total = mapData.shotTimelines?.length ?? 0;

                console.log("[chirp3hd] ShotMappingResult:", mapData);

                if (exactShots === total) {
                  toast.success(
                    `Mapping parfait — ${exactShots}/${total} shots calés avec précision.`
                  );
                } else if (exactShots > 0) {
                  toast.warning(
                    `Mapping partiel — ${exactShots}/${total} shots calés précisément. ${partialShots > 0 ? `${partialShots} approximatif(s).` : ""} ${missingShots > 0 ? `${missingShots} manquant(s).` : ""} Le XML ne sera pas généré pour les shots non calés exactement.`
                  );
                } else {
                  toast.error(
                    `Mapping échoué — aucun shot calé avec précision. L'export XML est bloqué. Vérifiez la cohérence entre le script VO et les textes des shots.`
                  );
                }

                // Refresh history to show updated timepoints
                setHistoryRefreshKey((k) => k + 1);
              }
            } catch (mapErr: any) {
              console.error("[chirp3hd] Shot mapping fetch error:", mapErr);
              toast.warning("Mapping des shots échoué.");
            }
          }
          } // end if (!freeMode)
        } catch (e: any) {
          console.error("[chirp3hd] Generation error:", e);
          toast.error(e?.message || "Erreur de génération Chirp 3 HD");
        } finally {
          setGenerating(false);
        }
        return;
      }

      // ── Pipeline SSML historique (inchangé) ──
      // Determine sync mode
      const expectedShotIds = getSortedShots().map((shot) => shot.id);
      let useMarkedSync = false;
      let shotSentences: { id: string; text: string; isNewScene?: boolean }[] | null = null;

      if (freeMode) {
        // Free mode: no sync at all, just generate audio from the text as-is
        console.info("Free mode enabled — generating audio without shot synchronization.");
      } else if (forceStandardMode) {
        // Force mode: still build shotSentences for markers, but skip text/order validation
        console.info("Force sync mode enabled — building shotSentences but skipping validation.");
        shotSentences = buildShotSentences();
        useMarkedSync = shotSentences != null && shotSentences.length > 0;
      } else if (expectedShotIds.length > 0 && userEditedScript) {
        toast.error("Pour un calage exact, le script VO doit être reconstruit depuis les shots actuels avant génération. Activez « Mode libre » pour générer sans synchronisation.");
        return;
      } else if (!userEditedScript) {
        shotSentences = buildShotSentences();
        const syncValidation = validateExactAlignedShotSentences(expectedShotIds, shotSentences);
        const exactShotScript = stripThousandSeparators(buildExactShotScript(getSortedShots()));
        const voMatchesShots = normalizeExactSyncText(voScript) === normalizeExactSyncText(exactShotScript);

        if (expectedShotIds.length > 0 && !voMatchesShots) {
          toast.error("Le script VO doit correspondre exactement aux fragments actuels des shots. Activez « Mode libre » pour générer sans synchronisation.");
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
            // Chirp voices don't support <mark> SSML tags — force standard sync mode
            ...((useMarkedSync && !/Chirp/i.test(settings.voiceName || ""))
              ? { shotSentences, syncMode: "shot_marked", ...(forceStandardMode ? { forceSync: true } : {}) }
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

  // Play/pause a single scene's audio
  const handlePlayScene = (sceneId: string) => {
    const audioInfo = sceneAudioMap.get(sceneId);
    if (!audioInfo) return;

    // Toggle pause/play if same scene
    if (playingSceneId === sceneId && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const { data: { publicUrl } } = supabase.storage.from("vo-audio").getPublicUrl(audioInfo.filePath);

    setPlayingSceneId(sceneId);
    setPlayerState({ audioUrl: publicUrl, fileName: audioInfo.fileName, durationEstimate: audioInfo.durationSeconds, realDuration: null });
    setIsPlaying(false);
    setAudioProgress(0);

    setTimeout(() => {
      const audio = new Audio(publicUrl);
      audioRef.current = audio;
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          setPlayerState((prev) => prev ? { ...prev, realDuration: audio.duration } : prev);
        }
      };
      audio.ontimeupdate = () => {
        if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
      };
      audio.onended = () => { setIsPlaying(false); setAudioProgress(0); setPlayingSceneId(null); };
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
      setPlayingSceneId(null);
    };
  }, []);

  // Reset audio element when player state changes
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
    setPlayingSceneId(null);
    setAudioProgress(0);
  }, [playerState?.audioUrl]);

  const [voOpen, setVoOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [sceneAudioOpen, setSceneAudioOpen] = useState(true);

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
                    <span className="flex items-center gap-2 text-sm font-semibold font-display flex-1">
                      <Settings2 className="h-4 w-4 text-primary" />
                      Paramètres de voix
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive gap-1 ml-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettings(DEFAULT_SETTINGS);
                          setActiveProfileName(null);
                          toast.success("Réglages réinitialisés");
                        }}
                        title="Réinitialiser tous les paramètres"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </Button>
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

              {/* Custom pronunciations panel — collapsible, closed by default */}
              <Collapsible defaultOpen={false}>
                <div className="border rounded-lg border-border bg-card px-4 py-3">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <BookA className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Prononciations IPA personnalisées ({customPronunciations.length})</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <CustomPronunciationsPanel onPronunciationsChange={setCustomPronunciations} hideHeader />
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Custom TTS transforms panel — collapsible, closed by default */}
              <Collapsible defaultOpen={false}>
                <div className="border rounded-lg border-border bg-card px-4 py-3">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Replace className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Transformations texte → TTS</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <CustomTtsTransformsPanel hideHeader />
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            {/* LEFT column (2/3): Script + bottom row */}
            <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
              {/* Script block */}
              <div className="space-y-3">
                {/* Pipeline mode selector */}
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                  <button
                    onClick={() => setPipelineMode("ssml")}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      pipelineMode === "ssml"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Mode SSML historique
                  </button>
                  <button
                    onClick={() => setPipelineMode("chirp3hd")}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      pipelineMode === "chirp3hd"
                        ? "bg-background text-foreground shadow-sm border border-primary/30"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Chirp 3 HD
                    <span className="text-[9px] font-semibold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                      Test
                    </span>
                  </button>
                </div>

                {/* Chirp 3 HD info banner */}
                {pipelineMode === "chirp3hd" && (
                  <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <FlaskConical className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Mode expérimental Chirp 3 HD</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Pipeline parallèle — l'audio sera généré via Chirp 3 HD puis aligné par transcription automatique. Le pipeline SSML historique n'est pas affecté.
                      </p>
                    </div>
                  </div>
                )}

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
                    disabled={!voScript.trim() || generating || assembling}
                    className="min-h-[48px] sm:min-h-[44px] gap-2 w-full sm:w-auto shrink-0"
                    onClick={pipelineMode === "chirp3hd" && scenes && scenes.length > 0 ? handleGenerateAllScenes : handleGenerate}
                  >
                    {generating || assembling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                    {generating
                      ? assembling ? "Assemblage…" : "Génération..."
                      : pipelineMode === "chirp3hd"
                        ? scenes && scenes.length > 0 ? `Générer par scène (${scenes.length})` : "Générer (Chirp 3 HD)"
                        : "Générer la voix off"}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={freeMode}
                      onChange={(e) => setFreeMode(e.target.checked)}
                      className="rounded border-border accent-primary"
                    />
                    <span className="text-[11px] text-muted-foreground">Mode libre (sans synchronisation)</span>
                  </label>
                  {quickProfiles.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <Select
                        value={selectedQuickProfileId || "__none__"}
                        onValueChange={(val) => {
                          if (val === "__none__") return;
                          applyQuickProfile(val);
                        }}
                      >
                        <SelectTrigger className="h-7 w-[180px] text-[11px] border-border">
                          <SelectValue placeholder="Profil de voix…" />
                        </SelectTrigger>
                        <SelectContent>
                          {quickProfiles.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.profile_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                        <span className="text-[11px] text-amber-200">Forcer la génération avec synchronisation (ignorer les validations)</span>
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
                  onChange={(e) => { setVoScript(e.target.value.replace(/\*/g, "")); setUserEditedScript(true); }}
                  placeholder="Collez ou saisissez votre texte narratif ici..."
                  className="min-h-[100px] sm:min-h-[120px] lg:min-h-[110px] text-sm leading-relaxed resize-y font-body"
                  aria-label="Script narratif pour la voix off"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {voScript.length.toLocaleString()} caractères
                  </span>
                </div>

                {/* Per-scene generation status — visible when audio exists OR generation in progress */}
                {pipelineMode === "chirp3hd" && scenes && scenes.length > 0 && (sceneStatuses.size > 0 || sceneAudioMap.size > 0) && (
                  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <AudioLines className="h-3.5 w-3.5 text-primary" />
                      Audio par scène
                      {sceneAudioMap.size > 0 && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({sceneAudioMap.size}/{scenes.length} scènes)
                        </span>
                      )}
                    </h4>
                    <div className="space-y-1.5">
                      {[...scenes]
                        .sort((a, b) => {
                          const oA = scenesForSort?.find((s) => s.id === a.id)?.scene_order ?? 0;
                          const oB = scenesForSort?.find((s) => s.id === b.id)?.scene_order ?? 0;
                          return oA - oB;
                        })
                        .map((scene, idx) => {
                          const status = sceneStatuses.get(scene.id) || (sceneAudioMap.has(scene.id) ? "done" : undefined);
                          const error = sceneErrors.get(scene.id);
                          const audioInfo = sceneAudioMap.get(scene.id);
                          if (!status && !audioInfo) return null;
                          return (
                            <div key={scene.id} className="text-xs">
                              <div className="flex items-center gap-2">
                                {/* Play/Pause button */}
                                {audioInfo && !generating ? (
                                  <button
                                    type="button"
                                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-sm transition-colors bg-primary-foreground ${
                                      playingSceneId === scene.id && isPlaying
                                        ? "text-primary"
                                        : "text-amber-400"
                                    }`}
                                    onClick={() => handlePlayScene(scene.id)}
                                    title={playingSceneId === scene.id && isPlaying ? "Pause" : "Lire l'audio"}
                                  >
                                    {playingSceneId === scene.id && isPlaying ? (
                                      <Pause className="h-3 w-3" />
                                    ) : (
                                      <Play className="h-3 w-3" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-4 flex-shrink-0" />
                                )}
                                <span className="w-5 text-white text-right flex-shrink-0 text-sm">{idx + 1}.</span>
                                {status === "generating" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                {status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                {status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
                                {status === "pending" && <Clock className="h-3 w-3 text-muted-foreground" />}
                                <span className={`flex-1 truncate text-sm ${status === "error" ? "text-destructive" : "bg-primary-foreground text-primary"}`}>
                                  {scene.title || "Sans titre"}
                                </span>
                                {audioInfo && (
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {audioInfo.durationSeconds > 0 ? `${audioInfo.durationSeconds.toFixed(1)}s` : ""}
                                  </span>
                                )}
                                {error && <span className="text-[10px] text-destructive truncate max-w-[200px]">{error}</span>}
                                {/* Download button */}
                                {audioInfo && !generating && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    title={`Télécharger ${audioInfo.fileName}`}
                                    onClick={() => {
                                      const { data: { publicUrl } } = supabase.storage.from("vo-audio").getPublicUrl(audioInfo.filePath);
                                      const a = document.createElement("a");
                                      a.href = publicUrl;
                                      a.download = audioInfo.fileName;
                                      a.click();
                                    }}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                )}
                                {/* Regenerate button */}
                                {status === "done" && !generating && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] gap-1"
                                    onClick={() => handleRegenerateScene(scene.id)}
                                    disabled={generating || assembling}
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                    Régénérer
                                  </Button>
                                )}
                                {status === "error" && !generating && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] gap-1 text-destructive"
                                    onClick={() => handleRegenerateScene(scene.id)}
                                    disabled={generating || assembling}
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                    Réessayer
                                  </Button>
                                )}
                              </div>
                              {/* Transcription text */}
                              {scene.source_text && (
                                <p className="pl-11 text-sm text-white leading-relaxed mt-1 mb-1.5 font-body">
                                  {scene.source_text}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
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
        {/* ─── Chirp Alignment Review ─── */}
        {pipelineMode === "chirp3hd" && (
          <div className="mt-4">
            <ChirpAlignmentReview
              projectId={projectId}
              shots={shots}
              scenesForSort={scenesForSort}
              refreshKey={historyRefreshKey}
            />
          </div>
        )}
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
