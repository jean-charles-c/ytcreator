import { describe, expect, it } from "vitest";
import type { Chapter } from "../components/editor/chapterTypes";
import { buildChapterMarkers, generateMarkerXml } from "../components/editor/xmlMarkerBuilder";

const timeline = {
  videoTrack: {
    type: "video",
    label: "Piste vidéo",
    totalDuration: 4,
    segments: [
      {
        id: "shot-1",
        shotOrder: 1,
        sceneId: "scene-1",
        sceneTitle: "Hook scene",
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
        sceneId: "scene-2",
        sceneTitle: "Context scene",
        sceneOrder: 2,
        sentence: "B",
        sentenceFr: null,
        imageUrl: null,
        shotType: "Wide",
        description: "B",
        startTime: 1,
        duration: 1,
      },
      {
        id: "shot-3",
        shotOrder: 3,
        sceneId: "scene-3",
        sceneTitle: "Climax scene",
        sceneOrder: 3,
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
  audioTrack: {
    audioId: "audio-1",
    fileName: "test.mp3",
    filePath: "test.mp3",
    durationEstimate: 4,
    audioUrl: "https://example.com/test.mp3",
  },
  totalDuration: 4,
  segmentCount: 3,
  createdAt: "2026-03-18T00:00:00.000Z",
  shotTimepoints: [
    { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
    { shotId: "shot-2", shotIndex: 1, timeSeconds: 1 },
    { shotId: "shot-3", shotIndex: 2, timeSeconds: 2 },
  ],
} as any;

describe("buildChapterMarkers", () => {
  it("builds validated timeline markers with sequence start times", () => {
    const chapters: Chapter[] = [
      {
        id: "hook",
        index: 0,
        sectionType: "hook",
        startSentence: "Intro",
        summary: "",
        title: "HOOK",
        variants: [],
        titleFR: null,
        validated: true,
        sourceText: "Intro",
      },
      {
        id: "context",
        index: 1,
        sectionType: "context",
        startSentence: "Context",
        summary: "",
        title: "CONTEXT",
        variants: [],
        titleFR: null,
        validated: true,
        sourceText: "Context",
      },
      {
        id: "climax",
        index: 6,
        sectionType: "climax",
        startSentence: "Peak",
        summary: "",
        title: "CLIMAX",
        variants: [],
        titleFR: null,
        validated: false,
        sourceText: "Peak",
      },
    ];

    expect(buildChapterMarkers(chapters, timeline, 24)).toEqual([
      expect.objectContaining({ name: "HOOK", clipIndex: 0, startFrame: 0, startSeconds: 0 }),
      expect.objectContaining({ name: "CONTEXT", clipIndex: 1, startFrame: 24, startSeconds: 1 }),
    ]);
  });
});

describe("generateMarkerXml", () => {
  it("emits XMEML markers with name/comment/in/out child elements in frames", () => {
    const xml = generateMarkerXml(
      [
        { name: "HOOK", comment: "FR: ACCROCHE", clipIndex: 0, startFrame: 0, startSeconds: 0 },
        { name: "Context & Setup", comment: "Some comment", clipIndex: 1, startFrame: 302, startSeconds: 12.58333 },
      ],
      24
    );

    expect(xml).toContain("<marker>");
    expect(xml).toContain("<name>HOOK</name>");
    expect(xml).toContain("<in>0</in>");
    expect(xml).toContain("<out>0</out>");
    expect(xml).toContain("<name>Context &amp; Setup</name>");
    expect(xml).toContain("<in>302</in>");
    expect(xml).toContain("<out>302</out>");
    expect(xml).not.toContain('start="');
    expect(xml).not.toContain('value="');
  });
});
