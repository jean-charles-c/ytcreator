import { describe, expect, it } from "vitest";
import type { Timeline } from "../components/editor/timelineAssembly";
import { buildClipFrames, escapeXml } from "../components/editor/xmlExportUtils";

function makeTimeline(partial: Partial<Timeline>): Timeline {
  return {
    videoTrack: {
      type: "video",
      label: "Piste vidéo",
      totalDuration: 4,
      segments: [],
      ...partial.videoTrack,
    },
    audioTrack: {
      audioId: "audio-1",
      fileName: "test.mp3",
      filePath: "test.mp3",
      durationEstimate: 4,
      audioUrl: "https://example.com/test.mp3",
      ...partial.audioTrack,
    },
    totalDuration: 4,
    segmentCount: partial.videoTrack?.segments.length ?? 0,
    createdAt: "2026-03-18T00:00:00.000Z",
    ...partial,
  };
}

describe("buildClipFrames", () => {
  it("uses precise shot timepoints instead of rounded segment timings when available", () => {
    const timeline = makeTimeline({
      videoTrack: {
        type: "video",
        label: "Piste vidéo",
        totalDuration: 4,
        segments: [
          {
            id: "shot-1",
            shotOrder: 1,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "A",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "A",
            startTime: 0,
            duration: 1.04,
          },
          {
            id: "shot-2",
            shotOrder: 2,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "B",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "B",
            startTime: 1.04,
            duration: 1.04,
          },
          {
            id: "shot-3",
            shotOrder: 3,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "C",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "C",
            startTime: 2.08,
            duration: 1.92,
          },
        ],
      },
      totalDuration: 4,
      shotTimepoints: [
        { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
        { shotId: "shot-2", shotIndex: 1, timeSeconds: 1 },
        { shotId: "shot-3", shotIndex: 2, timeSeconds: 2 },
      ],
    });

    expect(buildClipFrames(timeline, 24)).toEqual([
      { start: 0, end: 24 },
      { start: 24, end: 48 },
      { start: 48, end: 96 },
    ]);
  });

  it("falls back to timeline segments when no timepoints exist", () => {
    const timeline = makeTimeline({
      videoTrack: {
        type: "video",
        label: "Piste vidéo",
        totalDuration: 3,
        segments: [
          {
            id: "shot-1",
            shotOrder: 1,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "A",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "A",
            startTime: 0,
            duration: 1.5,
          },
          {
            id: "shot-2",
            shotOrder: 2,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "B",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "B",
            startTime: 1.5,
            duration: 1.5,
          },
        ],
      },
      totalDuration: 3,
      shotTimepoints: null,
    });

    expect(buildClipFrames(timeline, 24)).toEqual([
      { start: 0, end: 36 },
      { start: 36, end: 96 },
    ]);
  });

  it("aligns the next shot start with the previous manual end", () => {
    const timeline = makeTimeline({
      videoTrack: {
        type: "video",
        label: "Piste vidéo",
        totalDuration: 4,
        segments: [
          {
            id: "shot-1",
            shotOrder: 1,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "A",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "A",
            startTime: 0,
            duration: 1,
          },
          {
            id: "shot-2",
            shotOrder: 2,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "B",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "B",
            startTime: 1,
            duration: 0.5,
          },
          {
            id: "shot-3",
            shotOrder: 3,
            sceneId: "scene-1",
            sceneTitle: "Scene 1",
            sceneOrder: 1,
            sentence: "C",
            sentenceFr: null,
            imageUrl: null,
            shotType: "Wide",
            description: "C",
            startTime: 2,
            duration: 2,
          },
        ],
      },
      totalDuration: 4,
      shotTimepoints: [
        { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
        { shotId: "shot-2", shotIndex: 1, timeSeconds: 1, manualEndTimeSeconds: 1.5 },
        { shotId: "shot-3", shotIndex: 2, timeSeconds: 2 },
      ],
    });

    expect(buildClipFrames(timeline, 24)).toEqual([
      { start: 0, end: 24 },
      { start: 24, end: 36 },
      { start: 36, end: 96 },
    ]);
  });
});

describe("escapeXml", () => {
  it("removes invalid XML characters before escaping", () => {
    expect(escapeXml("A\u0019 & <tag>")).toBe("A &amp; &lt;tag&gt;");
  });
});
