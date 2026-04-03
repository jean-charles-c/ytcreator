import { describe, expect, it } from "vitest";
import {
  matchShotsStrictSequential,
  matchShotsByText,
  enforceMonotonicTimestamps,
} from "../components/editor/whisperTextMatcher";

describe("matchShotsStrictSequential", () => {
  const whisperWords = [
    { word: "Maranello,", start: 0.38, end: 1.36 },
    { word: "juillet", start: 1.36, end: 1.68 },
    { word: "1987.", start: 1.68, end: 3.72 },
    { word: "Sous", start: 3.72, end: 3.76 },
    { word: "une", start: 3.76, end: 4.0 },
    { word: "laque", start: 4.0, end: 4.2 },
    { word: "rouge", start: 4.2, end: 4.42 },
    { word: "si", start: 4.42, end: 4.66 },
    { word: "fine", start: 4.66, end: 4.94 },
    { word: "que", start: 4.94, end: 5.1 },
    { word: "la", start: 5.1, end: 5.28 },
    { word: "trame", start: 5.28, end: 5.46 },
    { word: "du", start: 5.46, end: 5.6 },
    { word: "carbone", start: 5.6, end: 5.94 },
    { word: "affleure,", start: 5.94, end: 6.84 },
    { word: "une", start: 6.84, end: 6.96 },
    { word: "voiture", start: 6.96, end: 7.3 },
    { word: "reçoit", start: 7.3, end: 7.6 },
  ];

  it("anchors shot 1 at word 0, then matches subsequent shots by exact 3 words", () => {
    const shots = [
      { id: "shot-1", text: "Maranello, Juillet 1987." },
      { id: "shot-2", text: "Sous une laque rouge si fine que la trame du carbone affleure," },
      { id: "shot-3", text: "une voiture reçoit la bénédiction" },
    ];

    const results = matchShotsStrictSequential(shots, whisperWords);

    expect(results[0].whisperStartIdx).toBe(0); // anchored
    expect(results[0].blocked).toBe(false);
    expect(results[1].whisperStartIdx).toBe(3); // "sous une laque" exact
    expect(results[1].blocked).toBe(false);
    expect(results[2].whisperStartIdx).toBe(15); // "une voiture reçoit" exact
    expect(results[2].blocked).toBe(false);
  });

  it("blocks when 3-word exact match not found within window", () => {
    const shots = [
      { id: "shot-1", text: "Maranello, Juillet 1987." },
      { id: "shot-x", text: "Texte introuvable dans le transcript" },
      { id: "shot-3", text: "une voiture reçoit" },
    ];

    const results = matchShotsStrictSequential(shots, whisperWords);

    expect(results[0].whisperStartIdx).toBe(0);
    expect(results[1].blocked).toBe(true);
    expect(results[1].whisperStartIdx).toBeNull();
    // shot-3 should also be null because chain is blocked
    expect(results[2].whisperStartIdx).toBeNull();
    expect(results[2].blocked).toBe(false); // not the blocker itself
  });

  it("resumes after manual anchor on blocked shot", () => {
    const shots = [
      { id: "shot-1", text: "Maranello, Juillet 1987." },
      { id: "shot-x", text: "Texte introuvable" },
      { id: "shot-3", text: "une voiture reçoit" },
    ];

    const manualAnchors = new Map([["shot-x", 3]]);
    const results = matchShotsStrictSequential(shots, whisperWords, manualAnchors);

    expect(results[0].whisperStartIdx).toBe(0);
    expect(results[1].whisperStartIdx).toBe(3); // manual anchor
    expect(results[1].blocked).toBe(false);
    expect(results[2].whisperStartIdx).toBe(15); // resumes matching
  });

  it("handles empty shot text as blocked", () => {
    const shots = [
      { id: "shot-1", text: "Maranello, Juillet 1987." },
      { id: "shot-empty", text: "" },
    ];
    const results = matchShotsStrictSequential(shots, whisperWords);
    expect(results[1].blocked).toBe(true);
    expect(results[1].whisperStartIdx).toBeNull();
  });
});

describe("matchShotsByText (legacy wrapper)", () => {
  it("returns TextMatchResult without blocked field", () => {
    const words = [
      { word: "Maranello,", start: 0.38, end: 1.36 },
      { word: "juillet", start: 1.36, end: 1.68 },
      { word: "1987.", start: 1.68, end: 3.72 },
    ];
    const shots = [{ id: "s1", text: "Maranello juillet 1987" }];
    const results = matchShotsByText(shots, words);
    expect(results[0].whisperStartIdx).toBe(0);
    expect(results[0]).not.toHaveProperty("blocked");
  });
});

describe("enforceMonotonicTimestamps", () => {
  it("discards matches that go backwards in time", () => {
    const words = [
      { word: "a", start: 1.0, end: 1.5 },
      { word: "b", start: 5.0, end: 5.5 },
      { word: "c", start: 900.0, end: 900.5 },
      { word: "d", start: 10.0, end: 10.5 },
    ];

    const results = [
      { shotId: "s1", whisperStartIdx: 0, matchedWords: 1 },
      { shotId: "s2", whisperStartIdx: 1, matchedWords: 1 },
      { shotId: "s3", whisperStartIdx: 2, matchedWords: 1 },
      { shotId: "s4", whisperStartIdx: 3, matchedWords: 1 },
    ];

    const fixed = enforceMonotonicTimestamps(results, words);
    expect(fixed[3].whisperStartIdx).toBeNull();
  });
});
