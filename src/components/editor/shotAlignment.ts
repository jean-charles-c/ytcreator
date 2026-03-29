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

export function reorderShotsByReadingPosition(shots: Shot[], scenes: Scene[]): { reordered: Shot[]; updates: { id: string; shot_order: number }[] } {
  const sceneMap = new Map<string, Scene>();
  scenes.forEach((scene) => sceneMap.set(scene.id, scene));

  const updates: { id: string; shot_order: number }[] = [];
  const reordered = [...shots];
  const shotsByScene = new Map<string, Shot[]>();

  for (const shot of reordered) {
    const bucket = shotsByScene.get(shot.scene_id) ?? [];
    bucket.push(shot);
    shotsByScene.set(shot.scene_id, bucket);
  }

  for (const [sceneId, sceneShots] of shotsByScene) {
    const scene = sceneMap.get(sceneId);
    if (!scene) continue;

    const orderedShots = sortShotsBySceneText(scene, sceneShots);
    orderedShots.forEach((shot, index) => {
      const correctOrder = index + 1;
      if (shot.shot_order !== correctOrder) {
        shot.shot_order = correctOrder;
        updates.push({ id: shot.id, shot_order: correctOrder });
      }
    });
  }

  return { reordered, updates };
}