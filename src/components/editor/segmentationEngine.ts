/**
 * SegmentationEngine v2 — Classification narrative robuste
 *
 * Approche hybride position + contenu avec 4 mécanismes :
 *   1. MODE SWITCH  — coupure immédiate sur changement brutal abstrait↔concret
 *   2. DOMINANTE     — identification de la phase narrative dominante par contenu
 *   3. INERTIE       — au moins 2 blocs consécutifs pour confirmer un changement
 *   4. FILTRE BRUIT  — les phrases dramatiques isolées ne déclenchent rien
 *
 * Règles critiques :
 *   - Jamais de réorganisation (ordre des blocs sacré)
 *   - Jamais de fusion distante
 *   - Regroupement uniquement de blocs consécutifs
 *   - Exactement 7 sections en sortie
 */

import type { NarrativeBlock } from "./narrativeBlocks";
import { SECTION_TYPES, type SectionType, type CanonicalSection } from "./canonicalScriptTypes";

/* ── Narrative mode detection ──────────────────────── */

type NarrativeMode = "abstract" | "concrete" | "neutral";

/** Patterns indicating abstract/mysterious/conceptual mode */
const ABSTRACT_PATTERNS = [
  /\b(mystery|enigma|puzzle|secret|hidden|unknown|question|imagine|what if)\b/i,
  /\b(mystère|énigme|secret|caché|inconnu|imaginez|et si)\b/i,
  /\b(no one (knows?|understood|realized)|nobody (knew|expected))\b/i,
  /\b(personne ne (savait|comprenait|soupçonnait))\b/i,
  /\b(strange(ly)?|curious(ly)?|bizarre(ment)?|étrange(ment)?)\b/i,
  /\b(invisible|intangible|abstract|conceptual|philosophical)\b/i,
];

/** Patterns indicating concrete/historical/explanatory mode */
const CONCRETE_PATTERNS = [
  /\b(in\s+\d{3,4}|en\s+\d{3,4}|born\s+in|founded\s+in|né\s+en|fondé\s+en)\b/i,
  /\b(laboratory|factory|workshop|university|institute|company|corporation)\b/i,
  /\b(laboratoire|usine|atelier|université|institut|entreprise|société)\b/i,
  /\b(invented|created|built|designed|developed|discovered|manufactured)\b/i,
  /\b(inventé|créé|construit|conçu|développé|découvert|fabriqué)\b/i,
  /\b(the\s+process|the\s+method|the\s+technique|how\s+it\s+works)\b/i,
  /\b(le\s+procédé|la\s+méthode|la\s+technique|comment\s+ça\s+fonctionne)\b/i,
  /\b(specifically|precisely|technically|concretely|in\s+practice)\b/i,
  /\b(concrètement|précisément|techniquement|en\s+pratique)\b/i,
  /\b(step\s+\d|phase\s+\d|étape\s+\d)\b/i,
];

/** Dramatic noise phrases that should NOT trigger section changes */
const NOISE_PATTERNS = [
  /\bbut\s+(there'?s?\s+a\s+problem|here'?s?\s+the\s+(thing|catch|twist))\b/i,
  /\bthis\s+change[sd]?\s+everything\b/i,
  /\bbut\s+the\s+story\s+(doesn'?t|does\s+not)\s+end\s+(there|here)\b/i,
  /\bwhat\s+(happens?\s+next|followed)\s+(was|is)\b/i,
  /\bmais\s+(il\s+y\s+a\s+un\s+problème|voilà\s+le\s+(hic|problème))\b/i,
  /\bcela\s+change\s+tout\b/i,
  /\bmais\s+l'?histoire\s+ne\s+s'?arrête\s+pas\s+(là|ici)\b/i,
  /\b(and\s+then|et\s+puis|et\s+là|but\s+then|mais\s+alors)\b/i,
  /\b(the\s+real\s+question\s+is|la\s+vraie\s+question)\b/i,
];

/** Patterns indicating expansion, scaling, impact — Act 2/3 signals */
const EXPANSION_PATTERNS = [
  /\b(spread|expanded|grew|scaled|global(ly)?|worldwide|mass\s+production)\b/i,
  /\b(s'?est\s+répandu|a\s+grandi|s'?est\s+étendu|mondial(ement)?|production\s+de\s+masse)\b/i,
  /\b(millions?|billions?|thousands?\s+of|des\s+milliers|des\s+millions)\b/i,
  /\b(industry|market|economy|revolution|transformation)\b/i,
  /\b(industrie|marché|économie|révolution|transformation)\b/i,
];

const IMPACT_PATTERNS = [
  /\b(consequence|impact|effect|result|implication|aftermath)\b/i,
  /\b(conséquence|impact|effet|résultat|implication)\b/i,
  /\b(changed\s+the\s+world|transformed|reshap(ed|ing)|redefined)\b/i,
  /\b(a\s+changé\s+le\s+monde|transformé|redéfini|bouleversé)\b/i,
  /\b(today|nowadays|in\s+our\s+time|now\s+we|de\s+nos\s+jours|aujourd'?hui)\b/i,
];

const RESOLUTION_PATTERNS = [
  /\b(the\s+(answer|solution|truth|explanation)|finally|at\s+last|it\s+turns?\s+out)\b/i,
  /\b(la\s+(réponse|solution|vérité|explication)|finalement|enfin|en\s+réalité)\b/i,
  /\b(reveal(ed|s)?|uncovered|solved|resolved|decoded)\b/i,
  /\b(révélé|découvert|résolu|décodé|percé\s+le\s+mystère)\b/i,
];

const CONCLUSION_PATTERNS = [
  /\b(in\s+the\s+end|ultimately|in\s+conclusion|to\s+this\s+day|legacy)\b/i,
  /\b(en\s+fin\s+de\s+compte|au\s+final|en\s+conclusion|héritage|encore\s+aujourd'?hui)\b/i,
  /\b(what\s+(this|it)\s+(teaches?|tells?|shows?|means?)\s+us)\b/i,
  /\b(ce\s+que\s+(cela|ça)\s+nous\s+(apprend|montre|dit))\b/i,
  /\b(lesson|moral|takeaway|perspective|bigger\s+picture)\b/i,
  /\b(leçon|morale|perspective|vue\s+d'?ensemble)\b/i,
];

/* ── Scoring helpers ───────────────────────────────── */

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(text)).length;
}

function detectMode(text: string): NarrativeMode {
  const abstractScore = countMatches(text, ABSTRACT_PATTERNS);
  const concreteScore = countMatches(text, CONCRETE_PATTERNS);

  if (concreteScore >= 2 && concreteScore > abstractScore) return "concrete";
  if (abstractScore >= 2 && abstractScore > concreteScore) return "abstract";
  return "neutral";
}

function isNoise(text: string): boolean {
  // A block is "noise" only if it's short AND matches noise patterns
  // Long blocks with noise phrases still carry structural meaning
  const sentenceCount = (text.match(/[.!?]+(?:\s|$)/g) || []).length || 1;
  if (sentenceCount > 2) return false;
  return NOISE_PATTERNS.some((p) => p.test(text));
}

/* ── Dominante narrative scoring per section type ──── */

interface SectionScores {
  hook: number;
  introduction: number;
  act1: number;
  act2: number;
  act3: number;
  climax: number;
  conclusion: number;
}

function scoreDominant(block: NarrativeBlock, totalBlocks: number): SectionScores {
  const text = block.content;
  const ratio = totalBlocks > 0 ? block.index / totalBlocks : 0;

  // Content-based signals
  const abstractScore = countMatches(text, ABSTRACT_PATTERNS);
  const concreteScore = countMatches(text, CONCRETE_PATTERNS);
  const expansionScore = countMatches(text, EXPANSION_PATTERNS);
  const impactScore = countMatches(text, IMPACT_PATTERNS);
  const resolutionScore = countMatches(text, RESOLUTION_PATTERNS);
  const conclusionScore = countMatches(text, CONCLUSION_PATTERNS);

  // Position-based weights (soft guidance, not hard cutoffs)
  const posWeight = (center: number, spread: number) =>
    Math.exp(-0.5 * ((ratio - center) / spread) ** 2);

  return {
    hook:         abstractScore * 3 + posWeight(0.03, 0.06) * 4,
    introduction: concreteScore * 2 + posWeight(0.12, 0.08) * 3,
    act1:         concreteScore * 1.5 + posWeight(0.25, 0.10) * 3,
    act2:         expansionScore * 2.5 + posWeight(0.45, 0.12) * 3,
    act3:         impactScore * 2.5 + posWeight(0.68, 0.10) * 3,
    climax:       resolutionScore * 3 + posWeight(0.82, 0.08) * 3,
    conclusion:   conclusionScore * 3 + posWeight(0.93, 0.06) * 4,
  };
}

function bestSection(scores: SectionScores): SectionType {
  let best: SectionType = "act2";
  let bestVal = -Infinity;
  for (const [key, val] of Object.entries(scores) as [SectionType, number][]) {
    if (val > bestVal) {
      bestVal = val;
      best = key;
    }
  }
  return best;
}

/* ── Phase 1: Advanced classification ──────────────── */

interface ClassifiedBlock {
  block: NarrativeBlock;
  section: SectionType;
  mode: NarrativeMode;
  isNoise: boolean;
}

function classifyBlocks(blocks: NarrativeBlock[]): ClassifiedBlock[] {
  if (blocks.length === 0) return [];

  const typeOrder = new Map(SECTION_TYPES.map((t, i) => [t, i]));
  const classified: ClassifiedBlock[] = [];

  let currentSection: SectionType = "hook";
  let pendingSection: SectionType | null = null;
  let pendingCount = 0;
  let prevMode: NarrativeMode = "neutral";

  for (const block of blocks) {
    const mode = detectMode(block.content);
    const noise = isNoise(block.content);
    const scores = scoreDominant(block, blocks.length);
    const candidate = bestSection(scores);

    // Ensure candidate doesn't go backward
    const candidateOrder = typeOrder.get(candidate)!;
    const currentOrder = typeOrder.get(currentSection)!;
    const validCandidate = candidateOrder >= currentOrder ? candidate : currentSection;

    // ── RULE 1: MODE SWITCH (highest priority) ────────
    // Detect brutal shift abstract↔concrete
    const modeSwitch =
      (prevMode === "abstract" && mode === "concrete") ||
      (prevMode === "neutral" && currentSection === "hook" && mode === "concrete");

    if (modeSwitch && !noise) {
      // Immediate cut — override inertia
      const newSection = candidateOrder > currentOrder ? validCandidate : nextSection(currentSection);
      currentSection = newSection;
      pendingSection = null;
      pendingCount = 0;
      classified.push({ block, section: currentSection, mode, isNoise: noise });
      prevMode = mode;
      continue;
    }

    // ── RULE 4: NOISE FILTER ──────────────────────────
    if (noise) {
      // Stay in current section, don't let noise influence transitions
      classified.push({ block, section: currentSection, mode, isNoise: true });
      // Don't update prevMode — noise doesn't count
      continue;
    }

    // ── RULE 2: DOMINANTE NARRATIVE ───────────────────
    if (validCandidate !== currentSection) {
      // ── RULE 3: INERTIE — require 2 consecutive confirming blocks ──
      if (pendingSection === validCandidate) {
        pendingCount++;
        if (pendingCount >= 2) {
          // Confirmed: switch section
          currentSection = validCandidate;
          pendingSection = null;
          pendingCount = 0;
          // Reclassify the previous pending block
          if (classified.length > 0) {
            const prev = classified[classified.length - 1];
            if (prev.section !== currentSection && !prev.isNoise) {
              classified[classified.length - 1] = { ...prev, section: currentSection };
            }
          }
        }
      } else {
        // First signal of a new section — start pending
        pendingSection = validCandidate;
        pendingCount = 1;
      }
    } else {
      // Same section — reset pending
      pendingSection = null;
      pendingCount = 0;
    }

    classified.push({ block, section: currentSection, mode, isNoise: false });
    prevMode = mode;
  }

  return classified;
}

function nextSection(current: SectionType): SectionType {
  const idx = SECTION_TYPES.indexOf(current);
  return idx < SECTION_TYPES.length - 1 ? SECTION_TYPES[idx + 1] : current;
}

/* ── Phase 2: Enforce monotonic + hook-specific rules ─ */

function enforceHookRules(classified: ClassifiedBlock[]): ClassifiedBlock[] {
  // Hook continues while abstract/neutral and no concrete explanation
  // Hook ends IMMEDIATELY if concrete mode detected
  let hookEnded = false;

  return classified.map((item) => {
    if (hookEnded) return item;

    if (item.section === "hook") {
      // Check if this block should end the hook
      if (item.mode === "concrete" && !item.isNoise) {
        hookEnded = true;
        // This block starts the next section
        return { ...item, section: "introduction" };
      }
      return item;
    } else {
      hookEnded = true;
      return item;
    }
  });
}

function enforceMonotonicOrder(classified: ClassifiedBlock[]): ClassifiedBlock[] {
  if (classified.length === 0) return [];

  const typeOrder = new Map(SECTION_TYPES.map((t, i) => [t, i]));
  let currentMaxOrder = typeOrder.get(classified[0].section)!;

  return classified.map((item) => {
    const itemOrder = typeOrder.get(item.section)!;
    if (itemOrder < currentMaxOrder) {
      const currentSection = SECTION_TYPES[currentMaxOrder];
      return { ...item, section: currentSection };
    }
    currentMaxOrder = itemOrder;
    return item;
  });
}

/* ── Phase 3: Group consecutive blocks ─────────────── */

function groupConsecutiveBlocks(
  classified: ClassifiedBlock[],
): Map<SectionType, string> {
  const result = new Map<SectionType, string>();

  for (const type of SECTION_TYPES) {
    result.set(type, "");
  }

  for (const { block, section } of classified) {
    const existing = result.get(section)!;
    result.set(
      section,
      existing ? existing + "\n\n" + block.content : block.content,
    );
  }

  return result;
}

/* ── Public API ────────────────────────────────────── */

export interface SegmentationResult {
  sections: CanonicalSection[];
  blockCount: number;
  emptySections: SectionType[];
}

export function segmentBlocks(blocks: NarrativeBlock[]): SegmentationResult {
  if (blocks.length === 0) {
    return {
      sections: SECTION_TYPES.map((type, order) => ({
        type,
        order,
        originalText: "",
        editedText: null,
        translatedFR: null,
        history: [],
      })),
      blockCount: 0,
      emptySections: [...SECTION_TYPES],
    };
  }

  // Phase 1: Advanced classification with dominante + inertia + mode switch
  const classified = classifyBlocks(blocks);

  // Phase 1b: Enforce hook-specific rules
  const withHookRules = enforceHookRules(classified);

  // Phase 2: Enforce monotonic section order
  const monotonic = enforceMonotonicOrder(withHookRules);

  // Phase 3: Group consecutive blocks
  const grouped = groupConsecutiveBlocks(monotonic);

  // Build canonical sections
  const emptySections: SectionType[] = [];
  const sections: CanonicalSection[] = SECTION_TYPES.map((type, order) => {
    const text = grouped.get(type) || "";
    if (!text.trim()) emptySections.push(type);
    return {
      type,
      order,
      originalText: text.trim(),
      editedText: null,
      translatedFR: null,
      history: [],
    };
  });

  return { sections, blockCount: blocks.length, emptySections };
}
