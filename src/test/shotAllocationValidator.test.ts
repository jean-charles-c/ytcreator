import { describe, it, expect } from "vitest";
import { validateAllocation, repairAllocation } from "@/components/editor/shotAllocationValidator";

describe("shotAllocationValidator", () => {
  it("returns valid for empty scene", () => {
    const report = validateAllocation("", []);
    expect(report.valid).toBe(true);
    expect(report.coveragePercent).toBe(100);
  });

  it("validates a perfect partition", () => {
    const scene = "The walls stood tall. Trade brought prosperity.";
    const fragments = ["The walls stood tall.", "Trade brought prosperity."];
    const report = validateAllocation(scene, fragments);
    expect(report.valid).toBe(true);
    expect(report.coveragePercent).toBeGreaterThanOrEqual(90);
    expect(report.issues).toHaveLength(0);
  });

  it("detects duplicate fragments", () => {
    const scene = "The walls stood tall. Trade brought prosperity.";
    const fragments = ["The walls stood tall.", "The walls stood tall."];
    const report = validateAllocation(scene, fragments);
    expect(report.issues.some(i => i.type === "duplicate")).toBe(true);
  });

  it("detects empty fragments", () => {
    const scene = "The walls stood tall.";
    const fragments = ["The walls stood tall.", ""];
    const report = validateAllocation(scene, fragments);
    expect(report.issues.some(i => i.type === "empty_fragment")).toBe(true);
  });

  it("detects orphan fragments not in scene text", () => {
    const scene = "The walls stood tall.";
    const fragments = ["Something completely different."];
    const report = validateAllocation(scene, fragments);
    expect(report.issues.some(i => i.type === "orphan")).toBe(true);
    expect(report.valid).toBe(false);
  });

  it("detects order violations", () => {
    const scene = "First sentence. Second sentence. Third sentence.";
    const fragments = ["Second sentence.", "First sentence."];
    const report = validateAllocation(scene, fragments);
    expect(report.issues.some(i => i.type === "order_violation")).toBe(true);
  });

  it("repairAllocation returns narrative segments when invalid", () => {
    const scene = "The walls stood tall. Trade brought prosperity.";
    const narrativeSegs = ["The walls stood tall.", "Trade brought prosperity."];
    const broken = ["Something wrong.", "Also wrong."];
    const repaired = repairAllocation(scene, narrativeSegs, broken);
    expect(repaired).toEqual(narrativeSegs);
  });

  it("repairAllocation keeps valid fragments", () => {
    const scene = "The walls stood tall. Trade brought prosperity.";
    const narrativeSegs = ["The walls stood tall.", "Trade brought prosperity."];
    const valid = ["The walls stood tall.", "Trade brought prosperity."];
    const result = repairAllocation(scene, narrativeSegs, valid);
    expect(result).toEqual(valid);
  });
});
