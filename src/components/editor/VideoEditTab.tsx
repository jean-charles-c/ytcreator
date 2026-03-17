import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Film,
  Layers,
  Clapperboard,
  ImageIcon,
  Volume2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  Clock,
  FileAudio,
  Wand2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { Tables } from "@/integrations/supabase/types";
import { assembleTimeline, type Timeline } from "./timelineAssembly";
import TimelineView from "./TimelineView";
import ExportManager from "./ExportManager";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;
type AudioFile = Tables<"vo_audio_history">;

interface AssetCheck {
  label: string;
  icon: React.ElementType;
  status: "valid" | "missing" | "warning" | "loading";
  detail: string;
  count?: number;
  total?: number;
}

interface VideoEditTabProps {
  projectId: string | null;
  scenes: Scene[];
  shots: Shot[];
}

const STATUS_CONFIG = {
  valid: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    label: "OK",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    label: "Partiel",
  },
  missing: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
    label: "Manquant",
  },
  loading: {
    icon: Loader2,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    label: "Chargement…",
  },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── AudioSelector ──────────────────────────────────────────────────
function AudioSelector({
  audioFiles,
  selectedAudioId,
  onSelect,
}: {
  audioFiles: AudioFile[];
  selectedAudioId: string | null;
  onSelect: (id: string) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePreview = (file: AudioFile) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (previewId === file.id && isPlaying) {
      setIsPlaying(false);
      setPreviewId(null);
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vo-audio/${file.file_path}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setIsPlaying(false);
      setPreviewId(null);
    };
    audio.play();
    setPreviewId(file.id);
    setIsPlaying(true);
  };

  if (audioFiles.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <FileAudio className="h-3.5 w-3.5" />
        AudioSelector — Choisir l'audio de référence
      </h3>
      <div className="space-y-2">
        {audioFiles.map((file) => {
          const isSelected = selectedAudioId === file.id;
          return (
            <button
              key={file.id}
              onClick={() => onSelect(file.id)}
              className={`w-full text-left rounded-lg border p-3 sm:p-4 transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/30 hover:bg-card/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(file);
                  }}
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 text-foreground transition-colors shrink-0"
                  aria-label={previewId === file.id && isPlaying ? "Pause" : "Écouter"}
                >
                  {previewId === file.id && isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 ml-0.5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {file.file_name}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Sélectionné
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    {file.duration_estimate ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(file.duration_estimate)}
                      </span>
                    ) : null}
                    {file.file_size ? <span>{formatSize(file.file_size)}</span> : null}
                    <span>{file.voice_gender === "FEMALE" ? "♀" : "♂"} {file.language_code}</span>
                    {file.style && file.style !== "neutral" && (
                      <span className="capitalize">{file.style}</span>
                    )}
                    {file.created_at && <span>{formatDate(file.created_at)}</span>}
                  </div>
                </div>
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Collapsible Section ────────────────────────────────────────────
function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer">
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">{title}</span>
          {badge && <span className="text-[10px] text-muted-foreground ml-auto">{badge}</span>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── VideoEditTab ───────────────────────────────────────────────────
export default function VideoEditTab({ projectId, scenes, shots }: VideoEditTabProps) {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [savingTimeline, setSavingTimeline] = useState(false);

  // ── Persist timeline to DB ──
  const saveTimelineToDb = useCallback(async (tl: Timeline) => {
    if (!projectId) return;
    setSavingTimeline(true);
    try {
      // Preserve exports in timeline_state
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      const currentState = (data?.timeline_state as any) ?? {};
      await supabase
        .from("project_scriptcreator_state")
        .update({ timeline_state: { ...tl, exports: currentState.exports } as any })
        .eq("project_id", projectId);
    } catch (e) {
      console.error("Failed to save timeline:", e);
    } finally {
      setSavingTimeline(false);
    }
  }, [projectId]);

  // ── Restore timeline from DB on mount ──
  useEffect(() => {
    if (!projectId) return;
    const restore = async () => {
      const { data } = await supabase
        .from("project_scriptcreator_state")
        .select("timeline_state")
        .eq("project_id", projectId)
        .single();
      if (data?.timeline_state) {
        setTimeline(data.timeline_state as unknown as Timeline);
      }
    };
    restore();
  }, [projectId]);

  const handleTimelineChange = useCallback((tl: Timeline) => {
    setTimeline(tl);
    saveTimelineToDb(tl);
  }, [saveTimelineToDb]);

  const handleAssembleTimeline = useCallback(() => {
    if (!selectedAudioId) {
      toast.error("Sélectionnez un audio avant d'assembler la timeline.");
      return;
    }
    const audioFile = audioFiles.find((a) => a.id === selectedAudioId);
    if (!audioFile) return;
    if (shots.length === 0) {
      toast.error("Aucun shot disponible pour générer la timeline.");
      return;
    }
    const timepoints = (audioFile as any).shot_timepoints ?? null;
    const assembled = assembleTimeline(scenes, shots, audioFile, timepoints);
    setTimeline(assembled);
    saveTimelineToDb(assembled);
    const syncMode = timepoints ? "sync précis" : "sync proportionnel";
    toast.success(`Timeline assemblée — ${assembled.segmentCount} segments, ${Math.round(assembled.totalDuration)}s (${syncMode})`);
  }, [selectedAudioId, audioFiles, scenes, shots, saveTimelineToDb]);

  useEffect(() => {
    if (!projectId) {
      setLoadingAudio(false);
      return;
    }

    const fetchAudio = async () => {
      setLoadingAudio(true);
      const { data } = await supabase
        .from("vo_audio_history")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      setAudioFiles(data ?? []);
      if (data && data.length > 0 && !selectedAudioId) {
        setSelectedAudioId(data[0].id);
      }
      setLoadingAudio(false);
    };

    fetchAudio();
  }, [projectId]);

  // Compute asset checks
  const shotsWithImage = shots.filter((s) => s.image_url);
  const shotsWithSentence = shots.filter((s) => s.source_sentence || s.source_sentence_fr);

  const checks: AssetCheck[] = [
    {
      label: "Segmentation narrative",
      icon: Layers,
      status: scenes.length > 0 ? "valid" : "missing",
      detail: scenes.length > 0 ? `${scenes.length} scène${scenes.length > 1 ? "s" : ""} détectée${scenes.length > 1 ? "s" : ""}` : "Aucune scène segmentée",
      count: scenes.length,
    },
    {
      label: "Liste des shots",
      icon: Clapperboard,
      status: shots.length > 0 ? "valid" : "missing",
      detail: shots.length > 0 ? `${shots.length} shot${shots.length > 1 ? "s" : ""} généré${shots.length > 1 ? "s" : ""}` : "Aucun shot généré",
      count: shots.length,
    },
    {
      label: "Phrase associée par shot",
      icon: Film,
      status: shots.length === 0 ? "missing" : shotsWithSentence.length === shots.length ? "valid" : shotsWithSentence.length > 0 ? "warning" : "missing",
      detail: shots.length === 0 ? "Aucun shot disponible" : `${shotsWithSentence.length}/${shots.length} shots avec phrase associée`,
      count: shotsWithSentence.length,
      total: shots.length,
    },
    {
      label: "Visuel par shot",
      icon: ImageIcon,
      status: shots.length === 0 ? "missing" : shotsWithImage.length === shots.length ? "valid" : shotsWithImage.length > 0 ? "warning" : "missing",
      detail: shots.length === 0 ? "Aucun shot disponible" : `${shotsWithImage.length}/${shots.length} shots avec visuel`,
      count: shotsWithImage.length,
      total: shots.length,
    },
    {
      label: "Audio narration",
      icon: Volume2,
      status: loadingAudio ? "loading" : selectedAudioId ? "valid" : audioFiles.length > 0 ? "warning" : "missing",
      detail: loadingAudio ? "Vérification…" : selectedAudioId ? `Audio sélectionné : ${audioFiles.find((a) => a.id === selectedAudioId)?.file_name ?? "—"}` : audioFiles.length > 0 ? `${audioFiles.length} audio(s) disponible(s) — aucun sélectionné` : "Aucun audio généré",
      count: audioFiles.length,
    },
  ];

  const allValid = checks.every((c) => c.status === "valid");
  const hasBlocking = checks.some((c) => c.status === "missing");
  const validCount = checks.filter((c) => c.status === "valid").length;

  return (
    <div className="container max-w-4xl py-4 sm:py-6 lg:py-10 px-3 sm:px-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Film className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg sm:text-xl lg:text-2xl font-semibold text-foreground">
          VidéoEdit
        </h2>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">
        Assemblez vos assets en pré-montage vidéo. Vérifiez la complétude avant de générer la timeline.
      </p>

      <div className="space-y-3">
        {/* ── Collapsible: Status summary ── */}
        <CollapsibleSection
          title={allValid ? "Tous les assets sont prêts" : hasBlocking ? "Des assets sont manquants" : "Certains assets sont incomplets"}
          icon={allValid ? CheckCircle2 : hasBlocking ? XCircle : AlertTriangle}
          badge={`${validCount}/${checks.length}`}
        >
          {/* Global status banner */}
          <div
            className={`rounded-lg border p-4 mb-4 flex items-center gap-3 ${
              allValid ? "border-emerald-400/30 bg-emerald-400/5" : hasBlocking ? "border-red-400/30 bg-red-400/5" : "border-amber-400/30 bg-amber-400/5"
            }`}
          >
            {allValid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : hasBlocking ? (
              <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                {allValid ? "Tous les assets sont prêts" : hasBlocking ? "Des assets sont manquants" : "Certains assets sont incomplets"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{validCount}/{checks.length} vérifications passées</p>
            </div>
          </div>

          {/* AssetStatusPanel */}
          <div className="space-y-3">
            {checks.map((check, i) => {
              const cfg = STATUS_CONFIG[check.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors ${cfg.border} ${cfg.bg}`}>
                  <div className={`flex items-center justify-center h-9 w-9 rounded-md ${cfg.bg} shrink-0`}>
                    <check.icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{check.label}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className={`h-2.5 w-2.5 ${check.status === "loading" ? "animate-spin" : ""}`} />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{check.detail}</p>
                  </div>
                  {check.total !== undefined && check.total > 0 && (
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${check.status === "valid" ? "bg-emerald-400" : check.status === "warning" ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${(check.count! / check.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{check.count}/{check.total}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* ── Collapsible: Audio Selector ── */}
        {!loadingAudio && audioFiles.length > 0 && (
          <CollapsibleSection
            title="Audio de référence"
            icon={Volume2}
            badge={selectedAudioId ? "Sélectionné" : `${audioFiles.length} disponible(s)`}
          >
            <AudioSelector
              audioFiles={audioFiles}
              selectedAudioId={selectedAudioId}
              onSelect={setSelectedAudioId}
            />
          </CollapsibleSection>
        )}

        {/* ── Assemble button + Timeline ── */}
        {selectedAudioId && shots.length > 0 && (
          <div className="space-y-3 pt-3">
            {!timeline && (
              <div className="flex justify-center">
                <Button variant="hero" onClick={handleAssembleTimeline} className="min-h-[48px] gap-2">
                  <Wand2 className="h-4 w-4" />
                  Assembler la timeline
                </Button>
              </div>
            )}
            {timeline && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Timeline générée le {new Date(timeline.createdAt).toLocaleString("fr-FR")}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleAssembleTimeline} className="h-7 text-xs gap-1.5">
                    <Wand2 className="h-3 w-3" />
                    Régénérer
                  </Button>
                </div>

                {/* Collapsible: Preview + Timeline */}
                <CollapsibleSection title="Prévisualisation & Timeline" icon={Film} badge={`${timeline.segmentCount} segments`}>
                  <TimelineView timeline={timeline} onTimelineChange={handleTimelineChange} />
                </CollapsibleSection>

                {/* Collapsible: Export Manager */}
                <CollapsibleSection title="Export Manager" icon={Film}>
                  <ExportManager timeline={timeline} projectId={projectId!} />
                </CollapsibleSection>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
