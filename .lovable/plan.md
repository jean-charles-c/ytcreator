## Cause

Quand l'objet récurrent est un logo (ex. « Logo Ferrari »), la recherche renvoie des photos de voitures à cause de deux problèmes cumulés dans `search-reference-images-v2` et son appelant `ObjectRegistryPanel.tsx` :

1. **Le `type` déclaré par l'utilisateur n'est jamais envoyé** à l'edge function. Le client (`ObjectRegistryPanel.tsx:604-614`) n'envoie que `nom`, `epoque`, `description`. La fonction redécouvre donc le type via Gemini.
2. **Le type `logo` n'existe pas** dans la fonction. L'union `ObjectType` (`search-reference-images-v2/index.ts:47`) ne contient que `vehicle | person | object | concept | place | event`. Le prompt d'enrichissement (`:196-209`) demande à Gemini de classifier dans cette liste et de produire une requête « real photographs » 3 à 8 mots. Pour « Logo Ferrari », Gemini choisit `vehicle` et renvoie une requête type « Ferrari sports car » → Brave/Wikimedia retournent des photos de voitures, validées comme « Ferrari » par le validateur multimodal qui ne vérifie pas qu'il s'agit du logo et non du produit.

## Correctif

### 1. `src/components/editor/ObjectRegistryPanel.tsx`
Dans `searchReferenceImages` (≈ ligne 604) ajouter `type: obj.type` au body de l'invoke, pour transmettre explicitement le type déclaré (`logo`, `personnage`, `lieu`, `objet`, `véhicule`, etc.).

### 2. `supabase/functions/search-reference-images-v2/index.ts`
- Étendre l'union `ObjectType` avec `"logo"`. Mettre à jour `validTypes` (`:237`).
- Ajouter le `type` côté `ObjectInput` (déjà supporté par `nom/epoque/description`, ajouter `type?: string` en input et le mapper vers `logo` quand le client envoie `logo` / `marque` / `brand`).
- Dans `enrichQuery` (`:192-247`), si `type === "logo"` : court-circuiter Gemini ou contraindre le prompt :
  - Requête forcée du style `"<nom sans le mot 'logo'> logo emblem brand mark transparent png"`.
  - `type` final = `"logo"`.
  - Skipper l'étape Wikidata « instanceOf vehicle » et privilégier Wikimedia Commons + Brave avec le filtre `"logo OR emblem"`.
- Dans `validateImage` (`:249+`), ajouter une consigne au prompt Gemini : pour `type === "logo"`, n'accepter que des images représentant un logo / emblème / marque graphique (icône, monogramme, écusson) sur fond uni ou transparent, **rejeter** toute photographie du produit (voiture, bâtiment, personne) même si elle correspond à la marque.
- Préférer dans le tri final les images PNG transparentes / SVG / petites résolutions carrées pour les logos (bonus `quality_score` quand `mime` = `image/png` ou `image/svg+xml`).

### 3. Cache
Le `cacheKey` (`:542`) est `nom|epoque|description`. Ajouter le `type` à la clé pour éviter de récupérer un ancien cache « voitures » sur une entité désormais typée `logo`. Migration douce : la clé change donc l'ancien cache est invalidé naturellement.

### 4. Aucune migration DB nécessaire
La colonne `type` existe déjà sur les objets récurrents et la `recurring_object_library`.

## Vérification

- Tester avec « Logo Ferrari » / « Logo Porsche » / « Logo Bugatti » (époque vide) → résultats attendus : écussons / emblèmes officiels (Wikimedia), pas de photos de voitures.
- Tester avec un objet non-logo (« Ferrari 250 GTO ») pour vérifier non-régression : photos du véhicule.
- Vérifier les logs `[search-reference-images-v2] response` côté client.

## Hors scope

- Pas de changement du dialogue d'import manuel.
- Pas de refonte du scoring multimodal au-delà de la consigne « logo only ».
- Pas d'ajout de nouveaux types (« marque », « slogan »…) dans l'UI tant que `logo` n'est pas validé.
