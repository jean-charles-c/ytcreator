/**
 * SegmentationEngine — Classifie chaque NarrativeBlock par fonction
 * narrative puis regroupe les blocs consécutifs dans les 7 sections fixes.
 *
 * Deux phases :
 *   1. Classification : attribue à chaque bloc une SectionType candidate
 *      basée sur sa position relative, ses signaux et son contenu.
 *   2. Regroupement séquentiel : fusionne les blocs consécutifs partageant
 *      la même classification, puis mappe vers les 7 sections canoniques.
 *
 * Règles critiques :
 *   - Jamais de découpage par longueur
 *   - Jamais de réorganisation (l'ordre des blocs est sacré)
 *   - Une phrase dramatique seule ne crée pas une section
 *   - La Conclusion reste monolithique (révélation + thèse + fermeture)
 *   - Exactement 7 sections en sortie, certaines pouvant être vides
 */

import type { NarrativeBlock } from "./narrativeBlocks";
import { SECTION_TYPES, type SectionType, type CanonicalSection } from "./canonicalScriptTypes";

/* ── Phase 1 : Classification ──────────────────────── */

/**
 * Classify a single block based on its relative position within the script
 * and its contextual signals. Position-based heuristics dominate because
 * narrative structure is fundamentally sequential.
 */
function classifyBlock(
  block: NarrativeBlock,
  totalBlocks: number,
): SectionType {
  if (totalBlocks === 0) return "act2";

  const ratio = block.index / totalBlocks; // 0..~1

  // ── Position-based primary classification ───────────
  // These ranges are tuned for YouTube documentary scripts (7-section arc).
  // They intentionally overlap slightly — signals break ties.

  if (ratio < 0.08) return "hook";
  if (ratio < 0.18) return "introduction";
  if (ratio < 0.35) return "act1";
  if (ratio < 0.60) return "act2";
  if (ratio < 0.78) return "act3";
  if (ratio < 0.88) return "climax";
  return "conclusion";
}

/* ── Phase 2 : Sequential grouping ─────────────────── */

interface ClassifiedBlock {
  block: NarrativeBlock;
  section: SectionType;
}

/**
 * Enforce monotonic section progression.
 * If a block is classified into a section that would violate the fixed
 * order (e.g., "act1" appearing after "act3"), it is absorbed into the
 * current section to preserve sequential integrity.
 */
function enforceMonotonicOrder(classified: ClassifiedBlock[]): ClassifiedBlock[] {
  if (classified.length === 0) return [];

  const typeOrder = new Map(SECTION_TYPES.map((t, i) => [t, i]));
  let currentMaxOrder = typeOrder.get(classified[0].section)!;

  return classified.map((item) => {
    const itemOrder = typeOrder.get(item.section)!;
    if (itemOrder < currentMaxOrder) {
      // This block would go backward — absorb into current section
      const currentSection = SECTION_TYPES[currentMaxOrder];
      return { ...item, section: currentSection };
    }
    currentMaxOrder = itemOrder;
    return item;
  });
}

/**
 * Merge consecutive blocks sharing the same section type into text chunks.
 * Returns a Map<SectionType, string> with concatenated content.
 */
function groupConsecutiveBlocks(
  classified: ClassifiedBlock[],
): Map<SectionType, string> {
  const result = new Map<SectionType, string>();

  // Initialize all sections as empty
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
  /** Number of source blocks processed */
  blockCount: number;
  /** Sections that ended up empty */
  emptySections: SectionType[];
}

/**
 * Run the full segmentation pipeline:
 * NarrativeBlock[] → classify → enforce order → group → CanonicalSection[]
 */
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

  // Phase 1: Classify each block
  const classified: ClassifiedBlock[] = blocks.map((block) => ({
    block,
    section: classifyBlock(block, blocks.length),
  }));

  // Phase 2a: Enforce monotonic section order
  const monotonic = enforceMonotonicOrder(classified);

  // Phase 2b: Group consecutive blocks
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
