import { describe, it, expect } from "vitest";
import {
  computeEffective,
  resolveShotEffective,
  resolveSceneEffective,
  type SensitiveModeStore,
} from "@/components/editor/sensitiveMode/types";

describe("computeEffective", () => {
  it("returns overridden when localLevel is set", () => {
    const result = computeEffective({ localLevel: 2, inheritedLevel: 1 });
    expect(result).toEqual({ effectiveLevel: 2, state: "overridden" });
  });

  it("returns inherited when only inheritedLevel is set", () => {
    const result = computeEffective({ localLevel: null, inheritedLevel: 3 });
    expect(result).toEqual({ effectiveLevel: 3, state: "inherited" });
  });

  it("returns none when both are null", () => {
    const result = computeEffective({ localLevel: null, inheritedLevel: null });
    expect(result).toEqual({ effectiveLevel: null, state: "none" });
  });

  it("local overrides inherited even if inherited is higher", () => {
    const result = computeEffective({ localLevel: 1, inheritedLevel: 4 });
    expect(result).toEqual({ effectiveLevel: 1, state: "overridden" });
  });
});

describe("resolveShotEffective", () => {
  const baseStore: SensitiveModeStore = {
    globalLevel: null,
    sceneLevels: new Map(),
    shotLevels: new Map(),
  };

  it("returns none when no levels are set", () => {
    const result = resolveShotEffective(baseStore, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: null, source: "none" });
  });

  it("inherits from global when nothing else is set", () => {
    const store = { ...baseStore, globalLevel: 2 as const };
    const result = resolveShotEffective(store, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: 2, source: "global" });
  });

  it("scene overrides global", () => {
    const store: SensitiveModeStore = {
      globalLevel: 1,
      sceneLevels: new Map([["scene1", 3]]),
      shotLevels: new Map(),
    };
    const result = resolveShotEffective(store, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: 3, source: "scene" });
  });

  it("shot overrides scene and global", () => {
    const store: SensitiveModeStore = {
      globalLevel: 1,
      sceneLevels: new Map([["scene1", 3]]),
      shotLevels: new Map([["shot1", 4]]),
    };
    const result = resolveShotEffective(store, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: 4, source: "shot" });
  });

  it("different scene doesn't affect unrelated shot", () => {
    const store: SensitiveModeStore = {
      globalLevel: 1,
      sceneLevels: new Map([["scene2", 4]]),
      shotLevels: new Map(),
    };
    const result = resolveShotEffective(store, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: 1, source: "global" });
  });

  it("reset shot to null falls back to scene", () => {
    const store: SensitiveModeStore = {
      globalLevel: 1,
      sceneLevels: new Map([["scene1", 2]]),
      shotLevels: new Map(), // shot was reset
    };
    const result = resolveShotEffective(store, "scene1", "shot1");
    expect(result).toEqual({ effectiveLevel: 2, source: "scene" });
  });
});

describe("resolveSceneEffective", () => {
  it("returns none when no levels set", () => {
    const store: SensitiveModeStore = { globalLevel: null, sceneLevels: new Map(), shotLevels: new Map() };
    expect(resolveSceneEffective(store, "scene1")).toEqual({ effectiveLevel: null, source: "none" });
  });

  it("inherits from global", () => {
    const store: SensitiveModeStore = { globalLevel: 3, sceneLevels: new Map(), shotLevels: new Map() };
    expect(resolveSceneEffective(store, "scene1")).toEqual({ effectiveLevel: 3, source: "global" });
  });

  it("scene overrides global", () => {
    const store: SensitiveModeStore = { globalLevel: 1, sceneLevels: new Map([["scene1", 4]]), shotLevels: new Map() };
    expect(resolveSceneEffective(store, "scene1")).toEqual({ effectiveLevel: 4, source: "scene" });
  });
});
