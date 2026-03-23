/**
 * Visual Redundancy Detector
 *
 * Detects and mitigates visual similarity between adjacent shots
 * within a scene, ensuring cinematic variety without breaking coherence.
 *
 * Checks:
 * 1. Camera type repetition (shot_type)
 * 2. Lexical similarity between prompt_export texts
 * 3. Action/subject overlap detection
 * 4. Structural prompt pattern repetition
 */

// ── Types ──────────────────────────────────────────────────────────

export interface RedundancyIssue {
  shotIndexA: number;
  shotIndexB: number;
  type: "camera_repeat" | "lexical_similarity" | "action_overlap" | "structural_repeat";
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface RedundancyReport {
  sceneId: string;
  issues: RedundancyIssue[];
  hasHighSeverity: boolean;
  diversityScore: number; // 0-100, higher = more diverse
}

// ── Camera type rotation ───────────────────────────────────────────

const CAMERA_TYPES = [
  "Plan d'ensemble",
  "Plan d'activité",
  "Plan d'interaction",
  "Plan environnemental",
  "Plan de détail d'artefact",
  "Plan de détail scientifique",
  "Plan portrait",
  "Plan subjectif",
];

function checkCameraRepetition(shots: Array<{ shot_type: string }>): RedundancyIssue[] {
  const issues: RedundancyIssue[] = [];
  for (let i = 1; i < shots.length; i++) {
    const prev = normalizeCamera(shots[i - 1].shot_type);
    const curr = normalizeCamera(shots[i].shot_type);
    if (prev && curr && prev === curr) {
      issues.push({
        shotIndexA: i - 1,
        shotIndexB: i,
        type: "camera_repeat",
        severity: "medium",
        detail: `Consecutive shots ${i} and ${i + 1} use same camera type: "${shots[i].shot_type}"`,
      });
    }
  }
  return issues;
}

function normalizeCamera(type: string): string {
  return (type || "").toLowerCase().replace(/['']/g, "'").trim();
}

// ── Lexical similarity ─────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,;:!?"'()\-–—]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3); // skip short function words
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function checkLexicalSimilarity(
  shots: Array<{ prompt_export?: string | null }>
): RedundancyIssue[] {
  const issues: RedundancyIssue[] = [];
  const HIGH_THRESHOLD = 0.65;
  const MEDIUM_THRESHOLD = 0.50;

  for (let i = 1; i < shots.length; i++) {
    const tokensA = tokenize(shots[i - 1].prompt_export || "");
    const tokensB = tokenize(shots[i].prompt_export || "");
    const similarity = jaccardSimilarity(tokensA, tokensB);

    if (similarity >= HIGH_THRESHOLD) {
      issues.push({
        shotIndexA: i - 1,
        shotIndexB: i,
        type: "lexical_similarity",
        severity: "high",
        detail: `Prompts ${i} and ${i + 1} are ${Math.round(similarity * 100)}% similar lexically`,
      });
    } else if (similarity >= MEDIUM_THRESHOLD) {
      issues.push({
        shotIndexA: i - 1,
        shotIndexB: i,
        type: "lexical_similarity",
        severity: "medium",
        detail: `Prompts ${i} and ${i + 1} share ${Math.round(similarity * 100)}% vocabulary`,
      });
    }
  }
  return issues;
}

// ── Action/subject overlap ─────────────────────────────────────────

const ACTION_PATTERNS = [
  /\b(wide shot of|close-up on|medium shot of|low-angle view of|high-angle shot of|overhead shot of|tracking shot of)\b/gi,
  /\b(showing|depicting|illustrating|capturing|revealing|featuring)\b/gi,
];

function extractActionSubject(prompt: string): string {
  // Extract the core subject after the camera framing
  const lower = prompt.toLowerCase();
  const framingEnd = lower.search(
    /\b(wide shot|close-up|medium shot|low-angle|high-angle|overhead|tracking shot|cinematic shot|establishing shot|detail shot|portrait shot|point-of-view|macro)\b.*?\bof\b/
  );
  if (framingEnd >= 0) {
    const afterFraming = lower.slice(framingEnd);
    const ofIdx = afterFraming.indexOf(" of ");
    if (ofIdx >= 0) {
      // Take 60 chars after "of" as the subject
      return afterFraming.slice(ofIdx + 4, ofIdx + 64).trim();
    }
  }
  // Fallback: first 80 chars
  return lower.slice(0, 80).trim();
}

function checkActionOverlap(
  shots: Array<{ prompt_export?: string | null; description?: string }>
): RedundancyIssue[] {
  const issues: RedundancyIssue[] = [];

  for (let i = 1; i < shots.length; i++) {
    const subjectA = extractActionSubject(shots[i - 1].prompt_export || shots[i - 1].description || "");
    const subjectB = extractActionSubject(shots[i].prompt_export || shots[i].description || "");

    const similarity = jaccardSimilarity(tokenize(subjectA), tokenize(subjectB));
    if (similarity >= 0.6) {
      issues.push({
        shotIndexA: i - 1,
        shotIndexB: i,
        type: "action_overlap",
        severity: "high",
        detail: `Shots ${i} and ${i + 1} describe very similar visual subjects`,
      });
    }
  }
  return issues;
}

// ── Structural repetition ──────────────────────────────────────────

function getPromptStructure(prompt: string): string {
  // Extract structural pattern: camera type + lighting keyword + atmosphere keyword
  const lower = prompt.toLowerCase();
  const parts: string[] = [];

  // Camera
  const cameraMatch = lower.match(/\b(wide|close-up|medium|low-angle|high-angle|overhead|tracking|establishing|detail|portrait|macro)\b/);
  if (cameraMatch) parts.push(cameraMatch[1]);

  // Lighting
  const lightMatch = lower.match(/\b(dawn|dusk|sunset|sunrise|golden hour|candlelight|torchlight|firelight|moonlight|overcast|diffused|harsh|soft|natural)\b/);
  if (lightMatch) parts.push(lightMatch[1]);

  // Atmosphere
  const atmoMatch = lower.match(/\b(dust|fog|haze|mist|smoke|rain|humid|dry|cold|warm|hot)\b/);
  if (atmoMatch) parts.push(atmoMatch[1]);

  return parts.join("|");
}

function checkStructuralRepeat(
  shots: Array<{ prompt_export?: string | null }>
): RedundancyIssue[] {
  const issues: RedundancyIssue[] = [];

  for (let i = 1; i < shots.length; i++) {
    const structA = getPromptStructure(shots[i - 1].prompt_export || "");
    const structB = getPromptStructure(shots[i].prompt_export || "");

    if (structA && structB && structA === structB) {
      issues.push({
        shotIndexA: i - 1,
        shotIndexB: i,
        type: "structural_repeat",
        severity: "low",
        detail: `Shots ${i} and ${i + 1} share same structural pattern: ${structA}`,
      });
    }
  }
  return issues;
}

// ── Main analysis ──────────────────────────────────────────────────

export function analyzeRedundancy(
  sceneId: string,
  shots: Array<{
    shot_type: string;
    description?: string;
    prompt_export?: string | null;
  }>
): RedundancyReport {
  if (shots.length <= 1) {
    return { sceneId, issues: [], hasHighSeverity: false, diversityScore: 100 };
  }

  const issues = [
    ...checkCameraRepetition(shots),
    ...checkLexicalSimilarity(shots),
    ...checkActionOverlap(shots),
    ...checkStructuralRepeat(shots),
  ];

  const hasHighSeverity = issues.some((i) => i.severity === "high");

  // Diversity score: start at 100, deduct per issue
  const deductions = { high: 20, medium: 10, low: 5 };
  const totalDeduction = issues.reduce((sum, i) => sum + deductions[i.severity], 0);
  const diversityScore = Math.max(0, Math.min(100, 100 - totalDeduction));

  return { sceneId, issues, hasHighSeverity, diversityScore };
}

// ── Camera rotation enforcer ───────────────────────────────────────

/**
 * Given a list of shots, fix consecutive camera type repetitions
 * by rotating to the next available camera type.
 * Returns updated shot_type values (only changes when needed).
 */
export function enforceCameraRotation(
  shots: Array<{ shot_type: string }>
): string[] {
  const result = shots.map((s) => s.shot_type);

  for (let i = 1; i < result.length; i++) {
    if (normalizeCamera(result[i]) === normalizeCamera(result[i - 1])) {
      // Find a camera type not used by neighbors
      const usedByNeighbors = new Set<string>();
      if (i > 0) usedByNeighbors.add(normalizeCamera(result[i - 1]));
      if (i + 1 < result.length) usedByNeighbors.add(normalizeCamera(result[i + 1]));

      const alternative = CAMERA_TYPES.find(
        (ct) => !usedByNeighbors.has(normalizeCamera(ct))
      );
      if (alternative) {
        result[i] = alternative;
      }
    }
  }

  return result;
}
