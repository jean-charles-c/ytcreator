import { describe, expect, it } from "vitest";
import { assembleTimeline, type ShotTimepoint } from "../components/editor/timelineAssembly";

describe("assembleTimeline", () => {
  it("throws when shot_timepoints contain placeholder or missing ids", () => {
    const scenes = [
      { id: "scene-1", scene_order: 1, title: "Scene 1" },
    ] as any;

    const shots = [
      {
        id: "shot-1",
        scene_id: "scene-1",
        shot_order: 1,
        source_sentence: "A",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "A",
      },
      {
        id: "shot-2",
        scene_id: "scene-1",
        shot_order: 2,
        source_sentence: "B",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "B",
      },
      {
        id: "shot-3",
        scene_id: "scene-1",
        shot_order: 3,
        source_sentence: "C",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "C",
      },
    ] as any;

    const audioFile = {
      id: "audio-1",
      file_name: "test.mp3",
      file_path: "test.mp3",
      duration_estimate: 16,
    } as any;

    const shotTimepoints: ShotTimepoint[] = [
      { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
      { shotId: "_missing_1", shotIndex: 1, timeSeconds: 4 },
      { shotId: "shot-2", shotIndex: 3, timeSeconds: 6 },
      { shotId: "shot-3", shotIndex: 4, timeSeconds: 8 },
    ];

    expect(() => assembleTimeline(scenes, shots, audioFile, shotTimepoints)).toThrow(/Sync audio bloquée/);
  });

  it("uses exact timepoints only and keeps contiguous rounded segments", () => {
    const scenes = [
      { id: "scene-1", scene_order: 1, title: "Scene 1" },
    ] as any;

    const shots = [
      {
        id: "shot-1",
        scene_id: "scene-1",
        shot_order: 1,
        source_sentence: "A",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "A",
      },
      {
        id: "shot-2",
        scene_id: "scene-1",
        shot_order: 2,
        source_sentence: "B",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "B",
      },
      {
        id: "shot-3",
        scene_id: "scene-1",
        shot_order: 3,
        source_sentence: "C",
        source_sentence_fr: null,
        image_url: null,
        shot_type: "Wide",
        description: "C",
      },
    ] as any;

    const audioFile = {
      id: "audio-1",
      file_name: "test.mp3",
      file_path: "test.mp3",
      duration_estimate: 12.56,
    } as any;

    const shotTimepoints: ShotTimepoint[] = [
      { shotId: "shot-1", shotIndex: 0, timeSeconds: 0.015 },
      { shotId: "shot-2", shotIndex: 1, timeSeconds: 5.276 },
      { shotId: "shot-3", shotIndex: 2, timeSeconds: 10.398 },
    ];

    const timeline = assembleTimeline(scenes, shots, audioFile, shotTimepoints);

    expect(timeline.videoTrack.segments[0].startTime).toBe(0.02);
    expect(timeline.videoTrack.segments[0].duration).toBe(5.26);
    expect(timeline.videoTrack.segments[1].startTime).toBe(5.28);
    expect(timeline.videoTrack.segments[1].duration).toBe(5.12);
    expect(timeline.videoTrack.segments[2].startTime).toBe(10.4);
    expect(timeline.videoTrack.segments[2].duration).toBe(2.16);
  });
}
