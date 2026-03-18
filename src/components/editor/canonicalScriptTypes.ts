/**
 * CanonicalScript — Modèle de données stable pour un script narratif
 * segmenté, versionnable et traduisible.
 *
 * Règles :
 * - Les 7 sections sont fixes et ordonnées par `order`.
 * - `originalText`  = texte brut issu de la segmentation IA (immutable après segmentation).
 * - `editedText`    = version courante éditée par l'utilisateur (null = pas encore touché).
 * - `translatedFR`  = traduction FR non destructive (null = pas encore traduite).
 * - `history`       = pile horodatée de versions antérieures (max 20 par section).
 * - `currentDisplayText()` = helper pour obtenir le texte affiché (editedText ?? originalText).
 */

/* ── Section types (enum-like) ─────────────────────── */

export const SECTION_TYPES = [
  "hook",
  "context",
  "promise",
  "act1",
  "act2",
  "act3",
  "climax",
  "insight",
  "conclusion",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/** Tag markers used inside the generated script */
export const SECTION_TAGS: Record<SectionType, string> = {
  hook:       "[[HOOK]]",
  context:    "[[CONTEXT]]",
  promise:    "[[PROMISE]]",
  act1:       "[[ACT1]]",
  act2:       "[[ACT2]]",
  act3:       "[[ACT3]]",
  climax:     "[[CLIMAX]]",
  insight:    "[[INSIGHT]]",
  conclusion: "[[CONCLUSION]]",
};

/* ── Section metadata (labels & icons, display only) ── */

export const SECTION_META: Record<SectionType, { label: string; icon: string }> = {
  hook:       { label: "Hook",                icon: "🎣" },
  context:    { label: "Context",             icon: "📖" },
  promise:    { label: "Promise",             icon: "🎯" },
  act1:       { label: "Act 1 — Setup",       icon: "🏗️" },
  act2:       { label: "Act 2 — Escalade",    icon: "⚡" },
  act3:       { label: "Act 3 — Impact",      icon: "🔥" },
  climax:     { label: "Climax",              icon: "💡" },
  insight:    { label: "Insight",             icon: "🧠" },
  conclusion: { label: "Conclusion",          icon: "🎬" },
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
  /** Explicit render order (0-6) */
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
  /** The 7 fixed narrative sections, always ordered by `order` */
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

/** Create an empty CanonicalScript with all 7 sections initialized */
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

/** Reassemble all display texts into a single script string */
export function reassembleCanonical(cs: CanonicalScript): string {
  return cs.sections
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
