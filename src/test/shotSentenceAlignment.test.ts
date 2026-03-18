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
      },
      {
        id: "shot-2",
        text: "The palace falls with a roar.",
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
      },
      {
        id: "shot-49",
        text: "It is not spoken aloud.",
      },
      {
        id: "shot-50",
        text: "It warns you that a god or metal follows.",
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
      },
      {
        id: "_missing_0",
        text: "In the ashes, words turn to stone.",
        isNewScene: false,
      },
      {
        id: "shot-2",
        text: "The tablets survive the flames.",
      },
    ]);
  });
});
