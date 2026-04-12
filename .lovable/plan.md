

## Plan: Redeploy generate-shot-image Edge Function

The edge function code is already in the project. I will deploy the `generate-shot-image` function using the deployment tool, which will push the latest code from the codebase.

Additionally, I will fix the 9 TypeScript errors in other edge functions that are currently blocking the build, as the deployment type-checks all functions together.

### Steps

1. **Fix TypeScript errors** in the following files:
   - `analyze-script/index.ts` — add type assertion for language indexing
   - `find-tension/index.ts` — add types for `t` and `i` parameters
   - `generate-tts/index.ts` — remove or fix `forceSync` property reference
   - `search-reference-images/index.ts` — type `error` as `Error`
   - `video-orchestrator/index.ts` — fix `code` type to accept `{}`
   - `whisper-align/index.ts` — fix Supabase client type mismatch

2. **Deploy** `generate-shot-image` (and all functions will be type-checked together)

