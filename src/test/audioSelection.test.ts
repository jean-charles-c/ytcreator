import { describe, expect, it } from "vitest";
import { resolveSelectedAudioId } from "../components/editor/audioSelection";

function makeAudio(id: string) {
  return { id } as any;
}

describe("resolveSelectedAudioId", () => {
  it("selects the latest audio when nothing is selected", () => {
    expect(
      resolveSelectedAudioId({
        currentSelectedAudioId: null,
        previousAudioFiles: [],
        nextAudioFiles: [makeAudio("newest"), makeAudio("older")],
      })
    ).toBe("newest");
  });

  it("switches to the new latest audio when the user was following the latest one", () => {
    expect(
      resolveSelectedAudioId({
        currentSelectedAudioId: "latest-old",
        previousAudioFiles: [makeAudio("latest-old"), makeAudio("older")],
        nextAudioFiles: [makeAudio("latest-new"), makeAudio("latest-old"), makeAudio("older")],
      })
    ).toBe("latest-new");
  });

  it("keeps a manually selected older audio", () => {
    expect(
      resolveSelectedAudioId({
        currentSelectedAudioId: "older",
        previousAudioFiles: [makeAudio("latest-old"), makeAudio("older")],
        nextAudioFiles: [makeAudio("latest-new"), makeAudio("latest-old"), makeAudio("older")],
      })
    ).toBe("older");
  });

  it("falls back to the latest audio when the current selection disappeared", () => {
    expect(
      resolveSelectedAudioId({
        currentSelectedAudioId: "missing",
        previousAudioFiles: [makeAudio("latest-old"), makeAudio("missing")],
        nextAudioFiles: [makeAudio("latest-new"), makeAudio("latest-old")],
      })
    ).toBe("latest-new");
  });
});
