import { describe, expect, it } from "vitest";
import { matchShotsByText, enforceMonotonicTimestamps } from "../components/editor/whisperTextMatcher";

describe("whisperTextMatcher", () => {
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

  it("matches shots by text, not by time", () => {
    const shots = [
      { id: "shot-1", text: "Maranello, Juillet mille neuf cent quatre-vingt-sept." },
      { id: "shot-2", text: "Sous une laque rouge si fine que la trame du carbone affleure," },
      { id: "shot-3", text: "une voiture reçoit la bénédiction" },
    ];

    const results = matchShotsByText(shots, whisperWords);

    expect(results[0].whisperStartIdx).toBe(0); // "Maranello" at 0.38s
    expect(results[1].whisperStartIdx).toBe(3); // "Sous" at 3.72s
    expect(results[2].whisperStartIdx).toBe(15); // "une" (voiture) at 6.84s
  });

  it("returns null for shots with no matching text", () => {
    const shots = [
      { id: "shot-x", text: "Texte introuvable dans le transcript" },
    ];

    const results = matchShotsByText(shots, whisperWords);
    expect(results[0].whisperStartIdx).toBeNull();
  });

  it("handles empty shot text", () => {
    const shots = [{ id: "shot-empty", text: "" }];
    const results = matchShotsByText(shots, whisperWords);
    expect(results[0].whisperStartIdx).toBeNull();
  });
});

describe("enforceMonotonicTimestamps", () => {
  it("discards matches that go backwards in time", () => {
    const words = [
      { word: "a", start: 1.0, end: 1.5 },
      { word: "b", start: 5.0, end: 5.5 },
      { word: "c", start: 900.0, end: 900.5 }, // far away match
      { word: "d", start: 10.0, end: 10.5 },
    ];

    const results = [
      { shotId: "s1", whisperStartIdx: 0, matchedWords: 1 },
      { shotId: "s2", whisperStartIdx: 1, matchedWords: 1 },
      { shotId: "s3", whisperStartIdx: 2, matchedWords: 1 }, // 900s — jump
      { shotId: "s4", whisperStartIdx: 3, matchedWords: 1 }, // 10s — backwards!
    ];

    const fixed = enforceMonotonicTimestamps(results, words);
    expect(fixed[0].whisperStartIdx).toBe(0);
    expect(fixed[1].whisperStartIdx).toBe(1);
    expect(fixed[2].whisperStartIdx).toBe(2);
    expect(fixed[3].whisperStartIdx).toBeNull(); // discarded
  });
});
