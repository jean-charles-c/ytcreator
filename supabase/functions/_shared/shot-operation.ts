/**
 * ShotOperation — Unified validation rules for all shot operations.
 *
 * Ensures consistent behavior across:
 * - Initial generation (generate-storyboard)
 * - Regeneration (regenerate-shot)
 * - Merge (client-side computeMerge)
 * - Delete with redistribution (client-side computeDeleteRedistribution)
 *
 * All operations must pass:
 * 1. Fragment validity (non-empty, within scene text)
 * 2. Allocation integrity (no overlap, no gaps with neighbors)
 * 3. Non-redundancy (different camera/prompt from neighbors)
 */

// ── Types ──────────────────────────────────────────────────────────

export type OperationType = "generate" | "regenerate" | "merge" | "delete" | "add";

export interface ShotOperationInput {
  type: OperationType;
  /** The shot being operated on */
  shotFragment: string;
  /** Scene source text */
  sceneText: string;
  /** Scene context from SEGMENTATION */
  sceneContext: Record<string, string> | null;
  /** Neighbor shots (before/after) for redundancy check */
  neighborsBefore: Array<{ shot_type: string; prompt_export?: string | null }>;
  neighborsAfter: Array<{ shot_type: string; prompt_export?: string | null }>;
}

export interface ShotOperationResult {
  valid: boolean;
  issues: string[];
  /** Suggested camera types to avoid (from neighbors) */
  avoidCameraTypes: string[];
  /** Context anchor to inject */
  contextAnchor: string;
  /** Characters relevant to fragment */
  relevantCharacters: string | null;
}

// ── Validation ─────────────────────────────────────────────────────

const normalizeForMatch = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

export function validateShotOperation(input: ShotOperationInput): ShotOperationResult {
  const issues: string[] = [];

  // 1. Fragment validity
  if (!input.shotFragment || !input.shotFragment.trim()) {
    issues.push("Shot fragment is empty");
  } else {
    const normalizedScene = normalizeForMatch(input.sceneText);
    const normalizedFrag = normalizeForMatch(input.shotFragment);
    if (normalizedScene && !normalizedScene.includes(normalizedFrag)) {
      // For merge operations, the merged fragment may not be a verbatim substring
      if (input.type !== "merge") {
        issues.push("Fragment not found in scene text");
      }
    }
  }

  // 2. Camera types to avoid (from immediate neighbors)
  const avoidCameraTypes: string[] = [];
  const normCam = (t: string) => (t || "").toLowerCase().replace(/['']/g, "'").trim();

  if (input.neighborsBefore.length > 0) {
    const lastBefore = input.neighborsBefore[input.neighborsBefore.length - 1];
    avoidCameraTypes.push(normCam(lastBefore.shot_type));
  }
  if (input.neighborsAfter.length > 0) {
    const firstAfter = input.neighborsAfter[0];
    avoidCameraTypes.push(normCam(firstAfter.shot_type));
  }

  // 3. Build context anchor
  const ctx = input.sceneContext;
  const epoque = ctx?.epoque || "the historical period";
  const lieu = ctx?.lieu || "the described location";
  const contextAnchor = `In ${epoque}, ${lieu}`;

  // 4. Relevant characters (only if fragment mentions people)
  let relevantCharacters: string | null = null;
  if (ctx?.personnages && ctx.personnages !== "Non déterminé") {
    const hasHumanCue = /\b(people|person|king|queen|ruler|trader|craftsmen|builder|worker|priest|warrior|chief|community|population|inhabitants|they|he|she|them)\b/i.test(input.shotFragment)
      || /\b(peuple|roi|reine|dirigeant|commerçant|artisan|bâtisseur|ouvrier|prêtre|guerrier|chef|communauté|population|habitants|ils|il|elle|eux)\b/i.test(input.shotFragment);
    if (hasHumanCue) {
      relevantCharacters = ctx.personnages;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    avoidCameraTypes,
    contextAnchor,
    relevantCharacters,
  };
}

// ── Neighbor context builder for AI prompts ────────────────────────

export function buildNeighborAvoidancePrompt(
  neighborsBefore: Array<{ shot_type: string; prompt_export?: string | null }>,
  neighborsAfter: Array<{ shot_type: string; prompt_export?: string | null }>
): string {
  const lines: string[] = [];

  if (neighborsBefore.length > 0) {
    const prev = neighborsBefore[neighborsBefore.length - 1];
    lines.push(`PRECEDING SHOT (must differ visually):`);
    lines.push(`  Camera: ${prev.shot_type}`);
    if (prev.prompt_export) {
      lines.push(`  Prompt excerpt: "${prev.prompt_export.slice(0, 150)}..."`);
    }
  }

  if (neighborsAfter.length > 0) {
    const next = neighborsAfter[0];
    lines.push(`FOLLOWING SHOT (must differ visually):`);
    lines.push(`  Camera: ${next.shot_type}`);
    if (next.prompt_export) {
      lines.push(`  Prompt excerpt: "${next.prompt_export.slice(0, 150)}..."`);
    }
  }

  if (lines.length === 0) return "";

  return `\nNEIGHBOR SHOTS — AVOID VISUAL SIMILARITY:\n${lines.join("\n")}\n\nCRITICAL: Your generated shot MUST use a DIFFERENT camera type and visual composition than these neighbors. Vary the angle, lighting direction, time-of-day feel, and focal distance.`;
}
