import { describe, expect, it } from "vitest";
import type { Timeline } from "../components/editor/timelineAssembly";
import { generateTimelineXmlOnly } from "../components/editor/xmlExportEngine";

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

describe("generateTimelineXmlOnly", () => {
  it("keeps a manual shortened manifest duration in exported XML", () => {
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
    });

    const xml = generateTimelineXmlOnly(
      timeline,
      24,
      undefined,
      [
        {
          shotId: "shot-1",
          sceneId: "scene-1",
          sceneOrder: 1,
          fragmentText: "A",
          order: 1,
          audioSegmentKey: "shot-1",
          start: 0,
          duration: 1,
          source: "timepoint",
        },
        {
          shotId: "shot-2",
          sceneId: "scene-1",
          sceneOrder: 1,
          fragmentText: "B",
          order: 2,
          audioSegmentKey: "shot-2",
          start: 1,
          duration: 0.5,
          source: "timepoint",
        },
        {
          shotId: "shot-3",
          sceneId: "scene-1",
          sceneOrder: 1,
          fragmentText: "C",
          order: 3,
          audioSegmentKey: "shot-3",
          start: 2,
          duration: 2,
          source: "timepoint",
        },
      ]
    );

    expect(xml).toMatch(/<name>Shot_002[\s\S]*?<start>24<\/start>[\s\S]*?<end>36<\/end>/);
    expect(xml).toMatch(/<name>Shot_003[\s\S]*?<start>48<\/start>/);
  });
});