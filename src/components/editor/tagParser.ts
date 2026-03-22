/**
 * TagParser — Deterministic parser for [[TAG]]-structured scripts.
 * No AI, no interpretation. Pure regex extraction.
 */

import { SECTION_TYPES, type SectionType, SECTION_TAGS } from "./canonicalScriptTypes";

export interface ParsedSection {
  key: SectionType;
  content: string;
}

export interface TagParseResult {
  /** Whether [[TAG]] markers were found and used */
  tagged: boolean;
  /** 13 sections in canonical order, empty string if missing */
  sections: ParsedSection[];
  /** Keys of sections that had no content */
  emptySections: SectionType[];
  /** Any text found before the first tag (should be empty) */
  preamble: string;
}

/** Ordered tag keys for regex — handles space-separated tags like STYLE CHECK */
const TAG_PATTERNS = SECTION_TYPES.map((t) => {
  const tag = SECTION_TAGS[t];
  // Extract inner content between [[ and ]]
  return tag.slice(2, -2);
});
const TAG_REGEX = new RegExp(
  `\\[\\[(${TAG_PATTERNS.map(p => p.replace(/\s+/g, "\\s+")).join("|")})\\]\\]`,
  "gi"
);

/**
 * Parse a tagged script into 9 canonical sections.
 * - Deterministic: regex only, zero AI.
 * - Strips tags from content.
 * - Preserves all text between tags verbatim.
 * - Also strips residual `<plan>...</plan>` blocks.
 */
export function parseTaggedScript(raw: string): TagParseResult {
  if (!raw || !raw.trim()) {
    return {
      tagged: false,
      sections: SECTION_TYPES.map((key) => ({ key, content: "" })),
      emptySections: [...SECTION_TYPES],
      preamble: "",
    };
  }

  // Strip <plan>...</plan> block if present
  const cleaned = raw.replace(/<plan>[\s\S]*?<\/plan>/gi, "").trim();

  // Find all [[TAG]] matches
  const matches = [...cleaned.matchAll(TAG_REGEX)];

  if (matches.length === 0) {
    return {
      tagged: false,
      sections: SECTION_TYPES.map((key) => ({ key, content: "" })),
      emptySections: [...SECTION_TYPES],
      preamble: cleaned,
    };
  }

  // Extract preamble (text before first tag)
  const preamble = cleaned.slice(0, matches[0].index!).trim();

  // Extract content between consecutive tags
  const extracted = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const tagKey = matches[i][1].toLowerCase();
    const contentStart = matches[i].index! + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index! : cleaned.length;
    const content = cleaned.slice(contentStart, contentEnd).trim();

    // If duplicate tag, append (shouldn't happen but defensive)
    if (extracted.has(tagKey)) {
      extracted.set(tagKey, extracted.get(tagKey)! + "\n\n" + content);
    } else {
      extracted.set(tagKey, content);
    }
  }

  // Build ordered sections
  const emptySections: SectionType[] = [];
  const sections: ParsedSection[] = SECTION_TYPES.map((key) => {
    const content = extracted.get(key) || "";
    if (!content.trim()) emptySections.push(key);
    return { key, content };
  });

  return {
    tagged: matches.length > 0,
    sections,
    emptySections,
    preamble,
  };
}

/**
 * Reassemble parsed sections into a single clean script (no tags).
 */
export function reassembleFromParsed(sections: ParsedSection[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => s.content.trim())
    .join("\n\n");
}

/**
 * Reassemble with tags (for storage/re-export).
 */
export function reassembleWithTags(sections: ParsedSection[]): string {
  return sections
    .map((s) => `${SECTION_TAGS[s.key]}\n${s.content}`)
    .join("\n\n");
}
