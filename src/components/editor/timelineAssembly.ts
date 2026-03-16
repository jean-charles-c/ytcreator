import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;
type Scene = Tables<"scenes">;
type AudioFile = Tables<"vo_audio_history">;

// ── Data types ─────────────────────────────────────────────────────

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
}

// ── Assembly logic ─────────────────────────────────────────────────

/**
 * Generates a Timeline from existing assets.
 *
 * Duration strategy:
 * - If audio duration is known, distribute evenly across segments
 *   weighted by sentence character count.
 * - If no audio duration, use a default of 4 seconds per segment.
 */
export function assembleTimeline(
  scenes: Scene[],
  shots: Shot[],
  audioFile: AudioFile
): Timeline {
  // Build a scene lookup
  const sceneMap = new Map<string, Scene>();
  scenes.forEach((s) => sceneMap.set(s.id, s));

  // Sort shots chronologically: by scene order first, then shot_order within each scene
  const sortedShots = [...shots].sort((a, b) => {
    const sceneA = sceneMap.get(a.scene_id);
    const sceneB = sceneMap.get(b.scene_id);
    const orderA = sceneA?.scene_order ?? 0;
    const orderB = sceneB?.scene_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.shot_order - b.shot_order;
  });


  const audioDuration = audioFile.duration_estimate ?? 0;
  const DEFAULT_SEGMENT_DURATION = 4; // seconds

  // Calculate total character weight for proportional duration
  const totalChars = sortedShots.reduce((sum, shot) => {
    const sentence = shot.source_sentence || shot.source_sentence_fr || shot.description;
    return sum + Math.max(sentence.length, 10); // min 10 chars to avoid zero-duration
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
    videoTrack: {
      type: "video",
      label: "Piste vidéo",
      segments,
      totalDuration,
    },
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
