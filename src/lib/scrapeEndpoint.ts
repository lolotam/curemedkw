import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { toast } from "sonner";

export type ScrapeEndpoint = "self-hosted" | "cloud";

const SETTINGS_KEY = "scrape_endpoint";
export const DEFAULT_SCRAPE_ENDPOINT: ScrapeEndpoint = "self-hosted";

let cache: ScrapeEndpoint | null = null;

async function fetchFromDb(): Promise<ScrapeEndpoint> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const v = (data as any)?.value;
  if (v === "cloud" || v === "self-hosted") return v as ScrapeEndpoint;
  return DEFAULT_SCRAPE_ENDPOINT;
}

export function useScrapeEndpoint() {
  const [endpoint, setEndpoint] = useState<ScrapeEndpoint>(cache ?? DEFAULT_SCRAPE_ENDPOINT);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let active = true;
    fetchFromDb().then((v) => {
      if (!active) return;
      cache = v;
      setEndpoint(v);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = useCallback(async (next: ScrapeEndpoint) => {
    cache = next;
    setEndpoint(next);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTINGS_KEY, value: next as unknown as any }, { onConflict: "key" });
    if (error) {
      toast.error(`Failed to save endpoint: ${error.message}`);
    } else {
      toast.success(next === "cloud" ? "Now using Cloud Firecrawl API" : "Now using self-hosted Firecrawl");
    }
  }, []);

  return { endpoint, loading, save };
}
