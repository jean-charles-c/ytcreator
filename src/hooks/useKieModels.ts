import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type KiePricingRow = {
  model_id: string;
  model_label: string;
  quality: "1K" | "2K" | "4K";
  price_usd: number;
  supports_oref: boolean;
  supports_sref: boolean;
  endpoint_path: string;
  is_active: boolean;
  last_synced_at: string | null;
};

export type ImageEngineOption = {
  // value is what we store as imageModel. Kie engines use prefix "kie:<model_id>"
  value: string;
  label: string;
  // available qualities for this engine
  qualities: { quality: "1K" | "2K" | "4K"; priceUsd: number }[];
  provider: "lovable" | "kie";
  supportsOref: boolean;
  supportsSref: boolean;
};

export const KIE_PREFIX = "kie:";

export const isKieEngine = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.startsWith(KIE_PREFIX);

export const stripKiePrefix = (value: string): string =>
  value.startsWith(KIE_PREFIX) ? value.slice(KIE_PREFIX.length) : value;

/**
 * Loads Kie pricing from DB and groups it into ImageEngineOption.
 * Lovable AI options should be merged in the consumer.
 */
export function useKieModels() {
  const [rows, setRows] = useState<KiePricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("kie_pricing")
          .select("model_id, model_label, quality, price_usd, supports_oref, supports_sref, endpoint_path, is_active, last_synced_at")
          .eq("is_active", true)
          .order("model_label", { ascending: true });
        if (error) throw error;
        if (!cancelled) setRows((data as KiePricingRow[]) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Group by model_id => one ImageEngineOption with multiple qualities
  const engines: ImageEngineOption[] = (() => {
    const byModel = new Map<string, KiePricingRow[]>();
    for (const r of rows) {
      if (!byModel.has(r.model_id)) byModel.set(r.model_id, []);
      byModel.get(r.model_id)!.push(r);
    }
    const out: ImageEngineOption[] = [];
    for (const [modelId, qRows] of byModel) {
      const sorted = [...qRows].sort((a, b) => a.quality.localeCompare(b.quality));
      out.push({
        value: `${KIE_PREFIX}${modelId}`,
        label: sorted[0]?.model_label ?? modelId,
        qualities: sorted.map((r) => ({ quality: r.quality, priceUsd: Number(r.price_usd) })),
        provider: "kie",
        supportsOref: sorted.some((r) => r.supports_oref),
        supportsSref: sorted.some((r) => r.supports_sref),
      });
    }
    return out;
  })();

  return { engines, rows, loading, error };
}

/** Format a price for compact display: "$0.04/img" */
export const formatKiePrice = (priceUsd: number): string => {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return "—";
  if (priceUsd < 0.01) return `$${priceUsd.toFixed(4)}/img`;
  return `$${priceUsd.toFixed(2)}/img`;
};