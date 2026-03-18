/**
 * ChapterDetection — Détecte automatiquement les chapitres vidéo
 * à partir du CanonicalScript (tags [[HOOK]], [[ACT1]], etc.)
 * ou par fallback sémantique (découpage par paragraphes).
 */

import {
  type CanonicalScript,
  type SectionType,
  SECTION_META,
  getDisplayText,
} from "./canonicalScriptTypes";

/* ── Types ────────────────────────────────────────── */

export interface DetectedChapter {
  /** Unique id (section type or generated) */
  id: string;
  /** Source section type if tag-based, null if semantic */
  sectionType: SectionType | null;
  /** Placeholder label (NOT the SEO title — generated later) */
  label: string;
  /** Raw narration text for this chapter */
  text: string;
  /** Order index (0-based) */
  order: number;
}

export interface ChapterDetectionResult {
  /** Whether detection used canonical tags or semantic fallback */
  method: "tags" | "semantic";
  chapters: DetectedChapter[];
}

/* ── Tag-based detection ──────────────────────────── */

/**
 * Map canonical sections → chapters.
 * Skips empty sections. Merges small adjacent sections
 * only if both are < 80 chars (e.g. short Promise).
 */
function detectFromCanonical(script: CanonicalScript): DetectedChapter[] {
  // Always produce exactly 9 chapters — one per canonical section
  return script.sections.map((section, idx) => {
    const text = getDisplayText(section).trim();
    const meta = SECTION_META[section.type];
    return {
      id: section.type,
      sectionType: section.type,
      label: `${meta.icon} ${meta.label}`,
      text: text || "",
      order: idx,
    };
  });
}

/* ── Semantic fallback ────────────────────────────── */

/**
 * Splits raw text into chapters by double-newline paragraphs.
 * Groups small paragraphs together (min ~200 chars per chapter).
 */
function detectSemantic(rawText: string): DetectedChapter[] {
  const paragraphs = rawText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const MIN_CHAPTER_LENGTH = 200;
  const chapters: DetectedChapter[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    buffer = buffer ? `${buffer}\n\n${para}` : para;

    if (buffer.length >= MIN_CHAPTER_LENGTH) {
      chapters.push({
        id: `ch-${chapters.length}`,
        sectionType: null,
        label: `Chapitre ${chapters.length + 1}`,
        text: buffer,
        order: chapters.length,
      });
      buffer = "";
    }
  }

  // Flush remaining buffer
  if (buffer) {
    if (chapters.length > 0) {
      // Merge into last chapter if too short
      const last = chapters[chapters.length - 1];
      chapters[chapters.length - 1] = {
        ...last,
        text: `${last.text}\n\n${buffer}`,
      };
    } else {
      chapters.push({
        id: "ch-0",
        sectionType: null,
        label: "Chapitre 1",
        text: buffer,
        order: 0,
      });
    }
  }

  return chapters;
}

/* ── Public API ───────────────────────────────────── */

/**
 * Detect chapters from a CanonicalScript (preferred)
 * or from raw narration text (fallback).
 */
export function detectChapters(
  canonicalScript: CanonicalScript | null,
  rawNarration?: string | null
): ChapterDetectionResult {
  // Try tag-based first
  if (canonicalScript) {
    const tagged = detectFromCanonical(canonicalScript);
    if (tagged.length > 0) {
      return { method: "tags", chapters: tagged };
    }
  }

  // Fallback to semantic
  if (rawNarration?.trim()) {
    return { method: "semantic", chapters: detectSemantic(rawNarration) };
  }

  return { method: "semantic", chapters: [] };
}
