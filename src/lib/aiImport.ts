import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScrapeResult {
  markdown: string;
  title: string;
  sourceUrl: string;
  images: string[];
}

export interface ExtractedFields {
  name: string;
  brand: "flexitol" | "kapiva" | "nada" | "abc";
  category: string;
  price: number;
  shortDescription: string;
  longDescription: string;
  size: string;
  sku: string;
  ingredients: string[];
  benefits: string[];
  usage: string;
}

export interface ExtractResult {
  fields: ExtractedFields;
  usedModel: string;
  primaryModel: string;
  attempts: Array<{ model: string; status: number; reason: string }>;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing: { prompt?: string; completion?: string } | null;
}

export async function scrapeProductUrl(url: string): Promise<ScrapeResult> {
  const { data, error } = await supabase.functions.invoke("scrape-product", {
    body: { url },
  });
  if (error) throw new Error((data as any)?.error || error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as ScrapeResult;
}

export async function extractProductFields(args: {
  markdown: string;
  sourceUrl: string;
  model: string;
  fallbackModels?: string[];
}): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke("extract-product", {
    body: args,
  });
  if (error) throw new Error((data as any)?.error || error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  const d = data as any;
  return {
    fields: d.fields as ExtractedFields,
    usedModel: d.model as string,
    primaryModel: (d.primaryModel as string) ?? args.model,
    attempts: (d.attempts as ExtractResult["attempts"]) ?? [],
  };
}

export function useOpenRouterModels() {
  return useQuery({
    queryKey: ["openrouter-models"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("openrouter-models", {
        method: "GET" as any,
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any).models ?? []) as OpenRouterModel[];
    },
  });
}