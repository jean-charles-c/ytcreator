# Fix — Description corrompue + visuels identiques (même bug racine)

## Symptômes observés

1. La `description` des shots 11/12/13/14/16/17/22 contient un copier-coller tronqué du `prompt_export` (préambule de style + IDENTITY LOCK en anglais), au lieu d'une vraie description visuelle française.
2. Les images Kie générées pour ces 7 shots sont quasi identiques.

## Cause racine commune

Ces shots ont été générés **avant** la refacto du système d'IDENTITY LOCK. Leur `prompt_export` en DB contient encore l'ancien format verbeux : 4 blocs IDENTITY LOCK collés en plein milieu du prompt (≈ 1600 caractères de boilerplate), répétés à chaque shot de la scène 2.

Deux conséquences :

- **`description` corrompue** : dans `generate-storyboard/index.ts` (branche `prompt_only`, ~ligne 1140), quand l'IA ne renvoie pas de `description` propre, le code prend `prompt_export.slice(0, 500)` comme fallback. Les 500 premiers caractères tombent au milieu d'un IDENTITY LOCK.
- **Strip à la volée inopérant** : `stripLegacyIdentityLockPrefix` (utilisé par `generate-shot-image-kie/index.ts` ligne 582) a un regex ancré au début (`/^\s*(?:CHARACTER|...)/`). Or les anciens prompts commencent par `"Style :"`, et les locks verbeux sont au milieu. Le strip ne fait rien → Kie reçoit les 4 vieux locks + les nouveaux SUBJECT IDENTITY ANCHORS condensés rajoutés par-dessus → fragment narratif noyé → tous les shots convergent vers la même Diablo GT générique.

## Corrections à apporter

### 1. Étendre le strip pour traiter les locks au milieu du prompt
Fichier : `supabase/functions/_shared/identity-lock-utils.ts`

Ajouter une fonction `stripLegacyIdentityLockBlocks(prompt)` qui :
- détecte chaque en-tête `(CHARACTER|LOCATION|OBJECT|VEHICLE) IDENTITY LOCK:` n'importe où dans la chaîne ;
- trouve sa fin via un look-ahead sur les marqueurs : prochain en-tête de lock, ou `Image documentaire historique`, `Qualité visuelle :`, `Any visible writing`, `Ratio d'aspect`, ou la phrase de clôture `...may vary.` ;
- supprime le bloc complet incluant `VERSION / TIME PERIOD LOCK:`, `REFERENCE IMAGES PROVIDED:`, `NO ... DRIFT:` ;
- compresse les espaces et lignes vides résultants.

Conserver `stripLegacyIdentityLockPrefix` comme alias rétrocompat appelant la nouvelle fonction.

### 2. Brancher la nouvelle fonction sur les générateurs d'images
Fichiers : 
- `supabase/functions/generate-shot-image-kie/index.ts` (ligne 582)
- `supabase/functions/generate-shot-image/index.ts` (même endroit)

Remplacer `stripLegacyIdentityLockPrefix(rawPrompt)` par `stripLegacyIdentityLockBlocks(rawPrompt)`.

### 3. Réparer la `description` corrompue (one-shot SQL)
Migration ciblant les 7 shots du projet `e9cc3fe1-063a-4593-9f76-6d54772f70a0` dont la `description` commence par `photographie documentaire` ou contient `IDENTITY LOCK` :
- mettre `description = NULL` (le système retombera proprement sur `source_sentence` lors du prochain rendu) ;
- OU mieux : copier `source_sentence` dans `description` quand `description` est polluée, pour préserver une vraie phrase narrative.

Étendre la migration à tous les projets de l'utilisateur ayant ce pattern (sécurité).

### 4. Nettoyer les `prompt_export` historiques (one-shot SQL)
Même migration : `UPDATE shots SET prompt_export = regexp_replace(prompt_export, ...)` pour retirer les blocs IDENTITY LOCK verbeux. Le rendu Kie s'appuiera ensuite sur les locks condensés du registry, conformément à l'architecture cible.

### 5. Sécuriser le fallback de `description` côté `generate-storyboard`
Fichier : `supabase/functions/generate-storyboard/index.ts` (~ligne 1140)

Quand on doit construire une `description` à partir du `prompt_export`, appeler `stripLegacyIdentityLockBlocks` ET retirer le préambule `"Style : ..."` ET les suffixes qualité avant de prendre le slice de 500 caractères. Tomber sur `source_sentence` si le résultat est trop court ou vide.

## Vérification post-correction

1. La `description` du shot 11 redevient une phrase visuelle française propre (proche de `source_sentence`).
2. Régénérer le shot 13 : la NACA-duct du toit doit être le sujet central, plus une Diablo GT générique au stand.
3. Les 7 shots de la scène 2 doivent produire des images visuellement distinctes.

## À confirmer

- **Périmètre du nettoyage SQL** : uniquement le projet Lamborghini Diablo GT, ou tous les projets de l'utilisateur ayant ce pattern (recommandé) ?
- **Stratégie de réparation `description`** : mettre à NULL (le système régénère propre) ou copier `source_sentence` (immédiat, mais sans enrichissement visuel) ?