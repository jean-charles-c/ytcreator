/**
 * xmlReferenceScanner.ts — XmlReferenceScanner
 *
 * Scans generated XML for all file/media references and classifies them
 * by clip context (Fusion Title vs normal video clip).
 * Does NOT block or modify — purely diagnostic.
 */

export interface XmlReference {
  /** The XML tag name where the reference was found */
  tag: string;
  /** The text content or attribute value */
  value: string;
  /** The clipitem id containing this reference */
  clipItemId: string;
  /** Whether this clipitem is a Fusion Title */
  isFusionTitle: boolean;
  /** Track context (V1, V2, audio, etc.) — best effort */
  track: string;
  /** Approximate XPath-like location */
  xmlPath: string;
}

export interface ScanResult {
  /** All detected references */
  references: XmlReference[];
  /** References inside Fusion Title clips only */
  fusionTitleRefs: XmlReference[];
  /** References inside normal video clips only */
  normalClipRefs: XmlReference[];
}

/**
 * Tags that can indicate a file/media/path reference inside a clipitem.
 */
const REFERENCE_TAGS = [
  "pathurl",
  "stillframe",
  "media",
  "video",
  "masterclipid",
  "anamorphic",
  "sourcetrack",
  "pixelaspectratio",
  "samplecharacteristics",
  "reel",
] as const;

/**
 * Extract all clipitem blocks from the XML with their track context.
 */
function extractClipBlocks(xml: string): { block: string; track: string }[] {
  const results: { block: string; track: string }[] = [];

  // Identify track boundaries to assign V1, V2, etc.
  const trackRegex = /<track>([\s\S]*?)<\/track>/g;
  let trackMatch: RegExpExecArray | null;
  let trackIndex = 0;

  while ((trackMatch = trackRegex.exec(xml)) !== null) {
    trackIndex++;
    const trackContent = trackMatch[1];
    const trackLabel = `V${trackIndex}`;

    // Extract clipitems within this track
    const clipRegex = /<clipitem\s+id="([^"]*)">([\s\S]*?)<\/clipitem>/g;
    let clipMatch: RegExpExecArray | null;
    while ((clipMatch = clipRegex.exec(trackContent)) !== null) {
      results.push({ block: clipMatch[0], track: trackLabel });
    }
  }

  return results;
}

/**
 * Scan a single clipitem block for reference tags.
 */
function scanClipBlock(
  block: string,
  track: string
): XmlReference[] {
  const refs: XmlReference[] = [];

  // Extract clipitem id
  const idMatch = block.match(/^<clipitem\s+id="([^"]*)"/);
  const clipItemId = idMatch ? idMatch[1] : "unknown";
  const isFusionTitle = clipItemId.startsWith("Fusion Title");

  // For each reference tag, check presence
  for (const tag of REFERENCE_TAGS) {
    // Match opening tags (could be self-closing or have content)
    const tagRegex = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>|<${tag}([^/]*?)\\/>`, "g");
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(block)) !== null) {
      const value = (match[2] || "").trim().substring(0, 200); // cap length
      refs.push({
        tag,
        value,
        clipItemId,
        isFusionTitle,
        track,
        xmlPath: `${track}/clipitem[@id="${clipItemId}"]/${tag}`,
      });
    }
  }

  // Special scan for <file> blocks that contain a pathurl (nested reference)
  const fileBlockRegex = /<file\s+id="([^"]*)">([\s\S]*?)<\/file>/g;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = fileBlockRegex.exec(block)) !== null) {
    const fileId = fileMatch[1];
    const fileContent = fileMatch[2];

    // Check for pathurl inside file block
    const pathMatch = fileContent.match(/<pathurl>([^<]*)<\/pathurl>/);
    if (pathMatch) {
      refs.push({
        tag: "pathurl",
        value: pathMatch[1],
        clipItemId,
        isFusionTitle,
        track,
        xmlPath: `${track}/clipitem[@id="${clipItemId}"]/file[@id="${fileId}"]/pathurl`,
      });
    }
  }

  return refs;
}

/**
 * Scan the entire XML string and return all detected references.
 */
export function scanXmlReferences(xml: string): ScanResult {
  const clipBlocks = extractClipBlocks(xml);
  const allRefs: XmlReference[] = [];

  for (const { block, track } of clipBlocks) {
    const refs = scanClipBlock(block, track);
    allRefs.push(...refs);
  }

  return {
    references: allRefs,
    fusionTitleRefs: allRefs.filter((r) => r.isFusionTitle),
    normalClipRefs: allRefs.filter((r) => !r.isFusionTitle),
  };
}
