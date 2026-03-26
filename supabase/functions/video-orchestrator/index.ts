/**
 * video-orchestrator — Unified edge function for video generation orchestration.
 *
 * Actions:
 *  - submit:   Send an image-to-video request to a provider, create DB record
 *  - poll:     Check status of a generation with the provider
 *  - complete: Download finished video, store in Supabase storage, update DB
 *
 * All provider API keys are server-side only.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

const KLING_API_BASE = "https://api.klingai.com";

// ── Kling JWT helper ──────────────────────────────────────────────
async function generateKlingJWT(accessKey: string, secretKey: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const now = Math.floor(Date.now() / 1000);
  return await create(
    { alg: "HS256", typ: "JWT" },
    { iss: accessKey, exp: now + 1800, nbf: now - 5 },
    cryptoKey,
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Provider adapters ─────────────────────────────────────────────

interface SubmitResult {
  providerJobId: string;
  status: "pending" | "processing";
}

interface PollResult {
  status: "pending" | "processing" | "completed" | "error";
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  generationTimeMs?: number;
}

interface NormalizedProviderError {
  code: string | number | null;
  message: string;
  rawMessage: string;
  requestId: string | null;
}

function tryParseProviderJson(rawMessage: string): Record<string, unknown> | null {
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(rawMessage.slice(jsonStart)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeProviderError(provider: string, error: unknown): NormalizedProviderError {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const parsed = tryParseProviderJson(rawMessage);
  const code = parsed?.code ?? null;
  const requestId = typeof parsed?.request_id === "string" ? parsed.request_id : null;
  const providerMessage = typeof parsed?.message === "string" ? parsed.message : rawMessage;

  if (provider === "kling" && String(code) === "1102") {
    return {
      code,
      requestId,
      rawMessage,
      message:
        "Kling API : solde API insuffisant pour le package vidéo du workspace lié à ces clés. Les crédits visibles dans l'interface Kling ne suffisent pas toujours pour l'API.",
    };
  }

  if (provider === "kling" && String(code) === "1000") {
    return {
      code,
      requestId,
      rawMessage,
      message: "Kling API : authentification invalide. Vérifiez l'Access Key et la Secret Key du bon workspace.",
    };
  }

  return {
    code,
    requestId,
    rawMessage,
    message: providerMessage,
  };
}

async function submitToKling(params: {
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  durationSec: number;
  aspectRatio: string;
  modelName?: string;
  mode?: string;
  sound?: string;
}): Promise<SubmitResult> {
  const accessKey = Deno.env.get("KLING_ACCESS_KEY");
  const secretKey = Deno.env.get("KLING_SECRET_KEY");
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not configured");

  const token = await generateKlingJWT(accessKey, secretKey);

  const resp = await fetch(`${KLING_API_BASE}/v1/videos/image2video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_name: params.modelName ?? "kling-v1",
      image: params.imageUrl,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      cfg_scale: 0.5,
      mode: params.mode ?? "std",
      duration: String(params.durationSec),
      aspect_ratio: params.aspectRatio,
      sound: params.sound ?? "off",
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Kling API error: ${JSON.stringify(data)}`);

  return {
    providerJobId: data.data?.task_id ?? data.task_id ?? data.id,
    status: "pending",
  };
}

async function pollKling(jobId: string): Promise<PollResult> {
  const accessKey = Deno.env.get("KLING_ACCESS_KEY");
  const secretKey = Deno.env.get("KLING_SECRET_KEY");
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not configured");

  const token = await generateKlingJWT(accessKey, secretKey);

  const resp = await fetch(`${KLING_API_BASE}/v1/videos/image2video/${jobId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Kling poll error: ${JSON.stringify(data)}`);

  const taskStatus = data.data?.task_status ?? data.task_status;
  const statusMap: Record<string, PollResult["status"]> = {
    submitted: "pending",
    processing: "processing",
    succeed: "completed",
    failed: "error",
  };

  const result: PollResult = {
    status: statusMap[taskStatus] ?? "processing",
  };

  if (result.status === "completed") {
    const videos = data.data?.task_result?.videos ?? [];
    result.videoUrl = videos[0]?.url;
    result.thumbnailUrl = videos[0]?.cover_url;
    result.generationTimeMs = data.data?.task_result?.generation_time_ms;
  } else if (result.status === "error") {
    result.errorMessage = data.data?.task_status_msg ?? "Unknown Kling error";
  }

  return result;
}

async function submitToRunway(params: {
  imageUrl: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  model: "gen3" | "gen4";
}): Promise<SubmitResult> {
  const apiKey = Deno.env.get("RUNWAY_API_KEY");
  if (!apiKey) throw new Error("RUNWAY_API_KEY not configured");

  const modelId = params.model === "gen4" ? "gen4_turbo" : "gen3a_turbo";

  const resp = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model: modelId,
      promptImage: params.imageUrl,
      promptText: params.prompt,
      duration: params.durationSec,
      ratio: params.aspectRatio.replace(":", ":"),
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Runway API error: ${JSON.stringify(data)}`);

  return {
    providerJobId: data.id,
    status: "pending",
  };
}

async function pollRunway(jobId: string): Promise<PollResult> {
  const apiKey = Deno.env.get("RUNWAY_API_KEY");
  if (!apiKey) throw new Error("RUNWAY_API_KEY not configured");

  const resp = await fetch(`https://api.dev.runwayml.com/v1/tasks/${jobId}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-Runway-Version": "2024-11-06",
    },
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Runway poll error: ${JSON.stringify(data)}`);

  const statusMap: Record<string, PollResult["status"]> = {
    PENDING: "pending",
    RUNNING: "processing",
    SUCCEEDED: "completed",
    FAILED: "error",
    THROTTLED: "pending",
  };

  const result: PollResult = {
    status: statusMap[data.status] ?? "processing",
  };

  if (result.status === "completed") {
    result.videoUrl = data.output?.[0];
  } else if (result.status === "error") {
    result.errorMessage = data.failure ?? data.failureCode ?? "Unknown Runway error";
  }

  return result;
}

async function submitToLuma(params: {
  imageUrl: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
}): Promise<SubmitResult> {
  const apiKey = Deno.env.get("LUMA_API_KEY");
  if (!apiKey) throw new Error("LUMA_API_KEY not configured");

  const resp = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: params.prompt,
      keyframes: {
        frame0: {
          type: "image",
          url: params.imageUrl,
        },
      },
      aspect_ratio: params.aspectRatio.replace(":", ":"),
      loop: false,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Luma API error: ${JSON.stringify(data)}`);

  return {
    providerJobId: data.id,
    status: "pending",
  };
}

async function pollLuma(jobId: string): Promise<PollResult> {
  const apiKey = Deno.env.get("LUMA_API_KEY");
  if (!apiKey) throw new Error("LUMA_API_KEY not configured");

  const resp = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${jobId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Luma poll error: ${JSON.stringify(data)}`);

  const statusMap: Record<string, PollResult["status"]> = {
    queued: "pending",
    dreaming: "processing",
    completed: "completed",
    failed: "error",
  };

  const result: PollResult = {
    status: statusMap[data.state] ?? "processing",
  };

  if (result.status === "completed") {
    result.videoUrl = data.assets?.video;
    result.thumbnailUrl = data.assets?.thumbnail;
  } else if (result.status === "error") {
    result.errorMessage = data.failure_reason ?? "Unknown Luma error";
  }

  return result;
}

// ── Unified dispatch ──────────────────────────────────────────────

async function submitGeneration(provider: string, params: any): Promise<SubmitResult> {
  switch (provider) {
    case "kling":
      return submitToKling(params);
    case "runway_gen3":
      return submitToRunway({ ...params, model: "gen3" });
    case "runway_gen4":
      return submitToRunway({ ...params, model: "gen4" });
    case "luma":
      return submitToLuma(params);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function pollGeneration(provider: string, jobId: string): Promise<PollResult> {
  switch (provider) {
    case "kling":
      return pollKling(jobId);
    case "runway_gen3":
    case "runway_gen4":
      return pollRunway(jobId);
    case "luma":
      return pollLuma(jobId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Storage helper ────────────────────────────────────────────────

async function downloadAndStore(
  supabase: any,
  videoUrl: string,
  projectId: string,
  generationId: string,
): Promise<string> {
  // Download the video from provider
  const resp = await fetch(videoUrl);
  if (!resp.ok) throw new Error(`Failed to download video: ${resp.statusText}`);

  const videoBuffer = await resp.arrayBuffer();
  const filePath = `${projectId}/${generationId}.mp4`;

  const { error } = await supabase.storage
    .from("video-exports")
    .upload(filePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) throw new Error(`Storage upload error: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from("video-exports")
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

// ── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action } = body;

    // ── SUBMIT ────────────────────────────────────────────────────
    if (action === "submit") {
      const {
        generationId,
        projectId,
        sourceType,
        sourceShotId,
        sourceUploadId,
        sourceImageUrl,
        provider,
        promptUsed,
        negativePrompt,
        durationSec,
        aspectRatio,
      } = body;

      const klingModelName = body.klingModelName;
      const klingMode = body.klingMode;
      const klingSound = body.klingSound;

      let submitResult: SubmitResult;
      try {
        submitResult = await submitGeneration(provider, {
          imageUrl: sourceImageUrl,
          prompt: promptUsed,
          negativePrompt: negativePrompt ?? "",
          durationSec,
          aspectRatio,
          modelName: klingModelName,
          mode: klingMode,
          sound: klingSound,
        });
      } catch (submitError) {
        const normalizedError = normalizeProviderError(provider, submitError);

        await supabase.from("video_generations").upsert({
          id: generationId,
          user_id: userId,
          project_id: projectId,
          source_type: sourceType,
          source_shot_id: sourceShotId ?? null,
          source_upload_id: sourceUploadId ?? null,
          source_image_url: sourceImageUrl,
          provider,
          prompt_used: promptUsed,
          negative_prompt: negativePrompt ?? "",
          duration_sec: durationSec,
          aspect_ratio: aspectRatio,
          status: "error",
          provider_job_id: null,
          error_message: normalizedError.message,
          provider_metadata: {
            provider_error_code: normalizedError.code,
            provider_request_id: normalizedError.requestId,
            provider_raw_error: normalizedError.rawMessage,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

        return new Response(
          JSON.stringify({
            success: false,
            generationId,
            providerJobId: null,
            status: "error",
            errorMessage: normalizedError.message,
            providerErrorCode: normalizedError.code,
            providerRequestId: normalizedError.requestId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: upsertError } = await supabase.from("video_generations").upsert({
        id: generationId,
        user_id: userId,
        project_id: projectId,
        source_type: sourceType,
        source_shot_id: sourceShotId ?? null,
        source_upload_id: sourceUploadId ?? null,
        source_image_url: sourceImageUrl,
        provider,
        prompt_used: promptUsed,
        negative_prompt: negativePrompt ?? "",
        duration_sec: durationSec,
        aspect_ratio: aspectRatio,
        status: submitResult.status,
        provider_job_id: submitResult.providerJobId,
        error_message: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      if (upsertError) {
        console.error("DB upsert error:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to record generation", details: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          generationId,
          providerJobId: submitResult.providerJobId,
          status: submitResult.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── POLL ──────────────────────────────────────────────────────
    if (action === "poll") {
      const { generationId } = body;

      // Get generation record
      const { data: gen, error: fetchError } = await supabase
        .from("video_generations")
        .select("*")
        .eq("id", generationId)
        .single();

      if (fetchError || !gen) {
        return new Response(
          JSON.stringify({ error: "Generation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // If already completed or error, return current state
      if (gen.status === "completed" || gen.status === "error") {
        return new Response(
          JSON.stringify({
            generationId: gen.id,
            status: gen.status,
            resultVideoUrl: gen.result_video_url,
            resultThumbnailUrl: gen.result_thumbnail_url,
            errorMessage: gen.error_message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Poll provider
      const pollResult = await pollGeneration(gen.provider, gen.provider_job_id);

      // If completed, download and store
      if (pollResult.status === "completed" && pollResult.videoUrl) {
        try {
          const storedUrl = await downloadAndStore(
            supabase,
            pollResult.videoUrl,
            gen.project_id,
            gen.id,
          );

          const updatePayload: Record<string, unknown> = {
            status: "completed",
            result_video_url: storedUrl,
            result_thumbnail_url: pollResult.thumbnailUrl ?? null,
            generation_time_ms: pollResult.generationTimeMs ?? null,
            updated_at: new Date().toISOString(),
          };

          await supabase
            .from("video_generations")
            .update(updatePayload)
            .eq("id", generationId);

          return new Response(
            JSON.stringify({
              generationId,
              status: "completed",
              resultVideoUrl: storedUrl,
              resultThumbnailUrl: pollResult.thumbnailUrl ?? null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } catch (storeErr: any) {
          // Storage failed but generation succeeded — mark error with video URL
          await supabase
            .from("video_generations")
            .update({
              status: "error",
              error_message: `Storage failed: ${storeErr.message}. Provider URL: ${pollResult.videoUrl}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", generationId);

          return new Response(
            JSON.stringify({
              generationId,
              status: "error",
              errorMessage: `Storage failed: ${storeErr.message}`,
              providerVideoUrl: pollResult.videoUrl,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Still processing or error
      if (pollResult.status === "error") {
        await supabase
          .from("video_generations")
          .update({
            status: "error",
            error_message: pollResult.errorMessage ?? "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);
      } else {
        await supabase
          .from("video_generations")
          .update({
            status: pollResult.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);
      }

      return new Response(
        JSON.stringify({
          generationId,
          status: pollResult.status,
          errorMessage: pollResult.errorMessage ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    }

    // ── BALANCE ───────────────────────────────────────────────────
    if (action === "balance") {
      const { provider: balanceProvider } = body;

      if (balanceProvider === "kling") {
        try {
          const accessKey = Deno.env.get("KLING_ACCESS_KEY");
          const secretKey = Deno.env.get("KLING_SECRET_KEY");
          if (!accessKey || !secretKey) throw new Error("KLING keys not configured");

          const token = await generateKlingJWT(accessKey, secretKey);
          const now = Date.now();
          const resp = await fetch(
            `${KLING_API_BASE}/account/costs?start_time=${now - 365 * 86400000}&end_time=${now + 365 * 86400000}`,
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
          );
          const data = await resp.json();

          const infos = data.data?.resource_pack_subscribe_infos ?? [];
          const packages = infos.map((p: any) => ({
            name: p.resource_pack_name,
            remaining: p.remaining_quantity,
            total: p.total_quantity,
            status: p.status,
            expiresAt: new Date(p.invalid_time).toISOString(),
          }));
          const totalRemaining = packages
            .filter((p: any) => p.status === "online")
            .reduce((sum: number, p: any) => sum + p.remaining, 0);

          return new Response(
            JSON.stringify({ provider: "kling", packages, totalRemaining }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ provider: "kling", error: err.message, packages: [], totalRemaining: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      return new Response(
        JSON.stringify({ provider: balanceProvider, packages: [], totalRemaining: null, note: "Balance check not available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("video-orchestrator error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
