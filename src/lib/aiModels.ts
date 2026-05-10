import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { toast } from "sonner";

// AI model selection is stored server-side in `site_settings` so the same
// chain is used by every browser, every origin (preview vs production),
// and most importantly by the edge function itself. localStorage was
// previously used here but it is per-origin/per-browser, which caused
// the edge function to fall back to defaults (e.g. openai/gpt-4o-mini)
// when the live site had no saved selection.

const SETTINGS_KEY = "ai_import_models";

export const DEFAULT_AI_MODELS: [string, string, string] = [
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku",
];

export const SLOT_LABELS = [
  "Primary AI model",
  "Fallback model #2",
  "Fallback model #3",
] as const;

// Kept for backwards-compatibility with any older imports — no longer used.
export const AI_MODEL_STORAGE_KEYS = [
  "ai-import-model",
  "ai-import-model-2",
  "ai-import-model-3",
] as const;

const CHANGE_EVENT = "ai-models-changed";

let cache: [string, string, string] | null = null;
let inflight: Promise<[string, string, string]> | null = null;

function normalize(value: unknown): [string, string, string] {
  if (Array.isArray(value)) {
    const arr = value.map((v) => (typeof v === "string" ? v : "")).filter((v) => v.length > 0);
    return [
      arr[0] || DEFAULT_AI_MODELS[0],
      arr[1] || DEFAULT_AI_MODELS[1],
      arr[2] || DEFAULT_AI_MODELS[2],
    ];
  }
  return [...DEFAULT_AI_MODELS] as [string, string, string];
}

async function fetchFromDb(): Promise<[string, string, string]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) {
      console.error("[aiModels] load failed:", error.message);
      return [...DEFAULT_AI_MODELS] as [string, string, string];
    }
    return normalize((data as any)?.value);
  })();
  try {
    const result = await inflight;
    cache = result;
    return result;
  } finally {
    inflight = null;
  }
}

function broadcast() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Synchronous getter — returns cached value or defaults until the DB load
 * completes. Use the `useAiModels` hook in components instead when possible.
 */
export function getAiModels(): [string, string, string] {
  return cache ?? ([...DEFAULT_AI_MODELS] as [string, string, string]);
}

export function useAiModels() {
  const [models, setModels] = useState<[string, string, string]>(
    () => cache ?? ([...DEFAULT_AI_MODELS] as [string, string, string]),
  );
  const [loading, setLoading] = useState<boolean>(cache === null);

  useEffect(() => {
    let active = true;
    fetchFromDb().then((m) => {
      if (!active) return;
      setModels(m);
      setLoading(false);
    });
    const refresh = () => {
      if (cache) setModels(cache);
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  const persist = useCallback(async (next: [string, string, string]) => {
    cache = next;
    setModels(next);
    broadcast();
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTINGS_KEY, value: next as unknown as any }, { onConflict: "key" });
    if (error) {
      toast.error(`Failed to save model selection: ${error.message}`);
      // Re-fetch authoritative state from DB.
      const fresh = await fetchFromDb();
      setModels(fresh);
      broadcast();
    } else {
      toast.success("AI model selection saved");
    }
  }, []);

  const setModelAt = useCallback(
    (slot: 0 | 1 | 2, id: string) => {
      const next = [...(cache ?? models)] as [string, string, string];
      next[slot] = id;
      void persist(next);
    },
    [models, persist],
  );

  const resetSlot = useCallback(
    (slot: 0 | 1 | 2) => setModelAt(slot, DEFAULT_AI_MODELS[slot]),
    [setModelAt],
  );

  const resetAll = useCallback(() => {
    void persist([...DEFAULT_AI_MODELS] as [string, string, string]);
  }, [persist]);

  return { models, loading, setModelAt, resetSlot, resetAll };
}
