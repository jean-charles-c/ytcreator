/**
 * ChapterTypes — Modèle de données pour les chapitres vidéo SEO.
 * Stocké en JSON dans project_scriptcreator_state (pas de table dédiée).
 */

import type { SectionType } from "./canonicalScriptTypes";

/* ── Title variant ────────────────────────────────── */

export interface ChapterTitleVariant {
  /** Unique id */
  id: string;
  /** Generated title text */
  title: string;
  /** Hook style: curiosity, dramatic, superlative, question, reveal */
  hookType: string;
  /** Whether user selected this variant as active */
  selected: boolean;
}

/* ── Single chapter ───────────────────────────────── */

export interface Chapter {
  /** Unique id (matches DetectedChapter.id) */
  id: string;
  /** Display order (0-based) */
  index: number;
  /** Source section type if tag-based, null if semantic */
  sectionType: SectionType | null;
  /** First sentence or phrase of the chapter (anchor text) */
  startSentence: string;
  /** Brief summary of the chapter content */
  summary: string;
  /** Current active title (user-edited or selected variant) */
  title: string;
  /** Generated title variants */
  variants: ChapterTitleVariant[];
  /** French translation of title (null if already FR or not yet translated) */
  titleFR: string | null;
  /** User validated this chapter */
  validated: boolean;
  /** Raw narration text for this chapter */
  sourceText: string;
}

/* ── Chapter list state ───────────────────────────── */

export interface ChapterListState {
  /** All detected chapters */
  chapters: Chapter[];
  /** Detection method used */
  method: "tags" | "semantic";
  /** ISO 8601 — last update */
  lastUpdatedAt: string;
}

/* ── Factory ──────────────────────────────────────── */

export function createEmptyChapterListState(): ChapterListState {
  return {
    chapters: [],
    method: "tags",
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Build a Chapter from a DetectedChapter (chapterDetection.ts output).
 */
export function chapterFromDetected(detected: {
  id: string;
  sectionType: SectionType | null;
  label: string;
  text: string;
  order: number;
}): Chapter {
  const firstSentence = detected.text.split(/[.!?]\s/)[0]?.trim() || "";
  return {
    id: detected.id,
    index: detected.order,
    sectionType: detected.sectionType,
    startSentence: firstSentence.slice(0, 120),
    summary: "",
    title: detected.label,
    variants: [],
    titleFR: null,
    validated: false,
    sourceText: detected.text,
  };
}
