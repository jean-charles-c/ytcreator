/**
 * ShotOperation — Unified validation rules (client-side mirror)
 */

export type OperationType = "generate" | "regenerate" | "merge" | "delete" | "add";

export interface ShotOperationInput {
  type: OperationType;
  shotFragment: string;
  sceneText: string;
  sceneContext: Record<string, string> | null;
  neighborsBefore: Array<{ shot_type: string; prompt_export?: string | null }>;
  neighborsAfter: Array<{ shot_type: string; prompt_export?: string | null }>;
}

export interface ShotOperationResult {
  valid: boolean;
  issues: string[];
  avoidCameraTypes: string[];
  contextAnchor: string;
  relevantCharacters: string | null;
}

const normalizeForMatch = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

export function validateShotOperation(input: ShotOperationInput): ShotOperationResult {
  const issues: string[] = [];

  if (!input.shotFragment || !input.shotFragment.trim()) {
    issues.push("Shot fragment is empty");
  } else {
    const normalizedScene = normalizeForMatch(input.sceneText);
    const normalizedFrag = normalizeForMatch(input.shotFragment);
    if (normalizedScene && !normalizedScene.includes(normalizedFrag)) {
      if (input.type !== "merge") {
        issues.push("Fragment not found in scene text");
      }
    }
  }

  const avoidCameraTypes: string[] = [];
  const normCam = (t: string) => (t || "").toLowerCase().replace(/['']/g, "'").trim();

  if (input.neighborsBefore.length > 0) {
    avoidCameraTypes.push(normCam(input.neighborsBefore[input.neighborsBefore.length - 1].shot_type));
  }
  if (input.neighborsAfter.length > 0) {
    avoidCameraTypes.push(normCam(input.neighborsAfter[0].shot_type));
  }

  const ctx = input.sceneContext;
  const contextAnchor = `In ${ctx?.epoque || "the historical period"}, ${ctx?.lieu || "the described location"}`;

  let relevantCharacters: string | null = null;
  if (ctx?.personnages && ctx.personnages !== "Non déterminé") {
    const hasHumanCue = /\b(people|person|king|queen|ruler|trader|craftsmen|builder|worker|priest|warrior|chief|community|population|inhabitants|they|he|she|them)\b/i.test(input.shotFragment)
      || /\b(peuple|roi|reine|dirigeant|commerçant|artisan|bâtisseur|ouvrier|prêtre|guerrier|chef|communauté|population|habitants|ils|il|elle|eux)\b/i.test(input.shotFragment);
    if (hasHumanCue) relevantCharacters = ctx.personnages;
  }

  return { valid: issues.length === 0, issues, avoidCameraTypes, contextAnchor, relevantCharacters };
}
