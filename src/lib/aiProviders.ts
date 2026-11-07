import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/clientRuntime";

export type Provider = "openrouter" | "openai" | "google" | "anthropic" | "atlascloud";
export type ModelKind = "chat" | "image";

export interface ProviderModel {
  id: string;
  name: string;
  kind: ModelKind;
  context_length: number | null;
  pricing: { prompt?: string; completion?: string } | null;
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  atlascloud: "Atlas Cloud",
};

export const PROVIDERS: Provider[] = ["openrouter", "openai", "google", "anthropic", "atlascloud"];

export const PROVIDER_IDS: readonly Provider[] = PROVIDERS;

const FN_BY_PROVIDER: Record<Provider, string> = {
  openrouter: "openrouter-models",
  openai: "openai-models",
  google: "google-models",
  anthropic: "anthropic-models",
  atlascloud: "atlascloud-models",
};

export function useProviderModels(provider: Provider) {
  return useQuery({
    queryKey: ["provider-models", provider],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data: saved, error: readError } = await supabase.from("site_settings").select("value")
        .eq("key", `ai_provider_models_${provider}`).maybeSingle();
      if (readError) throw readError;
      const snapshot = saved?.value as { models?: ProviderModel[] } | null;
      if (Array.isArray(snapshot?.models) && snapshot.models.length) return snapshot.models;
      const { data, error } = await supabase.functions.invoke(FN_BY_PROVIDER[provider], {
        method: "GET",
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return (data.models ?? []) as ProviderModel[];
    },
  });
}
