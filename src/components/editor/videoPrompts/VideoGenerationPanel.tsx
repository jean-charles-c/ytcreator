/**
 * VideoGenerationPanel — Provider selector, dynamic duration, editable prompt, generate button.
 * Reads capabilities from ProviderCapabilityConfig. Creates a new VideoGeneration row on submit.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Loader2, AlertCircle, DollarSign, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  getEnabledProviders,
  getProviderCapability,
  getProviderDurations,
  providerSupportsAspectRatio,
  KLING_MODELS,
  KLING_MODES,
  KLING_SOUND_OPTIONS,
} from "./providerCapabilityConfig";
import type {
  VideoProvider,
  VisualAsset,
  VideoGeneration,
} from "./videoGeneration.types";
import {
  submitVideoGeneration,
  pollUntilDone,
  queryProviderBalance,
  type ProviderBalanceResult,
} from "./videoOrchestrationClient";

interface VideoGenerationPanelProps {
  asset: VisualAsset;
  projectId: string;
  onGenerationCreated: (gen: VideoGeneration) => void;
  defaultPrompt?: string;
}

export default function VideoGenerationPanel({
  asset,
  projectId,
  onGenerationCreated,
  defaultPrompt,
}: VideoGenerationPanelProps) {
  const enabledProviders = useMemo(() => getEnabledProviders(), []);

  const [provider, setProvider] = useState<VideoProvider>(enabledProviders[0]?.id ?? "kling");
  const [durationSec, setDurationSec] = useState<number>(5);
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [klingModel, setKlingModel] = useState("kling-v1");
  const [klingMode, setKlingMode] = useState("std");
  const [klingSound, setKlingSound] = useState("off");
  const [balance, setBalance] = useState<ProviderBalanceResult | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchBalance = useCallback(async (p: VideoProvider) => {
    setBalanceLoading(true);
    try {
      const result = await queryProviderBalance(p);
      setBalance(result);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance(provider);
  }, [provider, fetchBalance]);

  const capability = useMemo(() => getProviderCapability(provider), [provider]);
  const durations = useMemo(() => getProviderDurations(provider), [provider]);

  // Reset duration when provider changes if current is invalid
  useEffect(() => {
    const valid = durations.some((d) => d.value === durationSec);
    if (!valid && durations.length > 0) {
      setDurationSec(durations[0].value);
    }
  }, [provider, durations, durationSec]);

  // Reset aspect ratio if unsupported
  useEffect(() => {
    if (!providerSupportsAspectRatio(provider, aspectRatio) && capability.aspectRatios.length > 0) {
      setAspectRatio(capability.aspectRatios[0]);
    }
  }, [provider, aspectRatio, capability]);

  // Pre-fill prompt from default prompt + asset context
  useEffect(() => {
    const parts: string[] = [];
    if (defaultPrompt) parts.push(defaultPrompt);
    if (asset.scriptSentence?.sourceSentence) parts.push(asset.scriptSentence.sourceSentence);
    else if (asset.label) parts.push(asset.label);
    if (parts.length > 0 && !prompt) {
      setPrompt(parts.join("\n\n"));
    }
  }, [asset, defaultPrompt]);

  const canSubmit = !!asset.imageUrl && !!prompt.trim() && !isSubmitting;
  const missingImage = !asset.imageUrl;
  const missingPrompt = !prompt.trim();

  async function handleGenerate() {
    if (!canSubmit) {
      if (missingImage) {
        toast({ title: "Image manquante", description: "Aucune image source disponible pour ce shot.", variant: "destructive" });
      } else if (missingPrompt) {
        toast({ title: "Prompt vide", description: "Renseignez un prompt avant de lancer la génération.", variant: "destructive" });
      }
      return;
    }

    setIsSubmitting(true);
    toast({ title: "⏳ Préparation…", description: "Enregistrement de la demande de génération…" });
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const generationId = crypto.randomUUID();

      // Insert generation row
      const { error: insertError } = await supabase
        .from("video_generations")
        .insert({
          id: generationId,
          user_id: user.id,
          project_id: projectId,
          source_type: asset.source,
          source_shot_id: asset.source === "gallery" ? asset.shotId : null,
          source_upload_id: asset.source === "external_upload" ? asset.id : null,
          source_image_url: asset.imageUrl,
          provider,
          prompt_used: prompt.trim(),
          negative_prompt: negativePrompt.trim(),
          duration_sec: durationSec,
          aspect_ratio: aspectRatio,
          status: "pending",
          estimated_cost_usd: capability.estimatedCostPerGeneration,
        });

      if (insertError) throw insertError;

      // Notify parent immediately
      const newGen: VideoGeneration = {
        id: generationId,
        userId: user.id,
        projectId,
        visualAssetId: asset.shotId ?? asset.id,
        sourceType: asset.source,
        sourceImageUrl: asset.imageUrl,
        provider,
        promptUsed: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        durationSec,
        aspectRatio,
        status: "pending",
        resultVideoUrl: null,
        resultThumbnailUrl: null,
        errorMessage: null,
        providerJobId: null,
        generationTimeMs: null,
        estimatedCostUsd: capability.estimatedCostPerGeneration,
        providerMetadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onGenerationCreated(newGen);

      toast({
        title: "Génération lancée",
        description: `${capability.name} — ${durationSec}s — en attente du provider`,
      });

      const submitResult = await submitVideoGeneration({
        generationId,
        projectId,
        sourceType: asset.source,
        sourceShotId: asset.source === "gallery" ? asset.shotId : null,
        sourceUploadId: asset.source === "external_upload" ? asset.id : null,
        sourceImageUrl: asset.imageUrl,
        provider,
        promptUsed: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        durationSec,
        aspectRatio,
        klingModelName: provider === "kling" ? klingModel : undefined,
        klingMode: provider === "kling" ? klingMode : undefined,
        klingSound: provider === "kling" ? klingSound : undefined,
      });

      if (!submitResult.success || submitResult.status === "error") {
        const errorMessage = submitResult.errorMessage ?? "Le provider a refusé la génération.";

        await supabase
          .from("video_generations")
          .update({
            status: "error",
            error_message: errorMessage,
            provider_job_id: submitResult.providerJobId,
          })
          .eq("id", generationId);

        onGenerationCreated({
          ...newGen,
          status: "error",
          providerJobId: submitResult.providerJobId,
          errorMessage,
        });

        toast({
          title: "Échec provider",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      onGenerationCreated({
        ...newGen,
        status: submitResult.status,
        providerJobId: submitResult.providerJobId,
      });

      toast({
        title: "Provider accepté",
        description: "La génération est partie chez le provider, suivi en cours…",
      });

      void pollUntilDone(generationId, {
        intervalMs: 5000,
        onProgress: (result) => {
          supabase
            .from("video_generations")
            .update({
              status: result.status,
              result_video_url: result.resultVideoUrl ?? null,
              result_thumbnail_url: result.resultThumbnailUrl ?? null,
              error_message: result.errorMessage ?? null,
            })
            .eq("id", generationId)
            .then(() => {
              onGenerationCreated({
                ...newGen,
                providerJobId: submitResult.providerJobId,
                status: result.status,
                resultVideoUrl: result.resultVideoUrl ?? null,
                resultThumbnailUrl: result.resultThumbnailUrl ?? null,
                errorMessage: result.errorMessage ?? null,
              });
            });
        },
      }).catch((err) => {
        console.error("Orchestration submit failed:", err);
        supabase
          .from("video_generations")
          .update({ status: "error", error_message: err.message })
          .eq("id", generationId);
      });
    } catch (err: any) {
      console.error("Generation error:", err);
      toast({
        title: "Erreur",
        description: err.message ?? "Impossible de lancer la génération",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Balance display */}
      {balance && (
        <div className="flex items-center gap-1.5 text-[10px] p-2 rounded-md bg-secondary/40 border border-border">
          <Wallet className="h-3 w-3 text-primary shrink-0" />
          {balance.error ? (
            <span className="text-destructive">{balance.error}</span>
          ) : balance.totalRemaining !== null ? (
            <span>
              <span className="font-medium text-foreground">{balance.totalRemaining.toFixed(1)}</span>
              {" "}crédits API restants
              {balance.packages.filter(p => p.status === "online").length > 0 && (
                <span className="text-muted-foreground/60">
                  {" "}({balance.packages.filter(p => p.status === "online").map(p => p.name).join(", ")})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Solde non disponible pour ce provider</span>
          )}
          {balanceLoading && <Loader2 className="h-2.5 w-2.5 animate-spin ml-auto" />}
        </div>
      )}

      {/* Provider + Duration row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Provider */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Provider
          </Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as VideoProvider)}>
            <SelectTrigger className="h-10 sm:h-9 text-xs bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {enabledProviders.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                      ~${p.estimatedCostPerGeneration.toFixed(2)}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground/60 hidden sm:block">{capability.description}</p>
        </div>

        {/* Duration */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Durée
          </Label>
          <Select
            value={String(durationSec)}
            onValueChange={(v) => setDurationSec(Number(v))}
          >
            <SelectTrigger className="h-10 sm:h-9 text-xs bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durations.map((d) => (
                <SelectItem key={d.value} value={String(d.value)} className="text-xs">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kling-specific options */}
      {provider === "kling" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Modèle Kling
            </Label>
            <Select value={klingModel} onValueChange={setKlingModel}>
              <SelectTrigger className="h-10 sm:h-9 text-xs bg-secondary/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KLING_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Mode */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Qualité
            </Label>
            <Select value={klingMode} onValueChange={setKlingMode}>
              <SelectTrigger className="h-10 sm:h-9 text-xs bg-secondary/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KLING_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Sound */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Audio
            </Label>
            <Select value={klingSound} onValueChange={setKlingSound}>
              <SelectTrigger className="h-10 sm:h-9 text-xs bg-secondary/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KLING_SOUND_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Aspect ratio */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Ratio
        </Label>
        <div className="flex gap-1.5 flex-wrap">
          {capability.aspectRatios.map((ratio) => (
            <button
              key={ratio}
              onClick={() => setAspectRatio(ratio)}
              className={`px-3 py-1.5 sm:px-2.5 sm:py-1 text-[10px] rounded-md border transition-colors min-h-[32px] sm:min-h-0 ${
                aspectRatio === ratio
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Prompt
          </Label>
          <span className="text-[9px] text-muted-foreground/50">
            {prompt.length}/{capability.maxPromptLength}
          </span>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, capability.maxPromptLength))}
          placeholder="Décrivez le mouvement, l'ambiance, la caméra…"
          className="min-h-[80px] text-xs bg-secondary/30 border-border resize-none"
        />
      </div>

      {/* Negative prompt (if supported) */}
      {capability.supportsNegativePrompt && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Prompt négatif
          </Label>
          <Textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Éléments à éviter…"
            className="min-h-[50px] text-xs bg-secondary/30 border-border resize-none"
          />
        </div>
      )}

      {/* Cost estimate + Generate button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          <span>Coût estimé : ~${capability.estimatedCostPerGeneration.toFixed(2)}</span>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isSubmitting}
          size="sm"
          className="gap-1.5 h-10 sm:h-8 w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Envoi…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Générer la vidéo
            </>
          )}
        </Button>
      </div>

      {/* Validation warnings */}
      {(missingImage || missingPrompt) && (
        <div className="space-y-1">
          {missingImage && (
            <div className="flex items-center gap-1.5 text-[10px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              Aucune image source — génération impossible
            </div>
          )}
          {missingPrompt && !missingImage && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-500">
              <AlertCircle className="h-3 w-3" />
              Renseignez un prompt pour lancer la génération
            </div>
          )}
        </div>
      )}
    </div>
  );
}
