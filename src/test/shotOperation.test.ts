import { describe, it, expect } from "vitest";
import { validateShotOperation } from "@/components/editor/shotOperation";

describe("shotOperation", () => {
  const baseInput = {
    sceneText: "The walls stood tall. Trade brought prosperity.",
    sceneContext: { lieu: "Great Zimbabwe", epoque: "15th century", personnages: "Traders and craftsmen" },
    neighborsBefore: [] as any[],
    neighborsAfter: [] as any[],
  };

  it("validates a correct regeneration", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "The walls stood tall.",
    });
    expect(result.valid).toBe(true);
    expect(result.contextAnchor).toContain("15th century");
    expect(result.contextAnchor).toContain("Great Zimbabwe");
  });

  it("detects empty fragment", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Shot fragment is empty");
  });

  it("detects orphan fragment", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "Something completely unrelated.",
    });
    expect(result.valid).toBe(false);
  });

  it("allows orphan for merge operations", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "merge",
      shotFragment: "The walls stood tall. Trade brought prosperity.",
    });
    // Merged text is the full scene text, which is valid
    expect(result.valid).toBe(true);
  });

  it("collects neighbor camera types to avoid", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "The walls stood tall.",
      neighborsBefore: [{ shot_type: "Plan d'ensemble" }],
      neighborsAfter: [{ shot_type: "Plan d'activité" }],
    });
    expect(result.avoidCameraTypes).toContain("plan d'ensemble");
    expect(result.avoidCameraTypes).toContain("plan d'activité");
  });

  it("detects relevant characters when fragment mentions people", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "The community gathered in the marketplace.",
      sceneText: "The community gathered in the marketplace.",
    });
    expect(result.relevantCharacters).not.toBeNull();
  });

  it("returns null characters when fragment has no human cue", () => {
    const result = validateShotOperation({
      ...baseInput,
      type: "regenerate",
      shotFragment: "The walls stood tall.",
    });
    expect(result.relevantCharacters).toBeNull();
  });
});
