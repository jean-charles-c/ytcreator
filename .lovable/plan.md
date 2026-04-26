## Problème

Le shot 23 (scène 4, shot 1) — *"Cette nuit-là, l'épuisement fait place à une lucidité froide."* — est généré comme un chibi-cartoon en plein jour tenant un parchemin "La Fiche Technique" devant une usine. La narration est ignorée.

## Cause racine (confirmée en DB)

Dans `supabase/functions/generate-storyboard/index.ts` (lignes 1346-1397, post-process "inject identity lock prefixes"), la logique d'injection des Identity Lock d'objets récurrents est cassée à trois niveaux :

### Bug 1 — Matching naïf qui matche tout
```ts
const objName = (obj.nom || "").toLowerCase();           // "la fiche technique"
return fragmentLower.includes(objName.split(" ")[0]);    // → cherche "la" partout
```
"La Fiche Technique" → `split(" ")[0]` = **"la"** (mot vide français). Tous les fragments contenant "la", "là", "l'a"… déclenchent un match. Donc l'Identity Lock est injecté sur **tous les shots** de la scène 4 (et 5, 9, 12, 16), pas seulement ceux qui parlent réellement de la fiche.

### Bug 2 — Le lock est préfixé en tête du prompt
```ts
promptExport = lockPrefix + promptExport;   // ← tête du prompt
```
Gemini lit en premier "Subject: La Fiche Technique Transition de l'artisanat vers l'industrie", "OBJECT IDENTITY LOCK", "VERSION / TIME PERIOD LOCK"… ≈1100 caractères avant le style et la description visuelle réelle. Résultat : la fiche devient le sujet centré, son nom est rendu en texte sur un parchemin, et "Transition de l'artisanat vers l'industrie" devient un décor d'usine. La description narrative (nuit, chef accoudé, lumière froide) passe au second plan.

### Bug 3 — `mentions_shots` (source de vérité explicite) ignoré
Le registre stocke `mentions_shots: [<uuid>, <uuid>...]` — la liste exacte des shots où l'objet apparaît, calculée par `detect-object-shots`. Le post-process l'ignore et refait un matching textuel approximatif. Pour la scène 4, la Fiche est mentionnée dans 5 shots précis ; le post-process l'injecte dans les 7.

Le même bug existe aussi dans `generate-shot-image/index.ts` lignes 388-395, mais là `mentions_shots` est déjà utilisé correctement — sauf que `prompt_export` est déjà pollué en amont par le post-process du storyboard, donc l'identity lock se retrouve quand même dans le prompt final.

## Correctifs

### 1. `generate-storyboard/index.ts` — réécrire le post-process d'injection (lignes 1346-1397)

- **Source de vérité = `mentions_shots`** : un Identity Lock d'objet n'est injecté QUE si le shot courant figure dans `obj.mentions_shots` (matching par UUID, déterministe).
- **Fallback textuel strict** quand `mentions_shots` est vide : matcher sur le nom complet de l'objet (sans articles français), pas sur le premier mot. Skip les mots-vides ("la", "le", "les", "l'", "un", "une", "des", "du", "de").
- **Position du lock = APRÈS la description, pas en tête**. Le prompt narratif reste le sujet dominant ; l'identity lock est ajouté comme contrainte de fidélité visuelle, pas comme sujet.
- **Format condensé** : ne pas réinjecter le bloc OBJECT IDENTITY LOCK complet (déjà fait par `generate-shot-image`). Un rappel court suffit dans `prompt_export` (ex: `Recurring object reference: ${obj.nom} — preserve exact identity if present in frame.`).

### 2. `generate-shot-image/index.ts` & `generate-shot-image-kie/index.ts` — détection d'objet absent

Ajouter une vérification : si l'`identity_prompt` complet est déjà préfixé en tête du `prompt_export` (cas hérité) **et** que le shot ne mentionne pas l'objet dans son contenu narratif, supprimer le préfixe avant l'envoi à Gemini. Le matching `mentions_shots` reste prioritaire pour décider d'injecter ou non.

### 3. Migration de réparation (one-shot SQL)

Les `prompt_export` déjà pollués en DB gardent l'OBJECT IDENTITY LOCK en tête. Migration pour nettoyer rétroactivement les prompts de la scène 4 (et toute scène listant la Fiche Technique) :

- Pour chaque shot dont `prompt_export` commence par `OBJECT IDENTITY LOCK:` ET qui n'est pas dans `mentions_shots` du registre, retirer le préfixe jusqu'au premier `Style :` ou jusqu'au début de la description narrative.

## Résultat attendu

- Shot 23 régénéré : cuisine nocturne vide, lumière bleutée, chef accoudé épuisé, **sans** parchemin centré ni texte rendu.
- Les autres shots de la scène 4 qui parlent réellement de la fiche (shots 5, 6, 7) gardent l'Identity Lock — mais positionné après la description, donc la fiche apparaît comme **objet dans la scène**, pas comme **sujet centré avec son nom écrit dessus**.
- Plus d'erreurs Gemini "Prohibited Use" sur la scène 4 (le texte "La Fiche Technique" n'est plus poussé dans le prompt).

## Fichiers modifiés

- `supabase/functions/generate-storyboard/index.ts` (post-process lignes 1346-1397)
- `supabase/functions/generate-shot-image/index.ts` (sanity-check pré-Gemini)
- `supabase/functions/generate-shot-image-kie/index.ts` (idem)
- Migration SQL one-shot pour nettoyer les `prompt_export` pollués existants
