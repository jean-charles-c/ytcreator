import {
  Film,
  ImageIcon,
  Volume2,
  Layers,
} from "lucide-react";
import type { Timeline, ShotSegment } from "./timelineAssembly";

interface TimelineViewProps {
  timeline: Timeline;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Segment card in the timeline ───────────────────────────────────
function SegmentCard({ segment, index }: { segment: ShotSegment; index: number }) {
  const hasImage = !!segment.imageUrl;

  return (
    <div className="flex gap-3 items-start group">
      {/* Timecode */}
      <div className="w-14 shrink-0 pt-1 text-right">
        <span className="text-[10px] font-mono text-muted-foreground">
          {formatTime(segment.startTime)}
        </span>
      </div>

      {/* Visual thumbnail */}
      <div className="w-20 h-12 rounded border border-border bg-muted shrink-0 overflow-hidden">
        {hasImage ? (
          <img
            src={segment.imageUrl!}
            alt={`Shot ${segment.shotOrder}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-primary">
            Shot {segment.shotOrder}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {segment.sceneTitle}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
            {formatTime(segment.duration)}
          </span>
        </div>
        <p className="text-xs text-foreground leading-snug mt-0.5 line-clamp-2">
          {segment.sentence || segment.description}
        </p>
        {segment.sentenceFr && segment.sentence && (
          <p className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
            {segment.sentenceFr}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main timeline view ─────────────────────────────────────────────
export default function TimelineView({ timeline }: TimelineViewProps) {
  const { videoTrack, audioTrack } = timeline;

  // Group segments by scene for visual separation
  const sceneGroups: { sceneId: string; sceneTitle: string; sceneOrder: number; segments: ShotSegment[] }[] = [];
  videoTrack.segments.forEach((seg) => {
    const last = sceneGroups[sceneGroups.length - 1];
    if (last && last.sceneId === seg.sceneId) {
      last.segments.push(seg);
    } else {
      sceneGroups.push({
        sceneId: seg.sceneId,
        sceneTitle: seg.sceneTitle,
        sceneOrder: seg.sceneOrder,
        segments: [seg],
      });
    }
  });

  return (
    <div className="space-y-6">
      {/* Timeline header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Film className="h-3.5 w-3.5" />
          Timeline générée
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>{timeline.segmentCount} segments</span>
          <span className="font-mono">{formatTime(timeline.totalDuration)}</span>
        </div>
      </div>

      {/* Audio track bar */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded bg-emerald-400/10 shrink-0">
            <Volume2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">Piste audio</span>
              <span className="text-[10px] text-muted-foreground truncate">{audioTrack.fileName}</span>
            </div>
            {/* Audio waveform placeholder bar */}
            <div className="mt-1.5 h-6 rounded bg-emerald-400/10 overflow-hidden relative">
              <div className="absolute inset-0 flex items-center px-2">
                {/* Simple waveform visualization */}
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 mx-px"
                    style={{
                      height: `${20 + Math.sin(i * 0.8) * 40 + Math.random() * 30}%`,
                      minHeight: "15%",
                    }}
                  >
                    <div className="w-full h-full rounded-sm bg-emerald-400/40" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {formatTime(audioTrack.durationEstimate)}
          </span>
        </div>
      </div>

      {/* Video track — segment list grouped by scene */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <Film className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Piste vidéo</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {videoTrack.segments.length} shots
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {sceneGroups.map((group) => (
            <div key={group.sceneId}>
              {/* Scene divider */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Scène {group.sceneOrder}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  — {group.sceneTitle}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {group.segments.length} shot{group.segments.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="px-3 py-2 space-y-2">
                {group.segments.map((seg, i) => (
                  <SegmentCard key={seg.id} segment={seg} index={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visual mini-timeline bar */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Aperçu timeline
        </span>
        <div className="flex h-8 rounded-md overflow-hidden border border-border">
          {videoTrack.segments.map((seg) => {
            const widthPct = timeline.totalDuration > 0
              ? (seg.duration / timeline.totalDuration) * 100
              : 100 / videoTrack.segments.length;
            return (
              <div
                key={seg.id}
                className={`relative group/seg border-r border-border/30 last:border-r-0 overflow-hidden transition-opacity hover:opacity-90 ${
                  seg.imageUrl ? "" : "bg-muted"
                }`}
                style={{ width: `${widthPct}%`, minWidth: "2px" }}
                title={`Shot ${seg.shotOrder} — ${formatTime(seg.startTime)}`}
              >
                {seg.imageUrl ? (
                  <img
                    src={seg.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[7px] text-muted-foreground">{seg.shotOrder}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Timecodes */}
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
          <span>0:00</span>
          <span>{formatTime(timeline.totalDuration / 4)}</span>
          <span>{formatTime(timeline.totalDuration / 2)}</span>
          <span>{formatTime((timeline.totalDuration * 3) / 4)}</span>
          <span>{formatTime(timeline.totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}
