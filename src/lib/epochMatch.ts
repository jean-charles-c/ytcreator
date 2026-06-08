/**
 * Normalisation et scoring de compatibilité d'époque entre deux entrées
 * de la bibliothèque d'objets/personnages/lieux récurrents.
 *
 * Utilisé pour décider si on importe automatiquement les visuels de
 * référence d'une entité homonyme déjà connue de l'utilisateur, en
 * évitant les anachronismes (ex. même voiture mais 1955 vs 2020).
 */

export type NormalizedEpoch = {
  raw: string;
  years: number[]; // années pivots extraites, triées asc
  era: "antiquite" | "moyen_age" | "renaissance" | "moderne" | "contemporain" | null;
  empty: boolean;
};

const ERA_KEYWORDS: Array<[NormalizedEpoch["era"], RegExp]> = [
  ["antiquite", /\b(antiquit[eé]|antique|romain|grec ancien|[eé]gypte ancienne)\b/i],
  ["moyen_age", /\b(moyen[ -]?[aâ]ge|m[eé]di[eé]val|f[eé]odal)\b/i],
  ["renaissance", /\b(renaissance|xv[ie]+e? si[eè]cle|xvii[e]? si[eè]cle)\b/i],
  ["moderne", /\b(moderne|industriel|xviii[e]? si[eè]cle|xix[e]? si[eè]cle)\b/i],
  ["contemporain", /\b(contemporain|actuel|aujourd[' ]?hui|moderne[- ]jour|pr[eé]sent)\b/i],
];

const ERA_TO_YEAR_RANGE: Record<NonNullable<NormalizedEpoch["era"]>, [number, number]> = {
  antiquite: [-800, 476],
  moyen_age: [476, 1492],
  renaissance: [1400, 1650],
  moderne: [1650, 1900],
  contemporain: [1900, 2100],
};

const CENTURY_MAP: Array<[RegExp, number]> = [
  [/\bxix\s*[eè]?\s*si[eè]cle\b/i, 1850],
  [/\bxx\s*[eè]?\s*si[eè]cle\b/i, 1950],
  [/\bxxi\s*[eè]?\s*si[eè]cle\b/i, 2050],
  [/\bxviii\s*[eè]?\s*si[eè]cle\b/i, 1750],
  [/\bxvii\s*[eè]?\s*si[eè]cle\b/i, 1650],
  [/\bxvi\s*[eè]?\s*si[eè]cle\b/i, 1550],
];

/**
 * Extrait toutes les années pivots d'une chaîne d'époque libre en
 * français ou anglais. Gère :
 *  - années exactes 1500-2099
 *  - décennies "années 1950", "années 50", "1950s"
 *  - siècles romains (XVIᵉ → XXIᵉ) approximés au milieu de siècle
 *  - mots-clés d'ère (moderne, contemporain, etc.)
 */
export function normalizeEpoch(input: string | null | undefined): NormalizedEpoch {
  const raw = (input ?? "").trim();
  if (!raw) return { raw: "", years: [], era: null, empty: true };

  const years = new Set<number>();

  // Années 4 chiffres entre 1500 et 2099.
  for (const m of raw.matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)) {
    years.add(parseInt(m[1], 10));
  }

  // Décennies "années 50", "années 1950", "1950s", "50s".
  for (const m of raw.matchAll(/ann[eé]es\s+(\d{2,4})/gi)) {
    let y = parseInt(m[1], 10);
    if (y < 100) y = y >= 30 ? 1900 + y : 2000 + y;
    years.add(y + 5); // milieu de décennie
  }
  for (const m of raw.matchAll(/\b(\d{2,4})s\b/g)) {
    let y = parseInt(m[1], 10);
    if (y < 100) y = y >= 30 ? 1900 + y : 2000 + y;
    years.add(y + 5);
  }

  // Siècles romains.
  for (const [re, mid] of CENTURY_MAP) {
    if (re.test(raw)) years.add(mid);
  }

  // Ère textuelle.
  let era: NormalizedEpoch["era"] = null;
  for (const [tag, re] of ERA_KEYWORDS) {
    if (re.test(raw)) { era = tag; break; }
  }
  if (era && years.size === 0) {
    const [lo, hi] = ERA_TO_YEAR_RANGE[era];
    years.add(Math.round((lo + hi) / 2));
  }

  return {
    raw,
    years: Array.from(years).sort((a, b) => a - b),
    era,
    empty: false,
  };
}

/** Tolérance par défaut pour considérer deux époques "proches". */
export const EPOCH_NEAR_TOLERANCE_YEARS = 25;

export type EpochScore = 0 | 60 | 100;

/**
 * Compare deux époques et retourne :
 *  - 100 si match parfait (identique après normalisation, ou l'une est vide)
 *  - 60  si les périodes se chevauchent dans une fenêtre de tolérance
 *  - 0   si les époques sont explicites et incompatibles
 */
export function scoreEpochCompatibility(
  a: string | null | undefined,
  b: string | null | undefined,
  tolerance: number = EPOCH_NEAR_TOLERANCE_YEARS,
): EpochScore {
  const na = normalizeEpoch(a);
  const nb = normalizeEpoch(b);

  if (na.empty || nb.empty) return 100;
  if (na.raw.toLowerCase() === nb.raw.toLowerCase()) return 100;
  if (na.era && nb.era && na.era === nb.era && na.years.length === 0 && nb.years.length === 0) {
    return 100;
  }

  if (na.years.length === 0 || nb.years.length === 0) {
    // Une époque sans année explicite : on accorde "proche" si les ères
    // sont compatibles, sinon on retombe sur match parfait par défaut.
    if (na.era && nb.era) return na.era === nb.era ? 100 : 0;
    return 100;
  }

  // Distance minimale entre les années pivots de chaque côté.
  let minDist = Number.POSITIVE_INFINITY;
  for (const ya of na.years) {
    for (const yb of nb.years) {
      const d = Math.abs(ya - yb);
      if (d < minDist) minDist = d;
    }
  }

  if (minDist <= tolerance) return 100;
  if (minDist <= tolerance * 3) return 60; // ~75 ans = même demi-siècle
  return 0;
}