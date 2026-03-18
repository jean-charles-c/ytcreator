import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Film,
  ImageIcon,
  Volume2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ArrowUp,
  ArrowDown,
  Clock,
  Replace,
  Minus,
  Plus,
  ZoomIn,
  ZoomOut,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Timeline, ShotSegment } from "./timelineAssembly";
import { updateTimelineSegments } from "./timelineAssembly";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface TimelineViewProps {
  timeline: Timeline;
  onTimelineChange?: (timeline: Timeline) => void;
  imageOffsetMs?: number;
  onImageOffsetChange?: (ms: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function findSegmentAt(segments: ShotSegment[], time: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].startTime) return i;
  }
  return 0;
}

// ── Editable Segment Card ──────────────────────────────────────────
function EditableSegmentCard({
  segment,
  index,
  total,
  isActive,
  displayIndex,
  onSeek,
  onMoveUp,
  onMoveDown,
  onDurationChange,
  onReplaceImage,
}: {
  segment: ShotSegment;
  index: number;
  total: number;
  isActive: boolean;
  displayIndex: number;
  onSeek: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDurationChange: (delta: number) => void;
  onReplaceImage: () => void;
}) {
  const hasImage = !!segment.imageUrl;

  return (
    <div
      className={`flex flex-col sm:flex-row gap-2 items-start rounded-md px-2 py-2 sm:py-1.5 transition-colors ${
        isActive ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/50"
      }`}
    >
      {/* Top row on mobile: timecode + thumbnail + info */}
      <div className="flex gap-2 items-start w-full sm:w-auto sm:contents">
        {/* Timecode */}
        <button onClick={onSeek} className="w-12 shrink-0 pt-1 text-right min-h-[44px] sm:min-h-0 flex items-center sm:items-start justify-end" title="Aller à ce segment">
          <span className={`text-[10px] font-mono ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            {formatTime(segment.startTime)}
          </span>
        </button>

        {/* Thumbnail */}
        <button
          onClick={onReplaceImage}
          className={`relative w-16 h-10 rounded border shrink-0 overflow-hidden group/thumb ${isActive ? "border-primary/40" : "border-border"}`}
          title="Remplacer le visuel"
        >
          {hasImage ? (
            <img src={segment.imageUrl!} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <ImageIcon className="h-3 w-3 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
            <Replace className="h-3 w-3 text-white" />
          </div>
        </button>

        {/* Info */}
        <button onClick={onSeek} className="flex-1 min-w-0 py-0.5 text-left min-h-[44px] sm:min-h-0 flex flex-col justify-center">
          <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
              Shot {displayIndex}
            </span>
          </div>
          <p className="text-xs text-foreground leading-snug mt-0.5 line-clamp-1">
            {segment.sentence || segment.description}
          </p>
        </button>
      </div>

      {/* Edit controls — horizontal row on mobile, vertical on desktop */}
      <div className="flex sm:flex-col items-center gap-1 sm:gap-0.5 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
        {/* Reorder */}
        <div className="flex gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="h-8 w-8 sm:h-5 sm:w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Monter"
          >
            <ArrowUp className="h-4 w-4 sm:h-3 sm:w-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="h-8 w-8 sm:h-5 sm:w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Descendre"
          >
            <ArrowDown className="h-4 w-4 sm:h-3 sm:w-3" />
          </button>
        </div>
        {/* Duration */}
        <div className="flex items-center gap-0.5 ml-2 sm:ml-0" title="Durée d'affichage du visuel">
          <button
            onClick={() => onDurationChange(-0.5)}
            disabled={segment.duration <= 0.5}
            className="h-8 w-8 sm:h-5 sm:w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Réduire la durée de 0.5s"
          >
            <Minus className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
          </button>
          <span className="text-[9px] font-mono text-muted-foreground w-8 text-center" title="Durée d'affichage">
            {segment.duration.toFixed(1)}s
          </span>
          <button
            onClick={() => onDurationChange(0.5)}
            className="h-8 w-8 sm:h-5 sm:w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Augmenter la durée de 0.5s"
          >
            <Plus className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hidden file input for image replacement ────────────────────────
function useImageReplacer(onImageSelected: (segId: string, url: string) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const targetSegIdRef = useRef<string>("");

  const triggerReplace = useCallback((segId: string) => {
    targetSegIdRef.current = segId;
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image.");
      return;
    }
    const url = URL.createObjectURL(file);
    onImageSelected(targetSegIdRef.current, url);
    toast.success("Visuel remplacé (local)");
    // Reset input
    if (inputRef.current) inputRef.current.value = "";
  }, [onImageSelected]);

  const InputElement = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  return { triggerReplace, InputElement };
}

// ── Main component ─────────────────────────────────────────────────
export default function TimelineView({ timeline, onTimelineChange, imageOffsetMs = 0, onImageOffsetChange }: TimelineViewProps) {
  const { videoTrack, audioTrack } = timeline;
  const segments = videoTrack.segments;

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audioTrack.durationEstimate || timeline.totalDuration);
  const rafRef = useRef<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const miniTimelineRef = useRef<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1); // 1x to 30x
  const [segmentsOpen, setSegmentsOpen] = useState(false);

  // ── Drift correction: scale segment times to match actual audio duration ──
  const scaledSegments = useMemo(() => {
    const estimatedDuration = timeline.totalDuration;
    if (!estimatedDuration || estimatedDuration <= 0 || !audioDuration || audioDuration <= 0) return segments;
    const scale = audioDuration / estimatedDuration;
    // Only apply correction if drift is significant (>1%)
    if (Math.abs(scale - 1) < 0.01) return segments;
    return segments.map((seg) => ({
      ...seg,
      startTime: Math.round(seg.startTime * scale * 100) / 100,
      duration: Math.round(seg.duration * scale * 100) / 100,
    }));
  }, [segments, audioDuration, timeline.totalDuration]);

  // Apply image offset (convert ms to seconds) for segment lookup
  const imageOffsetSec = imageOffsetMs / 1000;
  const activeIndex = useMemo(
    () => findSegmentAt(scaledSegments, currentTime + imageOffsetSec),
    [scaledSegments, currentTime, imageOffsetSec]
  );
  const activeSegment = scaledSegments[activeIndex] ?? null;

  const waveformHeights = useMemo(
    () => Array.from({ length: 80 }, (_, i) => 20 + Math.sin(i * 0.7) * 35 + (Math.sin(i * 2.1) + 1) * 15),
    []
  );

  // ── Edit handlers ──
  const updateSegments = useCallback((newSegs: ShotSegment[]) => {
    if (!onTimelineChange) return;
    onTimelineChange(updateTimelineSegments(timeline, newSegs));
  }, [timeline, onTimelineChange]);

  const handleMoveSegment = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= segments.length) return;
    const newSegs = [...segments];
    const [moved] = newSegs.splice(fromIndex, 1);
    newSegs.splice(toIndex, 0, moved);
    updateSegments(newSegs);
  }, [segments, updateSegments]);

  const handleDurationChange = useCallback((segId: string, delta: number) => {
    const newSegs = segments.map((s) =>
      s.id === segId
        ? { ...s, duration: Math.max(0.5, Math.round((s.duration + delta) * 100) / 100) }
        : s
    );
    updateSegments(newSegs);
  }, [segments, updateSegments]);

  const handleImageReplaced = useCallback((segId: string, url: string) => {
    const newSegs = segments.map((s) =>
      s.id === segId ? { ...s, imageUrl: url } : s
    );
    updateSegments(newSegs);
  }, [segments, updateSegments]);

  const { triggerReplace, InputElement } = useImageReplacer(handleImageReplaced);

  // ── Audio init ──
  useEffect(() => {
    const audio = new Audio(audioTrack.audioUrl);
    audio.preload = "metadata";
    audioRef.current = audio;
    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setAudioDuration(audio.duration);
    };
    audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.pause(); audio.src = ""; audioRef.current = null;
    };
  }, [audioTrack.audioUrl]);

  // RAF-based time update during playback
  useEffect(() => {
    if (!isPlaying) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime;
        setCurrentTime(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Scroll active shot to TOP of list during playback
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-seg-index="${activeIndex}"]`) as HTMLElement | null;
    if (!el) return;
    const container = listRef.current;
    // Scroll so the active element is at the top of the visible area
    const scrollTarget = el.offsetTop - container.offsetTop;
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
  }, [activeIndex]);

  // progressPct (needed early for mini-timeline auto-scroll)
  const progressPct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  // Auto-scroll mini-timeline to keep playhead visible when zoomed
  useEffect(() => {
    if (!miniTimelineRef.current || zoomLevel <= 1) return;
    const container = miniTimelineRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const targetScroll = (progressPct / 100) * scrollWidth - clientWidth / 2;
    container.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  }, [activeIndex, zoomLevel, progressPct]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play(); setIsPlaying(true); }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(time, audioDuration));
    audio.currentTime = clamped; setCurrentTime(clamped);
  }, [audioDuration]);

  const skipPrev = useCallback(() => {
    seekTo(activeIndex > 0 ? scaledSegments[activeIndex - 1].startTime : 0);
  }, [activeIndex, scaledSegments, seekTo]);

  const skipNext = useCallback(() => {
    if (activeIndex < scaledSegments.length - 1) seekTo(scaledSegments[activeIndex + 1].startTime);
  }, [activeIndex, scaledSegments, seekTo]);

  // ── Scrubbing ──
  const scrubTargetRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const wasPlayingRef = useRef(false);

  const scrubFromPointer = useCallback((clientX: number) => {
    if (!scrubTargetRef.current) return;
    const rect = scrubTargetRef.current.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * audioDuration);
  }, [seekTo, audioDuration]);

  const scrubFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    scrubFromPointer(e.clientX);
  }, [scrubFromPointer]);

  const handleScrubStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    scrubTargetRef.current = e.currentTarget as HTMLDivElement;
    setIsScrubbing(true);
    wasPlayingRef.current = isPlaying;
    if (isPlaying) audioRef.current?.pause();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    scrubFromPointer(clientX);
  }, [isPlaying, scrubFromPointer]);

  useEffect(() => {
    if (!isScrubbing) return;
    const onMouseMove = (e: MouseEvent) => scrubFromPointer(e.clientX);
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); scrubFromPointer(e.touches[0].clientX); };
    const onEnd = () => {
      setIsScrubbing(false);
      if (wasPlayingRef.current) { audioRef.current?.play(); setIsPlaying(true); }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isScrubbing, scrubFromPointer]);

  // progressPct already defined above

  // sceneGroups removed — flat shot-based list

  return (
    <div className="space-y-4">
      {InputElement}

      {/* ═══ VideoPreviewPlayer ═══ */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {segments.map((seg, idx) => {
            const isActive = seg.id === activeSegment?.id;
            return seg.imageUrl ? (
              <img
                key={seg.id}
                src={seg.imageUrl}
                alt={`Shot ${idx + 1}`}
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out ${isActive ? "opacity-100 z-[1]" : "opacity-0 z-0"}`}
              />
            ) : isActive ? (
              <div key={seg.id} className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-[1] animate-fade-in">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                </div>
                <span className="text-xs text-muted-foreground/40">Shot {idx + 1} — pas de visuel</span>
              </div>
            ) : null;
          })}
          {!activeSegment && (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
              <span className="text-xs text-muted-foreground/40">Aucun segment</span>
            </div>
          )}
          {activeSegment && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
              <p className="text-white text-sm leading-snug line-clamp-2 drop-shadow">{activeSegment.sentence || activeSegment.description}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-white/60 font-mono">Shot {activeIndex + 1}</span>
                <span className="text-[10px] text-white/40 truncate">{activeSegment.sceneTitle}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-3 py-2 space-y-2">
          <div className="relative h-6 sm:h-2 rounded-full bg-secondary cursor-pointer group touch-none" onMouseDown={handleScrubStart} onTouchStart={handleScrubStart}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-75" style={{ width: `${progressPct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 h-5 w-5 sm:h-3.5 sm:w-3.5 rounded-full bg-primary border-2 border-primary-foreground shadow-md transition-[left] duration-75 group-hover:scale-110" style={{ left: `calc(${progressPct}% - 10px)` }} />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={skipPrev} className="h-11 w-11 sm:h-8 sm:w-8 flex items-center justify-center rounded hover:bg-muted transition-colors" aria-label="Précédent"><SkipBack className="h-5 w-5 sm:h-4 sm:w-4 text-foreground" /></button>
            <button onClick={togglePlay} className="h-12 w-12 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" aria-label={isPlaying ? "Pause" : "Lecture"}>
              {isPlaying ? <Pause className="h-5 w-5 sm:h-4 sm:w-4" /> : <Play className="h-5 w-5 sm:h-4 sm:w-4 ml-0.5" />}
            </button>
            <button onClick={skipNext} className="h-11 w-11 sm:h-8 sm:w-8 flex items-center justify-center rounded hover:bg-muted transition-colors" aria-label="Suivant"><SkipForward className="h-5 w-5 sm:h-4 sm:w-4 text-foreground" /></button>
            <span className="text-[11px] font-mono text-muted-foreground ml-2">{formatTime(currentTime)} / {formatTime(audioDuration)}</span>
            <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">{scaledSegments.length} segments</span>
          </div>
          {/* Image offset control */}
          {onImageOffsetChange && (
            <div className="flex items-center gap-2 pt-1">
              <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Calage image</span>
              <input
                type="range"
                min={-1000}
                max={1000}
                step={50}
                value={imageOffsetMs}
                onChange={(e) => onImageOffsetChange(Number(e.target.value))}
                className="flex-1 h-1 accent-primary"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">
                {imageOffsetMs === 0 ? "0 ms" : `${imageOffsetMs > 0 ? "+" : ""}${imageOffsetMs} ms`}
              </span>
              {imageOffsetMs !== 0 && (
                <button
                  onClick={() => onImageOffsetChange(0)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  title="Réinitialiser"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Mini-timeline with zoom ═══ */}
      <div className="space-y-1">
        {/* Zoom controls */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Film className="h-3 w-3" /> Piste vidéo</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(1, z <= 2 ? 1 : z - 2))}
              disabled={zoomLevel <= 1}
              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              title="Dézoomer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">{zoomLevel}×</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(30, z < 2 ? 2 : z + 2))}
              disabled={zoomLevel >= 30}
              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              title="Zoomer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 ml-3"><Volume2 className="h-3 w-3" /> Audio</span>
          </div>
        </div>

        {/* Scrollable zoomed tracks */}
        <div ref={miniTimelineRef} className="overflow-x-auto">
          <div style={{ width: `${100 * zoomLevel}%`, minWidth: "300px" }}>
            {/* Video track */}
            <div className="relative h-12 sm:h-10 rounded-md overflow-hidden border border-border cursor-pointer touch-none" onMouseDown={handleScrubStart} onTouchStart={handleScrubStart}>
              <div className="flex h-full">
                {scaledSegments.map((seg, idx) => {
                  const widthPct = audioDuration > 0 ? (seg.duration / audioDuration) * 100 : 100 / scaledSegments.length;
                  const active = seg.id === activeSegment?.id;
                  return (
                    <div key={seg.id} className={`relative border-r border-border/30 last:border-r-0 overflow-hidden ${active ? "ring-1 ring-inset ring-primary/50" : ""} ${seg.imageUrl ? "" : "bg-muted"}`} style={{ width: `${widthPct}%`, minWidth: "3px" }} title={`Shot ${idx + 1}`}>
                      {seg.imageUrl ? <img src={seg.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><span className="text-[7px] text-muted-foreground">{idx + 1}</span></div>}
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10 pointer-events-none transition-[left] duration-75" style={{ left: `${progressPct}%` }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-destructive" />
              </div>
            </div>
            {/* Audio track */}
            <div className="relative h-8 sm:h-6 rounded-md overflow-hidden border border-border bg-accent/10 mt-1">
              <div className="absolute inset-0 flex items-center px-1">
                {waveformHeights.map((h, i) => <div key={i} className="flex-1 mx-px" style={{ height: `${h}%`, minHeight: "12%" }}><div className="w-full h-full rounded-sm bg-accent/30" /></div>)}
              </div>
              <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10 pointer-events-none transition-[left] duration-75" style={{ left: `${progressPct}%` }} />
            </div>
            {/* Time markers */}
            <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5 mt-0.5">
              <span>0:00</span><span className="hidden sm:inline">{formatTime(audioDuration / 4)}</span><span>{formatTime(audioDuration / 2)}</span><span className="hidden sm:inline">{formatTime((audioDuration * 3) / 4)}</span><span>{formatTime(audioDuration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Editable Segment list (collapsible) ═══ */}
      <Collapsible open={segmentsOpen} onOpenChange={setSegmentsOpen}>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${segmentsOpen ? "rotate-90" : ""}`} />
              <Film className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Segments — Édition</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{segments.length} shots</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div ref={listRef} className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto divide-y divide-border/30 -webkit-overflow-scrolling-touch">
              <div className="px-1 py-1 space-y-0.5">
                {scaledSegments.map((seg, globalIndex) => (
                  <div key={seg.id} data-seg-index={globalIndex}>
                    <EditableSegmentCard
                      segment={seg}
                      displayIndex={globalIndex + 1}
                      index={globalIndex}
                      total={scaledSegments.length}
                      isActive={seg.id === activeSegment?.id}
                      onSeek={() => seekTo(seg.startTime)}
                      onMoveUp={() => handleMoveSegment(globalIndex, globalIndex - 1)}
                      onMoveDown={() => handleMoveSegment(globalIndex, globalIndex + 1)}
                      onDurationChange={(delta) => handleDurationChange(seg.id, delta)}
                      onReplaceImage={() => triggerReplace(seg.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
