

# Validation de match Whisper par ratio dynamique

## Problème actuel
Le statut vert ("ok") est attribué dès qu'un match de 2 ou 3 mots est trouvé, sans vérifier que le reste des mots du shot correspondent aussi. Un shot de 20 mots avec seulement 2 mots matchés apparaît en vert.

## Nouvelle règle
- Shots de **4 mots ou plus** : au moins **80%** des mots doivent être confirmés dans les mots Whisper à partir du point d'ancrage
- Shots de **moins de 4 mots** : **100%** des mots doivent correspondre
- Si le ratio est insuffisant → statut **"estimated"** (orange) au lieu de "ok" (vert)

## Changements

### 1. `whisperTextMatcher.ts` — Ajouter une validation de couverture post-match

Après avoir trouvé un point d'ancrage (ligne 173), comparer **tous** les mots normalisés du shot avec les mots Whisper à partir de `foundIdx`. Compter combien correspondent (dans l'ordre, tolérance sur la ponctuation). Stocker ce ratio dans un nouveau champ `coverageRatio` dans `StrictMatchResult`.

```typescript
export interface StrictMatchResult {
  shotId: string;
  whisperStartIdx: number | null;
  matchedWords: number;
  blocked: boolean;
  coverageRatio: number; // 0.0 à 1.0 — nouveau champ
}
```

Logique de calcul :
```
allShotWords = norm(shot.text).split → tous les mots
whisperSlice = whisperWords[foundIdx ... foundIdx + allShotWords.length]
confirmedCount = nombre de mots identiques (comparaison séquentielle)
coverageRatio = confirmedCount / allShotWords.length
```

### 2. `WhisperAlignmentEditor.tsx` — Utiliser `coverageRatio` pour le statut

Aux ~4 endroits où le statut est déterminé (lignes 304, 455, 738, 962), remplacer :
```typescript
// Avant
status = "ok";

// Après
const wordCount = shotText.split(/\s+/).filter(w => w.length > 0).length;
const requiredRatio = wordCount < 4 ? 1.0 : 0.8;
status = (matchResult.coverageRatio >= requiredRatio) ? "ok" : "estimated";
```

### 3. Tests — `whisperTextMatcher.test.ts`

Ajouter des tests pour vérifier :
- Un shot de 10 mots avec 9/10 confirmés → `coverageRatio = 0.9` → vert
- Un shot de 5 mots avec 3/5 confirmés → `coverageRatio = 0.6` → orange
- Un shot de 3 mots avec 3/3 confirmés → `coverageRatio = 1.0` → vert
- Un shot de 3 mots avec 2/3 confirmés → `coverageRatio = 0.67` → orange

## Résumé
| Fichier | Modification |
|---------|-------------|
| `whisperTextMatcher.ts` | Ajout champ `coverageRatio` + calcul post-match |
| `WhisperAlignmentEditor.tsx` | Statut basé sur le ratio dynamique (4 endroits) |
| `whisperTextMatcher.test.ts` | Tests du ratio de couverture |

