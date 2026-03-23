import { describe, it, expect } from "vitest";
import { analyzeRedundancy, enforceCameraRotation } from "@/components/editor/visualRedundancyDetector";

describe("visualRedundancyDetector", () => {
  it("returns perfect score for single shot", () => {
    const report = analyzeRedundancy("s1", [
      { shot_type: "Plan d'ensemble", prompt_export: "Wide shot of ancient ruins." },
    ]);
    expect(report.diversityScore).toBe(100);
    expect(report.issues).toHaveLength(0);
  });

  it("detects camera type repetition", () => {
    const report = analyzeRedundancy("s1", [
      { shot_type: "Plan d'ensemble", prompt_export: "Wide shot of walls." },
      { shot_type: "Plan d'ensemble", prompt_export: "Close-up on stone masonry." },
    ]);
    expect(report.issues.some((i) => i.type === "camera_repeat")).toBe(true);
  });

  it("detects high lexical similarity", () => {
    const basePrompt = "In 15th-century Great Zimbabwe, wide shot of massive stone walls built without mortar by skilled craftsmen. Historical documentary frame with photorealistic reconstruction.";
    const report = analyzeRedundancy("s1", [
      { shot_type: "Plan d'ensemble", prompt_export: basePrompt },
      { shot_type: "Plan d'activité", prompt_export: basePrompt.replace("wide shot", "medium shot") },
    ]);
    expect(report.issues.some((i) => i.type === "lexical_similarity")).toBe(true);
    expect(report.hasHighSeverity).toBe(true);
  });

  it("no issues for genuinely different shots", () => {
    const report = analyzeRedundancy("s1", [
      { shot_type: "Plan d'ensemble", prompt_export: "Wide establishing shot of the ancient city at dawn, smoke rising from cooking fires." },
      { shot_type: "Plan de détail d'artefact", prompt_export: "Close-up on intricate gold jewelry displayed on a weathered stone surface." },
    ]);
    expect(report.issues.filter((i) => i.severity === "high")).toHaveLength(0);
  });

  it("enforceCameraRotation fixes consecutive repeats", () => {
    const shots = [
      { shot_type: "Plan d'ensemble" },
      { shot_type: "Plan d'ensemble" },
      { shot_type: "Plan d'activité" },
    ];
    const fixed = enforceCameraRotation(shots);
    expect(fixed[0]).not.toBe(fixed[1]);
    expect(fixed[2]).toBe("Plan d'activité");
  });

  it("enforceCameraRotation handles all same types", () => {
    const shots = [
      { shot_type: "Plan d'ensemble" },
      { shot_type: "Plan d'ensemble" },
      { shot_type: "Plan d'ensemble" },
    ];
    const fixed = enforceCameraRotation(shots);
    // No two consecutive should match
    for (let i = 1; i < fixed.length; i++) {
      expect(fixed[i].toLowerCase()).not.toBe(fixed[i - 1].toLowerCase());
    }
  });
});
