/**
 * ChapterDetection — Détecte automatiquement les chapitres vidéo
 * à partir du CanonicalScript (tags [[HOOK]], [[ACT1]], etc.)
 * ou par parsing des tags dans le texte brut.
 * Toujours exactement 9 chapitres (1 par section canonique).
 */

import {
  type CanonicalScript,
  type SectionType,
  SECTION_META,
  SECTION_TYPES,
  getDisplayText,
} from "./canonicalScriptTypes";
import { parseTaggedScript } from "./tagParser";

/* ── Types ────────────────────────────────────────── */

export interface DetectedChapter {
  id: string;
  sectionType: SectionType | null;
  label: string;
  text: string;
  order: number;
}

export interface ChapterDetectionResult {
  method: "tags" | "semantic";
  chapters: DetectedChapter[];
}

/* ── Tag-based detection from CanonicalScript ─────── */

function detectFromCanonical(script: CanonicalScript): DetectedChapter[] {
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

/* ── Tag-based detection from raw text ────────────── */

function detectFromRawTags(rawText: string): DetectedChapter[] {
  const parsed = parseTaggedScript(rawText);
  if (!parsed.tagged) return [];

  return parsed.sections.map((ps, idx) => {
    const meta = SECTION_META[ps.key];
    return {
      id: ps.key,
      sectionType: ps.key,
      label: `${meta.icon} ${meta.label}`,
      text: ps.content.trim(),
      order: idx,
    };
  });
}

/* ── Public API ───────────────────────────────────── */

export function detectChapters(
  canonicalScript: CanonicalScript | null,
  rawNarration?: string | null
): ChapterDetectionResult {
  // Try canonical script first
  if (canonicalScript) {
    return { method: "tags", chapters: detectFromCanonical(canonicalScript) };
  }

  // Try parsing tags from raw narration
  if (rawNarration?.trim()) {
    const fromTags = detectFromRawTags(rawNarration);
    if (fromTags.length > 0) {
      return { method: "tags", chapters: fromTags };
    }
  }

  // Fallback: empty 9 sections
  return {
    method: "tags",
    chapters: SECTION_TYPES.map((type, idx) => {
      const meta = SECTION_META[type];
      return {
        id: type,
        sectionType: type,
        label: `${meta.icon} ${meta.label}`,
        text: "",
        order: idx,
      };
    }),
  };
}
