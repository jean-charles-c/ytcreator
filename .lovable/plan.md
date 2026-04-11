

# Supprimer la troncature du texte source lors de la création du script

## Problème
Le texte source est tronqué à deux endroits dans les Edge Functions :
1. **`documentary-structure/index.ts`** (ligne 22) : `text.slice(0, 15000)` — troncature à 15 000 caractères
2. **`generate-script/index.ts`** (ligne 1519) : `text.slice(0, 25000)` — troncature à 25 000 caractères

## Solution
Supprimer les deux appels `.slice()` pour envoyer le texte source complet à l'IA. Les modèles utilisés (Gemini 2.5 Flash Lite et Gemini 2.5 Pro) supportent des contextes largement suffisants (1M+ tokens).

## Changements

| Fichier | Ligne | Modification |
|---------|-------|-------------|
| `supabase/functions/documentary-structure/index.ts` | 22 | `text.slice(0, 15000)` → `text` (texte complet) |
| `supabase/functions/generate-script/index.ts` | 1519 | `text.slice(0, 25000)` → `text` (texte complet) |

Deux lignes modifiées, aucun autre impact.

