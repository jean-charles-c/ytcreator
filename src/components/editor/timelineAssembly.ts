import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;
type Scene = Tables<"scenes">;
type AudioFile = Tables<"vo_audio_history">;

// ── Data types ─────────────────────────────────────────────────────

export interface ShotTimepoint {
  shotIndex: number;
  timeSeconds: number;
  shotId: string;
}

export interface ShotSegment {
  id: string;
  shotOrder: number;
  sceneId: string;
  sceneTitle: string;
  sceneOrder: number;
  sentence: string;
  sentenceFr: string | null;
  imageUrl: string | null;
  shotType: string;
  description: string;
  /** Duration in seconds for this segment on the video track */
  duration: number;
  /** Start time in seconds on the timeline */
  startTime: number;
}

export interface TimelineTrack {
  type: "video" | "audio";
  label: string;
  segments: ShotSegment[];
  /** Total duration in seconds */
  totalDuration: number;
}

export interface AudioTrackInfo {
  audioId: string;
  fileName: string;
  filePath: string;
  durationEstimate: number;
  audioUrl: string;
}

export interface Timeline {
  videoTrack: TimelineTrack;
  audioTrack: AudioTrackInfo;
  totalDuration: number;
  segmentCount: number;
  createdAt: string;
  /** If available, precise shot timepoints from TTS marks */
  shotTimepoints?: ShotTimepoint[] | null;
}

// ── Assembly logic ─────────────────────────────────────────────────

/**
 * Generates a Timeline from existing assets.
 *
 * Duration strategy (in priority order):
 * 1. If shotTimepoints are available from TTS marks, use precise timestamps
 * 2. If audio duration is known, distribute proportionally by char count
 * 3. Fallback: 4 seconds per segment
 */
export function assembleTimeline(
  scenes: Scene[],
  shots: Shot[],
  audioFile: AudioFile,
  shotTimepoints?: ShotTimepoint[] | null
): Timeline {
  // Build a scene lookup
  const sceneMap = new Map<string, Scene>();
  scenes.forEach((s) => sceneMap.set(s.id, s));

  // Sort shots chronologically: by scene order first, then shot_order
  const sortedShots = [...shots].sort((a, b) => {
    const sceneA = sceneMap.get(a.scene_id);
    const sceneB = sceneMap.get(b.scene_id);
    const orderA = sceneA?.scene_order ?? 0;
    const orderB = sceneB?.scene_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.shot_order - b.shot_order;
  });

  const audioDuration = audioFile.duration_estimate ?? 0;
  const DEFAULT_SEGMENT_DURATION = 4;

  // ── Strategy 1: Precise timepoints from TTS marks ──
  if (shotTimepoints && shotTimepoints.length > 0) {
    // Build a map: shotId -> timeSeconds
    const timepointMap = new Map<string, number>();
    // Also build ordered array for sequential fallback
    const orderedTimepoints = [...shotTimepoints].sort((a, b) => a.shotIndex - b.shotIndex);

    for (const tp of shotTimepoints) {
      timepointMap.set(tp.shotId, tp.timeSeconds);
    }

    const segments: ShotSegment[] = sortedShots.map((shot, idx) => {
      const scene = sceneMap.get(shot.scene_id);

      // Try to get start time from timepoint map (by shotId or by index)
      let startTime = timepointMap.get(shot.id);
      if (startTime === undefined && idx < orderedTimepoints.length) {
        startTime = orderedTimepoints[idx]?.timeSeconds ?? 0;
      }
      if (startTime === undefined) startTime = 0;

      // Duration = next shot's start time - this shot's start time
      let duration: number;
      if (idx < sortedShots.length - 1) {
        const nextShotId = sortedShots[idx + 1].id;
        let nextStart = timepointMap.get(nextShotId);
        if (nextStart === undefined && idx + 1 < orderedTimepoints.length) {
          nextStart = orderedTimepoints[idx + 1]?.timeSeconds;
        }
        duration = nextStart !== undefined ? nextStart - startTime : DEFAULT_SEGMENT_DURATION;
      } else {
        // Last segment: extend to audio duration
        duration = audioDuration > 0 ? audioDuration - startTime : DEFAULT_SEGMENT_DURATION;
      }

      // Safety: minimum duration
      duration = Math.max(0.3, duration);

      return {
        id: shot.id,
        shotOrder: shot.shot_order,
        sceneId: shot.scene_id,
        sceneTitle: scene?.title ?? `Scène ${shot.scene_id.slice(0, 6)}`,
        sceneOrder: scene?.scene_order ?? 0,
        sentence: shot.source_sentence ?? "",
        sentenceFr: shot.source_sentence_fr ?? null,
        imageUrl: shot.image_url,
        shotType: shot.shot_type,
        description: shot.description,
        duration: Math.round(duration * 100) / 100,
        startTime: Math.round(startTime * 100) / 100,
      };
    });

    const totalDuration = audioDuration > 0 ? audioDuration : (segments.length > 0 ? segments[segments.length - 1].startTime + segments[segments.length - 1].duration : 0);

    const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vo-audio/${audioFile.file_path}`;

    return {
      videoTrack: { type: "video", label: "Piste vidéo", segments, totalDuration },
      audioTrack: {
        audioId: audioFile.id,
        fileName: audioFile.file_name,
        filePath: audioFile.file_path,
        durationEstimate: audioDuration,
        audioUrl,
      },
      totalDuration,
      segmentCount: segments.length,
      createdAt: new Date().toISOString(),
      shotTimepoints,
    };
  }

  // ── Strategy 2 & 3: Proportional or fixed duration (legacy) ──
  const totalChars = sortedShots.reduce((sum, shot) => {
    const sentence = shot.source_sentence || shot.source_sentence_fr || shot.description;
    return sum + Math.max(sentence.length, 10);
  }, 0);

  const useProportional = audioDuration > 0 && totalChars > 0;

  let currentTime = 0;

  const segments: ShotSegment[] = sortedShots.map((shot) => {
    const scene = sceneMap.get(shot.scene_id);
    const sentence = shot.source_sentence || shot.source_sentence_fr || shot.description;
    const charWeight = Math.max(sentence.length, 10);

    const duration = useProportional
      ? (charWeight / totalChars) * audioDuration
      : DEFAULT_SEGMENT_DURATION;

    const segment: ShotSegment = {
      id: shot.id,
      shotOrder: shot.shot_order,
      sceneId: shot.scene_id,
      sceneTitle: scene?.title ?? `Scène ${shot.scene_id.slice(0, 6)}`,
      sceneOrder: scene?.scene_order ?? 0,
      sentence: shot.source_sentence ?? "",
      sentenceFr: shot.source_sentence_fr ?? null,
      imageUrl: shot.image_url,
      shotType: shot.shot_type,
      description: shot.description,
      duration: Math.round(duration * 100) / 100,
      startTime: Math.round(currentTime * 100) / 100,
    };

    currentTime += duration;

    return segment;
  });

  const totalDuration = useProportional ? audioDuration : currentTime;

  const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vo-audio/${audioFile.file_path}`;

  return {
    videoTrack: { type: "video", label: "Piste vidéo", segments, totalDuration },
    audioTrack: {
      audioId: audioFile.id,
      fileName: audioFile.file_name,
      filePath: audioFile.file_path,
      durationEstimate: audioDuration,
      audioUrl,
    },
    totalDuration,
    segmentCount: segments.length,
    createdAt: new Date().toISOString(),
  };
}

/** Recalculate startTime for all segments after editing order or duration */
export function recalcStartTimes(segments: ShotSegment[]): ShotSegment[] {
  let t = 0;
  return segments.map((seg) => {
    const updated = { ...seg, startTime: Math.round(t * 100) / 100 };
    t += seg.duration;
    return updated;
  });
}

/** Update a timeline after segment edits (reorder, duration, image) */
export function updateTimelineSegments(timeline: Timeline, newSegments: ShotSegment[]): Timeline {
  const recalced = recalcStartTimes(newSegments);
  const last = recalced[recalced.length - 1];
  const totalDuration = last ? last.startTime + last.duration : 0;
  return {
    ...timeline,
    videoTrack: {
      ...timeline.videoTrack,
      segments: recalced,
      totalDuration,
    },
    totalDuration: Math.max(totalDuration, timeline.audioTrack.durationEstimate),
    segmentCount: recalced.length,
  };
}
