## Constat

Aujourd'hui dans le tab Segmentation, lorsque l'IA détecte automatiquement un nouvel objet, personnage ou lieu récurrent, il est créé avec une description et une époque mais sans visuels de référence. L'utilisateur doit ouvrir le dialogue "Importer" pour récupérer manuellement les images d'un projet précédent.

La bibliothèque `recurring_object_library` (per-user, clé unique `user_id + nom + type`) stocke déjà chaque entité avec ses `reference_images`, son `epoque` et son `identity_prompt`. On peut donc faire un rapprochement automatique au moment de la détection.

## Objectif

Quand la détection auto produit une nouvelle entité, vérifier instantanément si elle existe déjà dans la bibliothèque personnelle. Si une correspondance fiable est trouvée, importer automatiquement ses `reference_images` et son `identity_prompt`, en gérant correctement les époques pour éviter les anachronismes (ex. même voiture, mais 1955 vs réédition 2020).

## Règles de correspondance (par ordre décroissant)

Pour chaque entité détectée avec un `nom`, un `type` et une `epoque` :

1. Recherche en base : `SELECT … FROM recurring_object_library WHERE user_id = auth.uid() AND type = <type> AND lower(unaccent(nom)) = lower(unaccent(<nom>))` et `reference_images` non vide.
2. Sur les candidats trouvés, scorer la compatibilité d'époque :
   - **Match parfait** : époque identique (string égale après normalisation) ou les deux époques vides ou la nouvelle entité sans époque → score 100.
   - **Match large** : même siècle ou décennies se chevauchant (parsing souple : "années 1950", "1950s", "1955", "milieu XXᵉ", "moderne/contemporain", etc.) → score 60.
   - **Conflit** : époques explicites et incompatibles (ex. "1920" vs "2020") → score 0, **ne PAS importer les images**.
3. Décision :
   - Score ≥ 100 → import silencieux (images + `identity_prompt` + `description_visuelle` si vide côté nouveau).
   - Score 60 → import images mais badge "Bibliothèque (époque proche)" sur la card + toast récapitulatif.
   - Score 0 → aucun import d'images ; on signale dans la card un lien "Variante d'époque détectée dans la bibliothèque, vérifier" qui ouvre l'éditeur sur l'entrée existante (pour décider manuellement).

L'utilisateur conserve toujours la possibilité de retirer les images importées (la mécanique existe déjà).

## Modifications

### 1. Nouvel utilitaire `src/lib/epochMatch.ts`
- `normalizeEpoch(input: string): { years: number[]; era?: "modern" | "contemporary" | "antique" | null; raw: string }` qui extrait jusqu'à deux années pivots et un tag d'ère depuis du français libre.
- `scoreEpochCompatibility(a, b): 0 | 60 | 100` selon les règles ci-dessus (chevauchement, tolérance de 25 ans pour "match large").
- Tests unitaires légers via vitest sur quelques cas typiques (vide, "1955", "années 50", "moderne", "XIXᵉ siècle", "2020", deux décennies différentes).

### 2. Nouvelle edge function `auto-import-library-refs`
- Input : `{ entities: { nom: string; type: string; epoque: string }[] }`.
- Pour chaque entité, exécute la recherche décrite + scoring d'époque côté serveur (réutilise les utilitaires partagés via un copie sous `supabase/functions/_shared/epoch-match.ts`).
- Output : `{ matches: { nom; type; epoque_request; library_entry: { reference_images; identity_prompt; description_visuelle; epoque }; score: 100|60|0 }[] }`.
- Validation Zod du body, `verify_jwt = true` (cible la ligne user via `auth.uid()` côté postgres via le client supabase serveur authentifié).

### 3. Hook côté `ObjectRegistryPanel.tsx`
- Nouveau `useEffect` qui écoute la liste `objects`. Quand une entité passe d'inexistante (pas vue auparavant) à présente AVEC `reference_images` vide, l'ajouter à une file et appeler la nouvelle fonction par lots de 10.
- Pour chaque match retourné :
  - score 100 ou 60 → `updateObject(id, { reference_images, identity_prompt: ...si vide, description_visuelle: si vide })`, marquer l'objet avec un flag transitoire `_autoImported: "exact" | "approx"` pour affichage UI.
  - score 0 et candidat trouvé → marquer `_libraryEpochConflict: { epoque_library }` pour afficher un avertissement dans la card.
- Toast récapitulatif global : "X entité(s) enrichie(s) depuis la bibliothèque ; Y conflit(s) d'époque à vérifier".
- Garde une `Set<string>` (clé `nom|type|epoque`) déjà traitée pour éviter de rappeler la fonction à chaque re-render.

### 4. UI sur la card d'objet
- Badge discret sous le nom :
  - "Importé auto (bibliothèque)" — vert — pour score 100.
  - "Bibliothèque (époque proche)" — ambre — pour score 60.
  - "Conflit d'époque" — rouge cliquable — pour score 0 (ouvre un mini-popover montrant l'époque de la bibliothèque vs celle détectée).
- Ces badges disparaissent dès que l'utilisateur modifie manuellement l'objet ou ses images.

### 5. Aucun changement de schéma DB
- La table `recurring_object_library` reste inchangée. La gestion fine "même nom mais époques différentes" se fait côté logique applicative ; on ne fragmente pas l'unicité pour ne pas casser l'auto-save existant.
- Si plus tard l'utilisateur veut conserver deux variantes d'époque pour un même nom, on ajoutera une migration séparée (non incluse dans ce plan).

## Détails techniques

- Normalisation d'époque : regex `/\b(1[5-9]\d{2}|20\d{2})\b/g` pour les années, regex pour décennies "années (19)?\d{2}", mappings ères ("antiquité", "moyen âge", "renaissance", "moderne", "contemporain"). Fenêtre de tolérance configurable (constante 25 ans).
- L'auto-import respecte la convention : on n'écrase JAMAIS un champ déjà rempli (description, identity_prompt, images) — on ne fait qu'ajouter.
- La typographie française imposée par les memos est respectée dans les toasts et badges (espace insécable avant `?`/`!`, pas de `:` ni `*` ni tirets longs).
- Aucune régression sur le flux manuel existant (dialogue Import) ; il reste accessible et utile pour des entités à nom différent ou pour réimporter explicitement.
- Performance : recherche limitée aux entrées avec `reference_images` non vides, indexée sur `(user_id, nom, type)` (index déjà présent via la contrainte UNIQUE).
