import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

export function normalizeAlignmentText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWords(value: string): Set<string> {
  return new Set(normalizeAlignmentText(value).split(" ").filter((word) => word.length > 2));
}

function wordOverlapScore(a: string, b: string): number {
  const wordsA = extractWords(a);
  const wordsB = extractWords(b);

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap += 1;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}

export function findBestAlignmentPosition(sceneText: string, fragmentText: string): number {
  const normalizedScene = normalizeAlignmentText(sceneText);
  const normalizedFragment = normalizeAlignmentText(fragmentText);

  if (!normalizedScene || !normalizedFragment) return -1;

  const exact = normalizedScene.indexOf(normalizedFragment);
  if (exact >= 0) return exact;

  const shortFragment = normalizedFragment.slice(0, 60).trim();
  if (shortFragment.length >= 12) {
    const shortPosition = normalizedScene.indexOf(shortFragment);
    if (shortPosition >= 0) return shortPosition;
  }

  const sceneParts = normalizedScene.split(/(?<=[.!?])\s+/);
  let bestPosition = -1;
  let bestScore = 0;
  let charOffset = 0;

  for (const part of sceneParts) {
    const score = wordOverlapScore(part, normalizedFragment);
    if (score > bestScore && score >= 0.45) {
      bestScore = score;
      bestPosition = charOffset;
    }
    charOffset += part.length + 1;
  }

  return bestPosition;
}

export function computeShotAlignmentPosition(scene: Scene, shot: Shot): number {
  const sceneTexts = [scene.source_text, scene.source_text_fr ?? ""].filter((value) => value.trim().length > 0);
  const shotTexts = [shot.source_sentence ?? "", shot.source_sentence_fr ?? "", shot.description ?? ""]
    .filter((value) => value.trim().length > 0);

  let bestPosition = -1;

  for (const sceneText of sceneTexts) {
    for (const shotText of shotTexts) {
      const position = findBestAlignmentPosition(sceneText, shotText);
      if (position >= 0 && (bestPosition === -1 || position < bestPosition)) {
        bestPosition = position;
      }
    }
  }

  return bestPosition;
}

export function sortShotsBySceneText(scene: Scene, sceneShots: Shot[]): Shot[] {
  return [...sceneShots].sort((a, b) => {
    const positionA = computeShotAlignmentPosition(scene, a);
    const positionB = computeShotAlignmentPosition(scene, b);

    if (positionA === -1 && positionB === -1) return a.shot_order - b.shot_order;
    if (positionA === -1) return 1;
    if (positionB === -1) return -1;
    if (positionA !== positionB) return positionA - positionB;

    return a.shot_order - b.shot_order;
  });
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  🔒 LOCKED — shot_order is the SOLE source of truth.           ║
// ║  Manual reordering (⬆/⬇) persists to DB; this function MUST   ║
// ║  NOT override it with text-position sorting.                    ║
// ╚══════════════════════════════════════════════════════════════════╝
export function reorderShotsByReadingPosition(shots: Shot[], _scenes: Scene[]): { reordered: Shot[]; updates: { id: string; shot_order: number }[] } {
  // Simply return shots sorted by shot_order — never re-sort by text position
  const reordered = [...shots].sort((a, b) => {
    if (a.scene_id !== b.scene_id) return 0; // preserve inter-scene ordering from query
    return a.shot_order - b.shot_order;
  });
  return { reordered, updates: [] };
}