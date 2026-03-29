import type { Tables } from "@/integrations/supabase/types";
import { validateExactShotTimepoints } from "./exactShotSync";

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
  /** Exact shot timepoints from TTS marks */
  shotTimepoints?: ShotTimepoint[] | null;
}

// ── Assembly logic ─────────────────────────────────────────────────

/**
 * Generates a Timeline from existing assets using exact shotId ↔ timepoint mapping only.
 *
 * Rules:
 * 1. Every current shot must have exactly one matching timepoint
 * 2. No _missing_ placeholder is tolerated
 * 3. No proportional or fixed fallback is allowed
 */
export function assembleTimeline(
  scenes: Scene[],
  shots: Shot[],
  audioFile: AudioFile,
  shotTimepoints?: ShotTimepoint[] | null
): Timeline {
  const sceneMap = new Map<string, Scene>();
  scenes.forEach((scene) => sceneMap.set(scene.id, scene));

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║  🔒 LOCKED — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL 🔒   ║
  // ║                                                                  ║
  // ║  Sort by scene_order then shot_order. This MUST match the order  ║
  // ║  used by buildManifest (visualPromptTypes.ts) and TTS generation ║
  // ║  (which produces timepoints in this exact sequence).             ║
  // ╚══════════════════════════════════════════════════════════════════╝
  const sortedShots = [...shots].sort((a, b) => {
    const sceneA = sceneMap.get(a.scene_id);
    const sceneB = sceneMap.get(b.scene_id);
    const orderA = sceneA?.scene_order ?? 0;
    const orderB = sceneB?.scene_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.shot_order - b.shot_order;
  });

  const audioDuration = audioFile.duration_estimate ?? 0;
  if (sortedShots.length === 0) {
    const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vo-audio/${audioFile.file_path}`;
    return {
      videoTrack: { type: "video", label: "Piste vidéo", segments: [], totalDuration: 0 },
      audioTrack: {
        audioId: audioFile.id,
        fileName: audioFile.file_name,
        filePath: audioFile.file_path,
        durationEstimate: audioDuration,
        audioUrl,
      },
      totalDuration: 0,
      segmentCount: 0,
      createdAt: new Date().toLocaleString("fr-FR"),
      shotTimepoints: shotTimepoints ?? null,
    };
  }

  if (!(audioDuration > 0)) {
    throw new Error("Sync audio bloquée — durée du fichier audio introuvable.");
  }

  const expectedShotIds = sortedShots.map((shot) => shot.id);
  const validation = validateExactShotTimepoints(expectedShotIds, shotTimepoints ?? null);
  if (!validation.ok) {
    throw new Error(`Sync audio bloquée — ${validation.errors[0] ?? "shot_timepoints exacts invalides."}`);
  }

  const realTimepoints = (shotTimepoints ?? []).filter((tp) => !tp.shotId.startsWith("_missing_"));
  const timepointMap = new Map<string, number>(
    realTimepoints.map((tp) => [tp.shotId, tp.timeSeconds])
  );

  const exactStarts = sortedShots.map((shot) => {
    const start = timepointMap.get(shot.id);
    if (start === undefined) {
      throw new Error(`Sync audio bloquée — timepoint manquant pour le shot ${shot.id.slice(0, 8)}.`);
    }
    return start;
  });

  const segments: ShotSegment[] = sortedShots.map((shot, idx) => {
    const scene = sceneMap.get(shot.scene_id);
    const startTime = exactStarts[idx];
    const nextStart = idx < sortedShots.length - 1 ? exactStarts[idx + 1] : audioDuration;
    const duration = nextStart - startTime;

    if (!(duration > 0)) {
      throw new Error(`Sync audio bloquée — durée invalide entre les shots ${idx + 1}${idx < sortedShots.length - 1 ? ` et ${idx + 2}` : " et la fin audio"}.`);
    }

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
      duration,
      startTime,
    };
  });

  const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/vo-audio/${audioFile.file_path}`;

  return {
    videoTrack: { type: "video", label: "Piste vidéo", segments, totalDuration: audioDuration },
    audioTrack: {
      audioId: audioFile.id,
      fileName: audioFile.file_name,
      filePath: audioFile.file_path,
      durationEstimate: audioDuration,
      audioUrl,
    },
    totalDuration: audioDuration,
    segmentCount: segments.length,
    createdAt: new Date().toLocaleString("fr-FR"),
    shotTimepoints: shotTimepoints ?? null,
  };
}

/** Recalculate startTime for all segments after editing order or duration */
export function recalcStartTimes(segments: ShotSegment[]): ShotSegment[] {
  let t = 0;
  return segments.map((seg) => {
    const updated = { ...seg, startTime: t };
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
