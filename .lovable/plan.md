## Diagnostic — d'où vient réellement le problème

Les couches "filtre" et "forbiddenAliases" ajoutées précédemment ne pouvaient pas marcher : elles supposent qu'un objet associé manuellement à la scène est "propre". Or, l'inspection de la DB montre que **l'objet contaminant est explicitement et légitimement associé à la scène 18 et au shot 86** — donc aucun filtre anti-contamination ne le supprimera, c'est lui qu'on injecte intentionnellement.

### Ce que contient `project_scriptcreator_state.global_context.objets_recurrents` pour ce projet

| Objet | `mentions_scenes` | Inclut shot 86 / 76 ? |
|---|---|---|
| **`Carbone Apparent / Blue Royal Carbon`** | [16, 17, 18, 32, 33, 34] | Oui, dans `mentions_shots` |
| `Ferrari` | **[16]** seulement | Non lié à scène 18 |
| `Bugatti` | [16, 32, 34] | — |
| `Carbon Skin` | [27, 28] | — |

### Cause racine (2 défauts cumulés)

1. **Objet composite mal formé**. L'auto‑détection a fabriqué une seule entrée dont le `nom` est `"Carbone Apparent / Blue Royal Carbon"` — c'est‑à‑dire **deux concepts distincts fusionnés via `/`** :
   - "Carbone Apparent" = option Ferrari Tailor Made (chap. 6, scènes 16‑18)
   - "Blue Royal Carbon" = signature Bugatti (chap. ~11, scènes 32‑34)
   Comme c'est *un seul* item de bibliothèque, dès qu'il est lié à une scène Ferrari, son `nom` et son `identity_prompt` injectent les mots `Blue Royal Carbon` dans le prompt — ce qui ressort tel quel dans `description` / `prompt_export`.

2. **Auto‑détection trop laxiste**. La fonction "Auto‑détection" lie l'objet à toute scène contenant son token distinctif. Le token de cet objet composite est probablement `carbone` / `carbon` / `royal`, ce qui matche les 6 scènes (16, 17, 18, 32, 33, 34) où le mot "carbone" apparaît, mélangeant les deux univers de marque.

L'utilisateur croit avoir "associé Ferrari" à la scène 18, mais en réalité :
- Ferrari n'est lié qu'à la scène 16,
- l'objet composite contaminant reste lié aux scènes 17/18 et à leurs shots.

Donc même après une régénération, le générateur fait ce qu'on lui demande : il injecte l'objet associé, et son nom contient littéralement "Blue Royal Carbon".

---

## Plan de correction

### 1. Diviser l'objet composite (one‑shot, ce projet)
- Renommer l'objet existant `Carbone Apparent / Blue Royal Carbon` → `Carbone Apparent` (Ferrari).
- Réduire ses `mentions_scenes` à `[16, 17, 18]` et ses `mentions_shots` à ceux des scènes 16‑18 uniquement.
- Nettoyer son `identity_prompt` et `description_visuelle` pour retirer toute mention "Blue Royal".
- Créer un nouvel objet `Blue Royal Carbon (Bugatti)` avec `mentions_scenes = [32, 33, 34]` et les shots Bugatti correspondants.
- Mettre à jour `project_scriptcreator_state.global_context.objets_recurrents` en conséquence (un seul UPDATE JSON).
- Effacer `prompt_export`, `guardrails` et `description` des shots 76 et 86 pour forcer une régénération propre, puis demander à l'utilisateur de régénérer.

### 2. Empêcher la réapparition d'objets composites (auto‑détection)
Dans la logique d'auto‑détection (`ObjectRegistryPanel.tsx` autour de la ligne 431 et la fonction d'analyse appelée) :
- **Refuser** la création/fusion d'un objet dont le `nom` contient `/`, `|`, `&` ou ` et ` reliant deux marques/concepts distincts → splitter en deux entrées.
- **Verrouiller les marques** (`type === 'brand'`) : ne jamais auto‑lier une marque à une scène où une autre marque concurrente est déjà liée (Ferrari vs Bugatti, etc.).
- **Filtrer les tokens génériques** (`carbone`, `carbon`, `royal`, `apparent`, `fibre`) lors du calcul du token distinctif d'auto‑détection : exiger au moins un token non générique pour activer l'auto‑lien.

### 3. Garde‑fou côté génération
Dans `_shared/identity-lock-utils.ts` :
- Avant d'injecter un objet récurrent dans le prompt, **valider que son `nom` ne contient pas `/`** ; si oui, logger un warning + n'utiliser que le segment correspondant aux tokens présents dans le texte de la scène courante.
- Si un objet allowed contient des mots‑clés d'une autre marque détectée dans la bibliothèque (cross‑contamination), ajouter ces mots à `forbiddenAliases` même pour un objet "allowed".

### 4. Vérification
- Re‑générer les shots 76 et 86 depuis l'UI.
- Vérifier en SQL que `description` et `prompt_export` ne contiennent plus "Blue Royal" / "Royal Carbon" / "Bugatti".
- Vérifier que les shots de la scène 32 (Bugatti) contiennent toujours bien "Blue Royal Carbon".

### Détails techniques
- Fichiers à modifier : `src/components/editor/ObjectRegistryPanel.tsx` (auto‑détection + interdiction `/` dans `nom`), `supabase/functions/_shared/identity-lock-utils.ts` (validation pré‑injection), `supabase/functions/generate-storyboard/index.ts` et `regenerate-shot/index.ts` (utiliser la validation).
- Migration data : un script `UPDATE project_scriptcreator_state SET global_context = jsonb_set(...)` pour ce projet uniquement (pas de migration SQL globale).
- Aucun changement de schéma — `mentions_scenes` / `mentions_shots` restent dans le JSON `global_context`, pas dans la table `recurring_object_library`.
