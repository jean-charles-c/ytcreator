import { describe, expect, it } from "vitest";
import { buildManifestTiming } from "../components/editor/manifestTiming";
import type { ShotTimepoint } from "../components/editor/timelineAssembly";

describe("buildManifestTiming", () => {
  it("preserves exact GTTS timepoints without centisecond rounding", () => {
    const manifest = {
      scenes: [
        {
          sceneOrder: 1,
          fragments: [
            { fragmentId: "frag-1", text: "A" },
            { fragmentId: "frag-2", text: "B" },
            { fragmentId: "frag-3", text: "C" },
          ],
          shots: [
            { shotId: "shot-1", sceneId: "scene-1", fragmentIds: ["frag-1"], status: "active" },
            { shotId: "shot-2", sceneId: "scene-1", fragmentIds: ["frag-2"], status: "active" },
            { shotId: "shot-3", sceneId: "scene-1", fragmentIds: ["frag-3"], status: "active" },
          ],
        },
      ],
    } as any;

    const timepoints: ShotTimepoint[] = [
      { shotId: "shot-1", shotIndex: 0, timeSeconds: 0.015 },
      { shotId: "shot-2", shotIndex: 1, timeSeconds: 5.276 },
      { shotId: "shot-3", shotIndex: 2, timeSeconds: 10.398 },
    ];

    const timing = buildManifestTiming(manifest, timepoints, 12.56);

    expect(timing.issues).toEqual([]);
    expect(timing.entries[0].start).toBeCloseTo(0.015, 6);
    expect(timing.entries[1].start).toBeCloseTo(5.276, 6);
    expect(timing.entries[2].start).toBeCloseTo(10.398, 6);
    expect(timing.entries[0].duration).toBeCloseTo(5.261, 6);
    expect(timing.entries[1].duration).toBeCloseTo(5.122, 6);
    expect(timing.entries[2].duration).toBeCloseTo(2.162, 6);
  });

  it("aligns the next shot start with the previous manual end", () => {
    const manifest = {
      scenes: [
        {
          sceneOrder: 1,
          fragments: [
            { fragmentId: "frag-1", text: "A" },
            { fragmentId: "frag-2", text: "B" },
            { fragmentId: "frag-3", text: "C" },
          ],
          shots: [
            { shotId: "shot-1", sceneId: "scene-1", fragmentIds: ["frag-1"], status: "active" },
            { shotId: "shot-2", sceneId: "scene-1", fragmentIds: ["frag-2"], status: "active" },
            { shotId: "shot-3", sceneId: "scene-1", fragmentIds: ["frag-3"], status: "active" },
          ],
        },
      ],
    } as any;

    const timepoints: ShotTimepoint[] = [
      { shotId: "shot-1", shotIndex: 0, timeSeconds: 0.015 },
      { shotId: "shot-2", shotIndex: 1, timeSeconds: 5.276, manualEndTimeSeconds: 8.4 },
      { shotId: "shot-3", shotIndex: 2, timeSeconds: 10.398 },
    ];

    const timing = buildManifestTiming(manifest, timepoints, 12.56);

    expect(timing.issues).toEqual([]);
    expect(timing.entries[1].duration).toBeCloseTo(3.124, 6);
    expect(timing.entries[2].start).toBeCloseTo(8.4, 6);
    expect(timing.entries[2].duration).toBeCloseTo(4.16, 6);
  });
});
