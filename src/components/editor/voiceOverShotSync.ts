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

function joinFragmentsWithOriginalBreaks(fragments: string[], sourceText: string): string {
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return fragments[0];

  const parts: string[] = [fragments[0]];
  let cursor = 0;

  const firstIdx = sourceText.indexOf(fragments[0]);
  if (firstIdx >= 0) {
    cursor = firstIdx + fragments[0].length;
  }

  for (let i = 1; i < fragments.length; i++) {
    const nextIdx = sourceText.indexOf(fragments[i], cursor);
    if (nextIdx >= 0) {
      const between = sourceText.substring(cursor, nextIdx);
      const sep = between.includes("\n") ? "\n" : " ";
      parts.push(sep, fragments[i]);
      cursor = nextIdx + fragments[i].length;
    } else {
      parts.push(" ", fragments[i]);
    }
  }

  return parts.join("");
}

export function buildExactShotScript(
  sortedShots: VoiceOverShotSyncSource[],
  sceneTextMap?: Map<string, string>,
): string {
  const sceneBlocks: string[] = [];
  let currentSceneId: string | null = null;
  let currentSceneFragments: string[] = [];

  const flushScene = () => {
    if (currentSceneFragments.length === 0) return;
    const sourceText = currentSceneId ? sceneTextMap?.get(currentSceneId) : undefined;
    const joined = sourceText
      ? joinFragmentsWithOriginalBreaks(currentSceneFragments, sourceText)
      : currentSceneFragments.join(" ");
    sceneBlocks.push(joined);
  };

  for (const shot of sortedShots) {
    const fragment = getShotFragmentText(shot);
    if (!fragment) continue;

    if (currentSceneId !== null && shot.scene_id !== currentSceneId) {
      flushScene();
      currentSceneFragments = [];
    }

    currentSceneId = shot.scene_id;
    currentSceneFragments.push(fragment);
  }

  flushScene();

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