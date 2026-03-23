/**
 * Visual Redundancy Detector (client-side mirror)
 */

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
  diversityScore: number;
}

const CAMERA_TYPES = [
  "Plan d'ensemble", "Plan d'activité", "Plan d'interaction",
  "Plan environnemental", "Plan de détail d'artefact", "Plan de détail scientifique",
  "Plan portrait", "Plan subjectif",
];

const normalizeCamera = (t: string) => (t || "").toLowerCase().replace(/['']/g, "'").trim();

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[.,;:!?"'()\-–—]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const setA = new Set(a), setB = new Set(b);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function analyzeRedundancy(
  sceneId: string,
  shots: Array<{ shot_type: string; description?: string; prompt_export?: string | null }>
): RedundancyReport {
  if (shots.length <= 1) return { sceneId, issues: [], hasHighSeverity: false, diversityScore: 100 };

  const issues: RedundancyIssue[] = [];

  for (let i = 1; i < shots.length; i++) {
    // Camera repeat
    if (normalizeCamera(shots[i].shot_type) === normalizeCamera(shots[i - 1].shot_type)) {
      issues.push({ shotIndexA: i - 1, shotIndexB: i, type: "camera_repeat", severity: "medium", detail: `Same camera: "${shots[i].shot_type}"` });
    }
    // Lexical similarity
    const sim = jaccardSimilarity(tokenize(shots[i - 1].prompt_export || ""), tokenize(shots[i].prompt_export || ""));
    if (sim >= 0.65) {
      issues.push({ shotIndexA: i - 1, shotIndexB: i, type: "lexical_similarity", severity: "high", detail: `${Math.round(sim * 100)}% similar` });
    } else if (sim >= 0.50) {
      issues.push({ shotIndexA: i - 1, shotIndexB: i, type: "lexical_similarity", severity: "medium", detail: `${Math.round(sim * 100)}% similar` });
    }
  }

  const hasHighSeverity = issues.some((i) => i.severity === "high");
  const deductions = { high: 20, medium: 10, low: 5 };
  const diversityScore = Math.max(0, 100 - issues.reduce((s, i) => s + deductions[i.severity], 0));

  return { sceneId, issues, hasHighSeverity, diversityScore };
}

export function enforceCameraRotation(shots: Array<{ shot_type: string }>): string[] {
  const result = shots.map((s) => s.shot_type);
  for (let i = 1; i < result.length; i++) {
    if (normalizeCamera(result[i]) === normalizeCamera(result[i - 1])) {
      const used = new Set<string>();
      if (i > 0) used.add(normalizeCamera(result[i - 1]));
      if (i + 1 < result.length) used.add(normalizeCamera(result[i + 1]));
      const alt = CAMERA_TYPES.find((ct) => !used.has(normalizeCamera(ct)));
      if (alt) result[i] = alt;
    }
  }
  return result;
}
