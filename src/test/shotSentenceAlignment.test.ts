import { describe, expect, it } from "vitest";
import { alignShotSentencesToScript, type ShotSentenceEntry } from "../components/editor/shotSentenceAlignment";

describe("alignShotSentencesToScript", () => {
  it("keeps a multi-sentence script block attached to the same shot", () => {
    const shots: ShotSentenceEntry[] = [
      {
        id: "shot-1",
        text: "A city burns. Its clay tablets harden like brick.",
      },
      {
        id: "shot-2",
        text: "The palace falls with a roar.",
      },
    ];

    expect(
      alignShotSentencesToScript(
        shots,
        "A city burns. Its clay tablets harden like brick. The palace falls with a roar."
      )
    ).toEqual([
      {
        id: "shot-1",
        text: "A city burns. Its clay tablets harden like brick.",
        isNewScene: false,
      },
      {
        id: "shot-2",
        text: "The palace falls with a roar.",
        isNewScene: false,
      },
    ]);
  });

  it("falls back to positional mapping for paraphrased narration instead of pushing real shots to the end", () => {
    const shots: ShotSentenceEntry[] = [
      {
        id: "shot-48",
        text: "Determinatives flag gods, cities, or metals.",
      },
      {
        id: "shot-49",
        text: "They are never read aloud.",
      },
      {
        id: "shot-50",
        text: "They steer the reader through choices.",
      },
    ];

    expect(
      alignShotSentencesToScript(
        shots,
        [
          "A small sign sits before a name.",
          "It is not spoken aloud.",
          "It warns you that a god or metal follows.",
        ].join(" ")
      )
    ).toEqual([
      {
        id: "shot-48",
        text: "A small sign sits before a name.",
        isNewScene: false,
      },
      {
        id: "shot-49",
        text: "It is not spoken aloud.",
        isNewScene: false,
      },
      {
        id: "shot-50",
        text: "It warns you that a god or metal follows.",
        isNewScene: false,
      },
    ]);
  });

  it("preserves true orphan script sentences as _missing entries before the next matched shot", () => {
    const shots: ShotSentenceEntry[] = [
      {
        id: "shot-1",
        text: "A city burns in the night.",
      },
      {
        id: "shot-2",
        text: "The tablets survive the flames.",
      },
    ];

    expect(
      alignShotSentencesToScript(
        shots,
        "A city burns in the night. In the ashes, words turn to stone. The tablets survive the flames."
      )
    ).toEqual([
      {
        id: "shot-1",
        text: "A city burns in the night.",
        isNewScene: false,
      },
      {
        id: "_missing_0",
        text: "In the ashes, words turn to stone.",
        isNewScene: false,
      },
      {
        id: "shot-2",
        text: "The tablets survive the flames.",
        isNewScene: false,
      },
    ]);
  });

  it("detects paragraph breaks (\\n\\n) in script text and sets isNewScene accordingly", () => {
    const shots: ShotSentenceEntry[] = [
      { id: "shot-1", text: "The sun rises over the valley." },
      { id: "shot-2", text: "Birds begin to sing." },
      { id: "shot-3", text: "A new chapter begins." },
      { id: "shot-4", text: "The hero walks forward." },
    ];

    const result = alignShotSentencesToScript(
      shots,
      "The sun rises over the valley. Birds begin to sing.\n\nA new chapter begins. The hero walks forward."
    );

    expect(result).toEqual([
      { id: "shot-1", text: "The sun rises over the valley.", isNewScene: false },
      { id: "shot-2", text: "Birds begin to sing.", isNewScene: false },
      { id: "shot-3", text: "A new chapter begins.", isNewScene: true },
      { id: "shot-4", text: "The hero walks forward.", isNewScene: false },
    ]);
  });

  it("paragraph break overrides shot isNewScene=false", () => {
    const shots: ShotSentenceEntry[] = [
      { id: "shot-1", text: "First sentence.", isNewScene: false },
      { id: "shot-2", text: "Second sentence.", isNewScene: false },
    ];

    const result = alignShotSentencesToScript(
      shots,
      "First sentence.\n\nSecond sentence."
    );

    expect(result[1].isNewScene).toBe(true);
  });

  it("keeps original text when shots split a single sentence at commas (sub-sentence fragments)", () => {
    const shots: ShotSentenceEntry[] = [
      {
        id: "shot-4",
        text: "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale,",
      },
      {
        id: "shot-5",
        text: "more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries.",
      },
    ];

    const result = alignShotSentencesToScript(
      shots,
      "Across the Zimbabwean plateau, from Great Zimbabwe to Khami, Dhlo Dhlo, and Naletale, more than 200 dry-stone complexes testify to a civilization that prospered between the 11th and 15th centuries."
    );

    // Each shot should keep its original sub-sentence fragment, NOT get the full sentence
    expect(result).toEqual([
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
    ]);
  });

  it("handles sub-sentence fragments followed by normal sentence matches", () => {
    const shots: ShotSentenceEntry[] = [
      { id: "shot-1", text: "On the hilltop," },
      { id: "shot-2", text: "the walls stand tall and proud." },
      { id: "shot-3", text: "The sun sets behind them." },
    ];

    const result = alignShotSentencesToScript(
      shots,
      "On the hilltop, the walls stand tall and proud. The sun sets behind them."
    );

    expect(result[0].text).toBe("On the hilltop,");
    expect(result[1].text).toBe("the walls stand tall and proud.");
    expect(result[2].text).toBe("The sun sets behind them.");
  });
});
