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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function joinFragmentsPreservingBreaks(fragments: string[], sourceText: string): string {
  const joined = fragments.join(" ");
  const normJoined = normalizeWhitespace(joined);
  const normSource = normalizeWhitespace(sourceText);
  if (normJoined === normSource) {
    return sourceText;
  }
  // DEBUG: log differences to help diagnose mismatch
  console.log("[VO sync] mismatch for scene — fragments length:", normJoined.length, "source length:", normSource.length);
  const minLen = Math.min(normJoined.length, normSource.length);
  for (let i = 0; i < minLen; i++) {
    if (normJoined[i] !== normSource[i]) {
      console.log("[VO sync] first diff at index", i, "fragment char:", JSON.stringify(normJoined.substring(i, i + 20)), "source char:", JSON.stringify(normSource.substring(i, i + 20)));
      break;
    }
  }
  return joined;
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
      ? joinFragmentsPreservingBreaks(currentSceneFragments, sourceText)
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