---
name: Identity Lock Strip Anywhere
description: stripLegacyIdentityLockBlocks removes verbose IDENTITY LOCK blocks anywhere in prompt_export, not just as prefix
type: feature
---
Legacy verbose IDENTITY LOCK blocks (CHARACTER/LOCATION/OBJECT/VEHICLE + VERSION/TIME PERIOD LOCK + REFERENCE IMAGES PROVIDED + NO ... DRIFT) are stripped from anywhere in prompt_export, not only when prefixing it.

Why it matters: older shots stored the locks glued in the middle of prompt_export. The previous prefix-only regex silently no-op'd, leaving 4 stacked locks that drowned the per-shot fragment and made scene shots converge to identical images. The description fallback also sliced into a lock and persisted polluted boilerplate as the visible description.

Implementation: supabase/functions/_shared/identity-lock-utils.ts exports stripLegacyIdentityLockBlocks (back-compat alias stripLegacyIdentityLockPrefix). Iterative passes end each block at next lock header or at suffix anchors (Image documentaire, Qualité visuelle, Any visible writing, Ratio d'aspect, Style :, EOS).

DB cleanup: one-shot UPDATE scrubbed 386 historical shots so prompt_export and description are clean in UI/QA. Future renders rely on the registry's mentions_shots to inject condensed identity anchors at render time.
