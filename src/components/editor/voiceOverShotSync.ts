export interface VoiceOverShotSyncSource {
  id: string;
  scene_id: string;
  shot_order: number;
  source_sentence: string | null;
  source_sentence_fr: string | null;
  description: string;
}

export interface VoiceOverShotSentence {
  id: string;
  text: string;
  isNewScene?: boolean;
}

export function getShotFragmentText(shot: VoiceOverShotSyncSource): string {
  return (shot.source_sentence || shot.source_sentence_fr || shot.description || "").trim();
}


export function buildExactShotScript(sortedShots: VoiceOverShotSyncSource[]): string {
  const sceneBlocks: string[] = [];
  let currentSceneId: string | null = null;
  let currentSceneFragments: string[] = [];

  for (const shot of sortedShots) {
    const fragment = getShotFragmentText(shot);
    if (!fragment) continue;

    if (currentSceneId !== null && shot.scene_id !== currentSceneId) {
      if (currentSceneFragments.length > 0) {
        sceneBlocks.push(currentSceneFragments.join(" "));
      }
      currentSceneFragments = [];
    }

    currentSceneId = shot.scene_id;
    currentSceneFragments.push(fragment);
  }

  if (currentSceneFragments.length > 0) {
    sceneBlocks.push(currentSceneFragments.join(" "));
  }

  return sceneBlocks.join("\n\n");
}

export function buildExactShotSentences(sortedShots: VoiceOverShotSyncSource[]): VoiceOverShotSentence[] {
  let previousSceneId: string | null = null;

  return sortedShots
    .map((shot) => {
      const text = getShotFragmentText(shot);
      if (!text) return null;

      const isNewScene = previousSceneId !== null && shot.scene_id !== previousSceneId;
      previousSceneId = shot.scene_id;

      const entry: VoiceOverShotSentence = {
        id: shot.id,
        text,
        isNewScene,
      };

      return entry;
    })
    .filter((shot): shot is VoiceOverShotSentence => Boolean(shot));
}

export function normalizeExactSyncText(text: string): string {
  return text
    .replace(/(\d)[,.](\d{3})(?=\b)/g, "$1$2")
    .replace(/(\d)[,.](\d{3})(?=\b)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}