import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { toast } from "sonner";

const SETTINGS_KEY = "ai_upscale_prompt";

export const DEFAULT_UPSCALE_PROMPT =
  "Upscale this product image to a higher resolution. Preserve every product detail exactly: shape, colors, packaging text, logos, branding, materials, lighting and background. Do NOT add, remove, restyle or reinterpret anything. Output a clean, sharp, photorealistic version of the same image at a larger size.";

let cache: string | null = null;
let inflight: Promise<string> | null = null;

async function fetchFromDb(): Promise<string> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    const v = (data as any)?.value;
    return typeof v === "string" && v.trim() ? v : DEFAULT_UPSCALE_PROMPT;
  })();
  try {
    cache = await inflight;
    return cache;
  } finally {
    inflight = null;
  }
}

export function useUpscalePrompt() {
  const [prompt, setPrompt] = useState<string>(cache ?? DEFAULT_UPSCALE_PROMPT);
  const [loading, setLoading] = useState<boolean>(cache === null);

  useEffect(() => {
    let active = true;
    fetchFromDb().then((p) => {
      if (!active) return;
      setPrompt(p);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = useCallback(async (next: string) => {
    const value = next.trim() || DEFAULT_UPSCALE_PROMPT;
    cache = value;
    setPrompt(value);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTINGS_KEY, value: value as unknown as any }, { onConflict: "key" });
    if (error) {
      toast.error(`Failed to save prompt: ${error.message}`);
    } else {
      toast.success("Upscaling prompt saved");
    }
  }, []);

  const reset = useCallback(() => {
    void save(DEFAULT_UPSCALE_PROMPT);
  }, [save]);

  return { prompt, loading, save, reset };
}
