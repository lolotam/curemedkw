import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/clientRuntime";

export type Provider = "openrouter" | "openai" | "google" | "anthropic";
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
};

export const PROVIDERS: Provider[] = ["openrouter", "openai", "google", "anthropic"];

const FN_BY_PROVIDER: Record<Provider, string> = {
  openrouter: "openrouter-models",
  openai: "openai-models",
  google: "google-models",
  anthropic: "anthropic-models",
};

export function useProviderModels(provider: Provider) {
  return useQuery({
    queryKey: ["provider-models", provider],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(FN_BY_PROVIDER[provider], {
        method: "GET" as any,
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any).models ?? []) as ProviderModel[];
    },
  });
}
