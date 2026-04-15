/**
 * CanonicalScript — Modèle de données stable pour un script narratif
 * segmenté, versionnable et traduisible.
 *
 * V5 — NarrativeEngineExpert : 15 blocs
 *   • NarrativeCoreBlocks  (1-12) : script principal + OUTRO engagement + END_SCREEN CTAs
 *   • EditorialAssistBlocks (13-15) : assistance éditoriale optionnelle
 *
 * Règles :
 * - Les sections sont fixes et ordonnées par `order`.
 * - `originalText`  = texte brut issu de la segmentation IA (immutable après segmentation).
 * - `editedText`    = version courante éditée par l'utilisateur (null = pas encore touché).
 * - `translatedFR`  = traduction FR non destructive (null = pas encore traduite).
 * - `history`       = pile horodatée de versions antérieures (max 20 par section).
 * - `currentDisplayText()` = helper pour obtenir le texte affiché (editedText ?? originalText).
 */

/* ── Section types ─────────────────────────────────── */

/** Core narrative blocks (1-12) — the actual script + engagement outro + end screen CTAs */
export const CORE_SECTION_TYPES = [
  "hook",
  "context",
  "promise",
  "act1",
  "act2",
  "act2b",
  "act3",
  "climax",
  "insight",
  "conclusion",
  "outro",
  "end_screen",
] as const;

/** Editorial assist blocks (13-15) — optional quality layer */
export const EDITORIAL_SECTION_TYPES = [
  "transitions",
  "style_check",
  "risk_check",
] as const;

/** All 15 section types */
export const SECTION_TYPES = [
  ...CORE_SECTION_TYPES,
  ...EDITORIAL_SECTION_TYPES,
] as const;

export type CoreSectionType = (typeof CORE_SECTION_TYPES)[number];
export type EditorialSectionType = (typeof EDITORIAL_SECTION_TYPES)[number];
export type SectionType = (typeof SECTION_TYPES)[number];

/** Helper to check if a section is editorial */
export function isEditorialSection(type: SectionType): boolean {
  return (EDITORIAL_SECTION_TYPES as readonly string[]).includes(type);
}

/** Tag markers used inside the generated script */
export const SECTION_TAGS: Record<SectionType, string> = {
  hook:         "[[HOOK]]",
  context:      "[[CONTEXT]]",
  promise:      "[[PROMISE]]",
  act1:         "[[ACT1]]",
  act2:         "[[ACT2]]",
  act2b:        "[[ACT2B]]",
  act3:         "[[ACT3]]",
  climax:       "[[CLIMAX]]",
  insight:      "[[INSIGHT]]",
  conclusion:   "[[CONCLUSION]]",
  outro:        "[[OUTRO]]",
  end_screen:   "[[END_SCREEN]]",
  transitions:  "[[TRANSITIONS]]",
  style_check:  "[[STYLE CHECK]]",
  risk_check:   "[[RISK CHECK]]",
};

/* ── Section metadata (labels & icons, display only) ── */

export const SECTION_META: Record<SectionType, { label: string; icon: string; editorial?: boolean }> = {
  hook:         { label: "Hook",                       icon: "🎣" },
  context:      { label: "Context",                    icon: "📖" },
  promise:      { label: "Promise",                    icon: "🎯" },
  act1:         { label: "Act 1 — Setup",              icon: "🏗️" },
  act2:         { label: "Act 2 — Escalade",           icon: "⚡" },
  act2b:        { label: "Act 2B — Contre-point",      icon: "🔀" },
  act3:         { label: "Act 3 — Impact",             icon: "🔥" },
  climax:       { label: "Climax",                     icon: "💡" },
  insight:      { label: "Insight",                    icon: "🧠" },
  conclusion:   { label: "Conclusion",                 icon: "🎬" },
  outro:        { label: "Outro — Engagement",         icon: "💬" },
  end_screen:   { label: "End Screen — CTAs",          icon: "📺" },
  transitions:  { label: "Transitions",                icon: "🔗", editorial: true },
  style_check:  { label: "Style Check",                icon: "🎨", editorial: true },
  risk_check:   { label: "Risk Check",                 icon: "⚠️", editorial: true },
};

/* ── History entry ─────────────────────────────────── */

export interface SectionHistoryEntry {
  /** Snapshot of the text at that point */
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional human-readable label (e.g. "Avant régénération") */
  label?: string;
}

/* ── Single narrative section ──────────────────────── */

export interface CanonicalSection {
  /** Fixed section identifier */
  type: SectionType;
  /** Explicit render order (0-14) */
  order: number;
  /** Original text from AI segmentation (immutable after initial parse) */
  originalText: string;
  /** User-edited text; null means user hasn't manually edited yet */
  editedText: string | null;
  /** French translation; null means not yet translated */
  translatedFR: string | null;
  /** Version history stack (newest first, max 20 entries) */
  history: SectionHistoryEntry[];
}

/* ── Segmentation status ───────────────────────────── */

export type SegmentationStatus =
  | "idle"        // No script yet
  | "pending"     // Segmentation in progress
  | "done"        // Successfully segmented
  | "error";      // Segmentation failed

/* ── Global canonical script ───────────────────────── */

export interface CanonicalScript {
  /** The 15 fixed narrative sections, always ordered by `order` */
  sections: CanonicalSection[];

  /** Full reassembled source text (kept for reference / re-segmentation) */
  sourceFullText: string;

  /** Current segmentation lifecycle */
  segmentationStatus: SegmentationStatus;

  /** ISO 8601 — last time any section was modified */
  lastUpdatedAt: string;

  /**
   * Monotonic counter incremented on every coherence-impacting change
   * (regeneration, restore, structural edit). Used by NarrativeEngine
   * to decide whether transition fixes are needed.
   */
  coherenceVersion: number;
}

/* ── Factory ───────────────────────────────────────── */

/** Create an empty CanonicalScript with all 15 sections initialized */
export function createEmptyCanonicalScript(): CanonicalScript {
  return {
    sections: SECTION_TYPES.map((type, order) => ({
      type,
      order,
      originalText: "",
      editedText: null,
      translatedFR: null,
      history: [],
    })),
    sourceFullText: "",
    segmentationStatus: "idle",
    lastUpdatedAt: new Date().toISOString(),
    coherenceVersion: 0,
  };
}

/* ── Helpers ───────────────────────────────────────── */

/** Get the text currently displayed for a section */
export function getDisplayText(section: CanonicalSection): string {
  return section.editedText ?? section.originalText;
}

/** Reassemble all display texts into a single script string (core blocks only) */
export function reassembleCanonical(cs: CanonicalScript): string {
  return cs.sections
    .filter((s) => !isEditorialSection(s.type))
    .filter((s) => getDisplayText(s).trim())
    .map((s) => getDisplayText(s).trim())
    .join("\n\n");
}

/** Push a history entry to a section (max 20, newest first) */
export function pushHistory(
  section: CanonicalSection,
  label?: string,
): CanonicalSection {
  const text = getDisplayText(section);
  if (!text.trim()) return section;

  // Deduplicate: don't push if identical to most recent
  if (section.history.length > 0 && section.history[0].content === text) {
    return section;
  }

  return {
    ...section,
    history: [
      { content: text, timestamp: new Date().toISOString(), label },
      ...section.history,
    ].slice(0, 20),
  };
}
