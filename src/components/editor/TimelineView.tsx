import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Film,
  ImageIcon,
  Volume2,
  Layers,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { Timeline, ShotSegment } from "./timelineAssembly";

interface TimelineViewProps {
  timeline: Timeline;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Find the active segment index for a given time */
function findSegmentAt(segments: ShotSegment[], time: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].startTime) return i;
  }
  return 0;
}

// ── Segment row in the list ────────────────────────────────────────
function SegmentCard({
  segment,
  isActive,
  onClick,
}: {
  segment: ShotSegment;
  isActive: boolean;
  onClick: () => void;
}) {
  const hasImage = !!segment.imageUrl;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex gap-3 items-start rounded-md px-2 py-1.5 transition-colors ${
        isActive
          ? "bg-primary/10 ring-1 ring-primary/20"
          : "hover:bg-muted/50"
      }`}
    >
      {/* Timecode */}
      <div className="w-12 shrink-0 pt-1 text-right">
        <span className={`text-[10px] font-mono ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          {formatTime(segment.startTime)}
        </span>
      </div>

      {/* Thumbnail */}
      <div className={`w-16 h-10 rounded border shrink-0 overflow-hidden ${isActive ? "border-primary/40" : "border-border"}`}>
        {hasImage ? (
          <img src={segment.imageUrl!} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ImageIcon className="h-3 w-3 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            Shot {segment.shotOrder}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
            {formatTime(segment.duration)}
          </span>
        </div>
        <p className="text-xs text-foreground leading-snug mt-0.5 line-clamp-1">
          {segment.sentence || segment.description}
        </p>
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function TimelineView({ timeline }: TimelineViewProps) {
  const { videoTrack, audioTrack } = timeline;
  const segments = videoTrack.segments;

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audioTrack.durationEstimate || timeline.totalDuration);
  const rafRef = useRef<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = useMemo(() => findSegmentAt(segments, currentTime), [segments, currentTime]);
  const activeSegment = segments[activeIndex] ?? null;

  // Stable waveform heights (generated once)
  const waveformHeights = useMemo(
    () => Array.from({ length: 80 }, (_, i) => 20 + Math.sin(i * 0.7) * 35 + (Math.sin(i * 2.1) + 1) * 15),
    []
  );

  // Init audio element
  useEffect(() => {
    const audio = new Audio(audioTrack.audioUrl);
    audio.preload = "metadata";
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioTrack.audioUrl]);

  // Animation loop for time sync
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Auto-scroll segment list to active segment
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-seg-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(time, audioDuration));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, [audioDuration]);

  const skipPrev = useCallback(() => {
    if (activeIndex > 0) {
      seekTo(segments[activeIndex - 1].startTime);
    } else {
      seekTo(0);
    }
  }, [activeIndex, segments, seekTo]);

  const skipNext = useCallback(() => {
    if (activeIndex < segments.length - 1) {
      seekTo(segments[activeIndex + 1].startTime);
    }
  }, [activeIndex, segments, seekTo]);

  const handleSegmentClick = useCallback((seg: ShotSegment) => {
    seekTo(seg.startTime);
  }, [seekTo]);

  // Scrubbing on any timeline/progress bar
  const scrubTargetRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const wasPlayingRef = useRef(false);

  const scrubFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!scrubTargetRef.current) return;
    const rect = scrubTargetRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * audioDuration);
  }, [seekTo, audioDuration]);

  const handleScrubStart = useCallback((e: React.MouseEvent) => {
    scrubTargetRef.current = e.currentTarget as HTMLDivElement;
    setIsScrubbing(true);
    wasPlayingRef.current = isPlaying;
    if (isPlaying) audioRef.current?.pause();
    scrubFromEvent(e);
  }, [isPlaying, scrubFromEvent]);

  useEffect(() => {
    if (!isScrubbing) return;

    const onMove = (e: MouseEvent) => scrubFromEvent(e);
    const onUp = () => {
      setIsScrubbing(false);
      if (wasPlayingRef.current) {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isScrubbing, scrubFromEvent]);

  const progressPct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  // Group segments by scene
  const sceneGroups = useMemo(() => {
    const groups: { sceneId: string; sceneTitle: string; sceneOrder: number; segments: ShotSegment[] }[] = [];
    segments.forEach((seg) => {
      const last = groups[groups.length - 1];
      if (last && last.sceneId === seg.sceneId) {
        last.segments.push(seg);
      } else {
        groups.push({ sceneId: seg.sceneId, sceneTitle: seg.sceneTitle, sceneOrder: seg.sceneOrder, segments: [seg] });
      }
    });
    return groups;
  }, [segments]);

  return (
    <div className="space-y-4">
      {/* ═══ VideoPreviewPlayer ═══ */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Preview screen */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {activeSegment?.imageUrl ? (
            <img
              src={activeSegment.imageUrl}
              alt={`Shot ${activeSegment.shotOrder}`}
              className="w-full h-full object-contain transition-opacity duration-300"
              key={activeSegment.id}
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
              <span className="text-xs text-muted-foreground/40">
                {activeSegment ? `Shot ${activeSegment.shotOrder} — pas de visuel` : "Aucun segment"}
              </span>
            </div>
          )}

          {/* Overlay info */}
          {activeSegment && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
              <p className="text-white text-sm leading-snug line-clamp-2 drop-shadow">
                {activeSegment.sentence || activeSegment.description}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-white/60 font-mono">
                  Shot {activeSegment.shotOrder}
                </span>
                <span className="text-[10px] text-white/40 truncate">
                  {activeSegment.sceneTitle}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Player controls */}
        <div className="px-3 py-2 space-y-2">
          {/* Progress bar (scrubable) */}
          <div
            className="relative h-2 rounded-full bg-secondary cursor-pointer group"
            onMouseDown={handleScrubStart}
          >
            {/* Played portion */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-primary border-2 border-primary-foreground shadow-md transition-[left] duration-75 group-hover:scale-110"
              style={{ left: `calc(${progressPct}% - 7px)` }}
            />
          </div>

          {/* Buttons + timecode */}
          <div className="flex items-center gap-2">
            <button onClick={skipPrev} className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors" aria-label="Segment précédent">
              <SkipBack className="h-4 w-4 text-foreground" />
            </button>
            <button onClick={togglePlay} className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" aria-label={isPlaying ? "Pause" : "Lecture"}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <button onClick={skipNext} className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors" aria-label="Segment suivant">
              <SkipForward className="h-4 w-4 text-foreground" />
            </button>
            <span className="text-[11px] font-mono text-muted-foreground ml-2">
              {formatTime(currentTime)} / {formatTime(audioDuration)}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {segments.length} segments
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Visual mini-timeline with playhead ═══ */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Film className="h-3 w-3" /> Piste vidéo
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Volume2 className="h-3 w-3" /> Audio
          </span>
        </div>

        {/* Video segments bar */}
        <div
          className="relative h-10 rounded-md overflow-hidden border border-border cursor-pointer"
          onMouseDown={handleScrubStart}
        >
          <div className="flex h-full">
            {segments.map((seg) => {
              const widthPct = audioDuration > 0
                ? (seg.duration / audioDuration) * 100
                : 100 / segments.length;
              const isActive = seg.id === activeSegment?.id;
              return (
                <div
                  key={seg.id}
                  className={`relative border-r border-border/30 last:border-r-0 overflow-hidden transition-all ${
                    isActive ? "ring-1 ring-inset ring-primary/50" : ""
                  } ${seg.imageUrl ? "" : "bg-muted"}`}
                  style={{ width: `${widthPct}%`, minWidth: "3px" }}
                  title={`Shot ${seg.shotOrder} — ${formatTime(seg.startTime)}`}
                >
                  {seg.imageUrl ? (
                    <img src={seg.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[7px] text-muted-foreground">{seg.shotOrder}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none transition-[left] duration-75"
            style={{ left: `${progressPct}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
          </div>
        </div>

        {/* Audio waveform bar */}
        <div className="relative h-6 rounded-md overflow-hidden border border-border bg-emerald-400/5">
          <div className="absolute inset-0 flex items-center px-1">
            {waveformHeights.map((h, i) => (
              <div key={i} className="flex-1 mx-px" style={{ height: `${h}%`, minHeight: "12%" }}>
                <div className="w-full h-full rounded-sm bg-emerald-400/30" />
              </div>
            ))}
          </div>
          {/* Audio playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none transition-[left] duration-75"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        {/* Timecodes */}
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
          <span>0:00</span>
          <span>{formatTime(audioDuration / 4)}</span>
          <span>{formatTime(audioDuration / 2)}</span>
          <span>{formatTime((audioDuration * 3) / 4)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>

      {/* ═══ Segment list ═══ */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <Film className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Segments</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {segments.length} shots
          </span>
        </div>
        <div ref={listRef} className="max-h-[300px] overflow-y-auto divide-y divide-border/30">
          {sceneGroups.map((group) => (
            <div key={group.sceneId}>
              <div className="flex items-center gap-2 px-3 py-1 bg-muted/20 sticky top-0 z-[1]">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Scène {group.sceneOrder}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  — {group.sceneTitle}
                </span>
              </div>
              <div className="px-1 py-1 space-y-0.5">
                {group.segments.map((seg, i) => (
                  <div key={seg.id} data-seg-index={segments.indexOf(seg)}>
                    <SegmentCard
                      segment={seg}
                      isActive={seg.id === activeSegment?.id}
                      onClick={() => handleSegmentClick(seg)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
