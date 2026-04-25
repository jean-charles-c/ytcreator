import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Refresh Kie.ai pricing once per day.
 *
 * Strategy: Kie.ai does not (yet) expose a documented public pricing JSON endpoint.
 * We try the known billing endpoint; if it returns model prices, we update kie_pricing.
 * Otherwise we no-op gracefully and just stamp last_synced_at on the existing rows
 * so the UI knows we tried.
 *
 * Triggered by pg_cron daily.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!KIE_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: "no api key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    const errors: string[] = [];

    // Try Kie's pricing/models endpoint (may not exist on all plans)
    try {
      const resp = await fetch("https://api.kie.ai/api/v1/playground/models", {
        headers: { "Authorization": `Bearer ${KIE_API_KEY}` },
      });
      if (resp.ok) {
        const json = await resp.json();
        const models = json?.data?.models || json?.data || [];
        if (Array.isArray(models)) {
          for (const m of models) {
            const modelId = m.model || m.id || m.name;
            if (!modelId) continue;
            const prices = m.pricing || m.prices || {};
            for (const [quality, price] of Object.entries(prices)) {
              const priceNum = Number(price);
              if (!Number.isFinite(priceNum)) continue;
              const normalizedQuality = quality.toUpperCase().includes("4K") ? "4K"
                : quality.toUpperCase().includes("2K") || quality.toUpperCase().includes("HD") ? "2K"
                : "1K";
              const { error } = await supabase
                .from("kie_pricing")
                .update({ price_usd: priceNum, last_synced_at: new Date().toISOString() })
                .eq("model_id", modelId)
                .eq("quality", normalizedQuality);
              if (!error) updatedCount++;
              else errors.push(`${modelId}/${normalizedQuality}: ${error.message}`);
            }
          }
        }
      } else {
        errors.push(`Kie /models HTTP ${resp.status}`);
      }
    } catch (e) {
      errors.push(`Kie /models fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Always stamp last_synced_at on all rows so UI can display freshness
    await supabase
      .from("kie_pricing")
      .update({ last_synced_at: new Date().toISOString() })
      .gte("created_at", "1970-01-01");

    return new Response(
      JSON.stringify({ success: true, updated: updatedCount, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("refresh-kie-pricing error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});