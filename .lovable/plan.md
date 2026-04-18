

## Compréhension corrigée

Mon diagnostic précédent était faux : Whisper ne fusionne PAS les mots. C'est ton copier-coller depuis la textarea qui supprime les espaces à l'affichage. Côté données, les `whisperWords` sont bien des tokens séparés avec leurs timestamps individuels.

Donc le shot 41 a un vrai problème de matching, mais pas pour la raison que je pensais. Il faut que j'inspecte les vraies données pour comprendre.

## Hypothèses à vérifier

Vu que les mots SONT bien séparés côté Whisper et que la phrase attendue « Sous certaines P400 précoces, les restaurations font apparaître des différences nettes. » correspond mot pour mot à ce que tu vois dans la textarea, le shot 41 devrait matcher trivialement avec la passe « 3 mots exacts ».

Causes plausibles :

1. **Le shot précédent (40) a "volé" la fenêtre** : si shot 40 a matché trop loin dans le transcript (ex: à l'index 1100), alors `searchFrom` pour shot 41 démarre après "Sous certaines P400…" qui se trouve avant. Le matcher ne regarde QUE en avant (`searchFrom → searchFrom + 50`).

2. **Le shot 41 est marqué `blocked` à cause d'un shot antérieur bloqué** : la chaîne séquentielle stricte propage le blocage.

3. **Normalisation de "P400"** : `norm("P400")` donne bien `"p400"` (la regex `[^\p{L}\p{N}']` garde les chiffres), donc OK a priori. Mais si Whisper a transcrit « P 400 » (avec espace) ou « pé quatre cents », les 3 premiers mots `["sous", "certaines", "p400"]` ne matchent pas.

4. **Le matcher trouve un faux positif "Sous" plus tôt** : il y a peut-être un autre "Sous certaines …" dans le transcript qui aspire shot 41.

## Plan

### Étape 1 — Diagnostic ciblé (logs temporaires)
Ajouter dans `whisperTextMatcher.ts` un `console.debug` quand un shot ne match pas en passes 1 et 2 : afficher les `leadWords` du shot, `searchFrom`, et les 10 premiers tokens Whisper de la fenêtre. Tu relances la triple passe sur le projet, on lit les logs navigateur pour shot 41 et on saura exactement ce que Whisper a renvoyé pour « P400 ».

### Étape 2 — Correctif selon le diagnostic
Trois correctifs candidats, à appliquer selon ce que révèlent les logs :

- **Si « P400 » est transcrit « P 400 »** → améliorer `extractLeadingWords` pour fusionner lettre+chiffre adjacents, OU étendre la passe 2 à un matching avec recombinaison de tokens.
- **Si shot 40 a sur-avancé `searchFrom`** → ajouter un *back-search limité* (regarder aussi `[searchFrom - 10 … searchFrom]`) en passe 3, uniquement si la passe 1+2 échoue, pour récupérer les shots qui ont été "sautés".
- **Si un shot antérieur est bloqué** → afficher clairement dans l'UI quel shot a bloqué la chaîne pour shot 41, pour que tu cales celui-là d'abord.

### Étape 3 — Nettoyage
Retirer les `console.debug` une fois le bug compris et corrigé.

### Fichier touché
```text
src/components/editor/whisperTextMatcher.ts
```

Aucune migration DB, aucun changement Edge Function.

