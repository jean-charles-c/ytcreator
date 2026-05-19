import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Youtube, Loader2, Trophy, Copy, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface NarrativeAnalysis {
  central_mystery: string;
  main_contradiction: string;
  intriguing_discoveries: string[];
  narrative_tensions: { title: string; description: string }[];
}

interface YoutubeTitle {
  rank: number;
  title: string;
  hook_type: string;
}

interface SeoResults {
  titles: YoutubeTitle[] | null;
  description: string | null;
  tags: string | null;
}

interface SeoTabProps {
  projectId: string | null;
  analysis: NarrativeAnalysis | null;
  extractedText: string | null;
  narration?: string;
  scriptLanguage: string;
  seoResults: SeoResults;
  onSeoResultsChange: (results: SeoResults) => void;
}

const hookBadgeColor = (type: string) => {
  const map: Record<string, string> = {
    question: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    paradoxe: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    superlatif: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    mystère: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    révélation: "bg-red-500/10 text-red-400 border-red-500/20",
    paradox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    superlative: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    mystery: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    revelation: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return map[type.toLowerCase()] || "bg-secondary text-muted-foreground border-border";
};

const VO_AUDIO_TIMEPOINTS_UPDATED_EVENT = "vo-audio-timepoints-updated";

const formatYoutubeTimecode = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

const getStandaloneChapterTitle = (sourceText: string | null) => {
  const firstLine = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || firstLine.length > 60) return null;
  return firstLine.replace(/[.,;:!?]+$/, "").replace(/\s+/g, " ").trim() || null;
};

const getShotTimepointSeconds = (timepoint: any) => {
  const value = timepoint?.timeSeconds ?? timepoint?.time_seconds;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
};

const stripGeneratedTimestampLines = (description: string | null) => {
  if (!description) return null;

  const cleaned = description
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !/^\d{1,2}[:/]\d{2}(?::\d{2})?\s+\S/.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
};

export default function SeoTab({ projectId, analysis, extractedText, narration, scriptLanguage, seoResults, onSeoResultsChange }: SeoTabProps) {
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [chaptersBlock, setChaptersBlock] = useState<string>("");

  const youtubeTitles = seoResults?.titles ?? null;
  const youtubeDescription = stripGeneratedTimestampLines(seoResults?.description ?? null);
  const youtubeTags = seoResults?.tags ?? null;

  // Charge les titres de chapitres réels et leurs timecodes précis depuis les timepoints Whisper validés.
  useEffect(() => {
    if (!projectId) { setChaptersBlock(""); return; }
    let cancelled = false;
    const loadChaptersBlock = async () => {
      try {
        const { data: scenes } = await supabase
          .from("scenes")
          .select("id, scene_order, source_text")
          .eq("project_id", projectId)
          .order("scene_order", { ascending: true });
        if (!scenes || scenes.length === 0) { if (!cancelled) setChaptersBlock(""); return; }

        const chapterScenes = (scenes as any[])
          .map((scene) => ({ ...scene, chapterTitle: getStandaloneChapterTitle(scene.source_text) }))
          .filter((scene) => scene.chapterTitle);
        if (chapterScenes.length === 0) { if (!cancelled) setChaptersBlock(""); return; }

        const { data: shots } = await supabase
          .from("shots")
          .select("id, scene_id, shot_order")
          .eq("project_id", projectId)
          .order("shot_order", { ascending: true });

        const firstShotByScene = new Map<string, string>();
        (shots ?? []).forEach((shot: any) => {
          if (!firstShotByScene.has(shot.scene_id)) {
            firstShotByScene.set(shot.scene_id, shot.id);
          }
        });

        const { data: state } = await supabase
          .from("project_scriptcreator_state")
          .select("timeline_state")
          .eq("project_id", projectId)
          .maybeSingle();
        const selectedAudioId = (state?.timeline_state as any)?.audioTrack?.audioId ?? null;

        let audioWithTimepoints: any = null;
        if (selectedAudioId) {
          const { data: selectedAudio } = await supabase
            .from("vo_audio_history")
            .select("id, shot_timepoints, created_at")
            .eq("id", selectedAudioId)
            .maybeSingle();
          if (Array.isArray((selectedAudio as any)?.shot_timepoints) && (selectedAudio as any).shot_timepoints.length > 0) {
            audioWithTimepoints = selectedAudio;
          }
        }

        if (!audioWithTimepoints) {
          const { data: audios } = await supabase
            .from("vo_audio_history")
            .select("id, shot_timepoints, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(10);
          audioWithTimepoints = (audios ?? []).find((audio: any) => Array.isArray(audio.shot_timepoints) && audio.shot_timepoints.length > 0) ?? null;
        }

        const timepoints = Array.isArray(audioWithTimepoints?.shot_timepoints) ? audioWithTimepoints.shot_timepoints : [];
        const timeByShotId = new Map<string, number>();
        timepoints.forEach((tp: any) => {
          const shotId = tp?.shotId ?? tp?.shot_id;
          const seconds = getShotTimepointSeconds(tp);
          if (shotId && seconds !== null) timeByShotId.set(String(shotId), seconds);
        });

        const lines = chapterScenes.flatMap((scene: any) => {
          const firstShotId = firstShotByScene.get(scene.id);
          if (!firstShotId) return [];
          const timeSeconds = timeByShotId.get(firstShotId);
          if (timeSeconds === undefined) return [];
          return [`${formatYoutubeTimecode(timeSeconds)} ${scene.chapterTitle}`];
        });

        if (!cancelled) setChaptersBlock(lines.length > 0 ? lines.join("\n") : "");
      } catch (e) {
        console.error("[SeoTab] chapters timecodes error", e);
        if (!cancelled) setChaptersBlock("");
      }
    };

    void loadChaptersBlock();
    const handleTimepointsUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail?.projectId && detail.projectId !== projectId) return;
      void loadChaptersBlock();
    };

    window.addEventListener(VO_AUDIO_TIMEPOINTS_UPDATED_EVENT, handleTimepointsUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(VO_AUDIO_TIMEPOINTS_UPDATED_EVENT, handleTimepointsUpdated);
    };
  }, [projectId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copié`);
    }).catch(() => toast.error("Impossible de copier"));
  };

  const effectiveText = extractedText || narration || null;

  const runYoutubePackaging = useCallback(async () => {
    if (!effectiveText) return;
    setGeneratingTitles(true);
    try {
      const body: any = { text: effectiveText, language: scriptLanguage };
      if (analysis) body.analysis = analysis;
      const { data, error } = await supabase.functions.invoke("youtube-packaging", { body });
      if (error) { toast.error("Erreur de génération"); console.error(error); setGeneratingTitles(false); return; }
      if (data?.error) { toast.error(data.error); setGeneratingTitles(false); return; }
      const sorted = (data.titles as YoutubeTitle[]).sort((a, b) => a.rank - b.rank);
      onSeoResultsChange({ titles: sorted, description: stripGeneratedTimestampLines(data.description || null), tags: data.tags || null });
      toast.success("SEO YouTube généré");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingTitles(false);
  }, [analysis, effectiveText, scriptLanguage]);

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        SEO & YouTube Packaging
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Générez des titres, description et tags YouTube optimisés.
      </p>




      {!effectiveText ? (
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <Youtube className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Lancez d'abord l'analyse narrative dans l'onglet ScriptCreator ou saisissez votre narration dans ScriptInput.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!youtubeTitles && (
            <div className="mb-6">
              <Button variant="hero" disabled={generatingTitles} onClick={runYoutubePackaging} className="min-h-[44px]">
                {generatingTitles ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération SEO...</> : <><Youtube className="h-4 w-4" /> Générer le packaging YouTube</>}
              </Button>
            </div>
          )}

          {generatingTitles && (
            <div className="flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Génération du packaging YouTube…</p>
            </div>
          )}

          {youtubeTitles && (
            <div className="space-y-6 animate-fade-in">
              {/* Titles */}
              <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Youtube className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold text-foreground">Titres YouTube — classés par potentiel de clic</h3>
                </div>
                <div className="space-y-2">
                  {youtubeTitles.map((t, i) => (
                    <div key={i} className="flex items-start sm:items-center gap-2 sm:gap-3 rounded border border-border bg-background p-3 transition-colors hover:bg-secondary/30">
                      <div className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold mt-0.5 sm:mt-0 ${i === 0 ? "bg-primary text-primary-foreground" : i < 3 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : t.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{t.title}</p>
                        <span className={`inline-block mt-1 sm:hidden text-[10px] px-2 py-0.5 rounded-full border ${hookBadgeColor(t.hook_type)}`}>
                          {t.hook_type}
                        </span>
                      </div>
                      <span className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${hookBadgeColor(t.hook_type)}`}>
                        {t.hook_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              {youtubeDescription && (() => {
                const fullDescription = chaptersBlock
                  ? `${chaptersBlock}\n\n${youtubeDescription}`
                  : youtubeDescription;
                return (
                <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Youtube className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold text-foreground">Description YouTube</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(fullDescription, "Description")} className="h-8 text-xs">
                      <Copy className="h-3 w-3" /> Copier
                    </Button>
                  </div>
                  <div className="rounded border border-border bg-background p-3 sm:p-4">
                    <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{fullDescription}</pre>
                  </div>
                </div>
                );
              })()}

              {/* Tags */}
              {youtubeTags && (
                <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold text-foreground">Tags YouTube</h3>
                      <span className="text-[10px] text-muted-foreground">({youtubeTags.length}/500 car.)</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(youtubeTags, "Tags")} className="h-8 text-xs">
                      <Copy className="h-3 w-3" /> Copier
                    </Button>
                  </div>
                  <div className="rounded border border-border bg-background p-3 sm:p-4">
                    <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{youtubeTags}</pre>
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <Button variant="outline" onClick={() => onSeoResultsChange({ titles: null, description: null, tags: null })} className="min-h-[44px]">
                <Youtube className="h-4 w-4" /> Régénérer le packaging
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
