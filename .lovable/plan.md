
## Problem
Edge function `generate-script` fails on first generation with HTTP 400 from the AI gateway:
> `Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.`

GPT-5 (and other GPT-5 family models) only accept `temperature = 1`. Currently the code sends `0.7` for fresh generations, which is rejected → empty stream → frontend toast "le système n'a pas rendu de texte exploitable".

Regeneration happens to work because it sends `1.0`.

## Fix
In `supabase/functions/generate-script/index.ts` (line 2345), remove the `temperature` parameter entirely from the GPT-5 call. With GPT-5 the default value is already `1` and any explicit override breaks the request.

Change:
```ts
model: "openai/gpt-5",
max_completion_tokens: 24000,
temperature: isRegenerate ? 1.0 : 0.7,
```
to:
```ts
model: "openai/gpt-5",
max_completion_tokens: 24000,
// GPT-5 only supports the default temperature (1) — do not override
```

Variability for regenerations is already preserved via the `forcedAngle` mechanism (random pick among 9 alternative narrative angles injected into the system prompt at line 2330–2332), so removing the temperature lever has no real impact on diversity.

## Audit other AI calls
Quickly grep the rest of `generate-script/index.ts` and other edge functions calling `openai/gpt-5*` to make sure no other call still sends an explicit `temperature`. Patch any remaining occurrences the same way.

## Validation
1. Click "Générer le script" → should now stream tokens and produce a script.
2. Click "Régénérer" → should still work (already worked).
3. Check function logs: no more `Unsupported value: 'temperature'` errors.
