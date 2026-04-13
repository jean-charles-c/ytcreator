import { describe, expect, it } from "vitest";
import { buildExactShotScript, buildExactShotSentences, normalizeExactSyncText } from "../components/editor/voiceOverShotSync";

describe("voiceOverShotSync", () => {
  const shots = [
    {
      id: "shot-4",
      scene_id: "scene-a",
      shot_order: 4,
      source_sentence: "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,",
      source_sentence_fr: null,
      description: "A",
    },
    {
      id: "shot-5",
      scene_id: "scene-a",
      shot_order: 5,
      source_sentence: "more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
      source_sentence_fr: null,
      description: "B",
    },
    {
      id: "shot-6",
      scene_id: "scene-b",
      shot_order: 1,
      source_sentence: "Another scene begins.",
      source_sentence_fr: null,
      description: "C",
    },
  ];

  it("rebuilds the VO script from exact shot fragments only", () => {
    expect(buildExactShotScript(shots)).toBe(
      [
        "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale, more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
        "Another scene begins.",
      ].join("\n\n")
    );
  });

  it("preserves one exact text fragment per shot with scene breaks", () => {
    expect(buildExactShotSentences(shots)).toEqual([
      {
        id: "shot-4",
        text: "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,",
        isNewScene: false,
      },
      {
        id: "shot-5",
        text: "more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
        isNewScene: false,
      },
      {
        id: "shot-6",
        text: "Another scene begins.",
        isNewScene: true,
      },
    ]);
  });

  it("preserves line breaks from original source_text when sceneTextMap is provided", () => {
    const sceneTextMap = new Map([
      [
        "scene-a",
        "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,\nmore than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
      ],
      ["scene-b", "Another scene begins."],
    ]);
    expect(buildExactShotScript(shots, sceneTextMap)).toBe(
      [
        "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,\nmore than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
        "Another scene begins.",
      ].join("\n\n")
    );
  });

  it("normalizes spacing and thousand separators for strict comparison", () => {
    expect(normalizeExactSyncText("There are 2,000 stones.\n\nAnother line.")).toBe(
      "There are 2000 stones. Another line."
    );
  });
});