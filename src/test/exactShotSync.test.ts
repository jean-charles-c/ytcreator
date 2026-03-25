import { describe, expect, it } from "vitest";
import { validateExactAlignedShotSentences, validateExactShotTimepoints } from "../components/editor/exactShotSync";
import { buildExactShotSentences } from "../components/editor/voiceOverShotSync";

describe("exactShotSync", () => {
  it("rejects aligned shot sentences with orphan placeholders", () => {
    const validation = validateExactAlignedShotSentences(
      ["shot-1", "shot-2"],
      [
        { id: "shot-1", text: "A" },
        { id: "_missing_0", text: "B" },
        { id: "shot-2", text: "C" },
      ]
    );

    expect(validation.ok).toBe(false);
    expect(validation.placeholderIds).toEqual(["_missing_0"]);
  });

  it("rejects shot_timepoints with missing or placeholder ids", () => {
    const validation = validateExactShotTimepoints(
      ["shot-1", "shot-2", "shot-3"],
      [
        { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
        { shotId: "_missing_0", shotIndex: 1, timeSeconds: 2 },
        { shotId: "shot-3", shotIndex: 2, timeSeconds: 4 },
      ]
    );

    expect(validation.ok).toBe(false);
    expect(validation.placeholderIds).toEqual(["_missing_0"]);
    expect(validation.missingIds).toEqual(["shot-2"]);
  });

  it("rejects shot_timepoints when the same ids are present but in the wrong order", () => {
    const validation = validateExactShotTimepoints(
      ["shot-1", "shot-2", "shot-3"],
      [
        { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
        { shotId: "shot-3", shotIndex: 1, timeSeconds: 2 },
        { shotId: "shot-2", shotIndex: 2, timeSeconds: 4 },
      ]
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("L’ordre des shotIds envoyés au moteur audio ne correspond plus à l’ordre courant des shots.");
  });

  it("preserves two exact consecutive shot fragments for the Zimbabwe plateau case", () => {
    const shotSentences = buildExactShotSentences([
      {
        id: "shot-4",
        scene_id: "scene-2",
        shot_order: 1,
        source_sentence: "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,",
        source_sentence_fr: null,
        description: "A",
      },
      {
        id: "shot-5",
        scene_id: "scene-2",
        shot_order: 2,
        source_sentence: "more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
        source_sentence_fr: null,
        description: "B",
      },
    ]);

    expect(shotSentences.map((shot) => shot.text)).toEqual([
      "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,",
      "more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
    ]);

    const validation = validateExactAlignedShotSentences(
      ["shot-4", "shot-5"],
      shotSentences
    );

    expect(validation.ok).toBe(true);
  });
});
