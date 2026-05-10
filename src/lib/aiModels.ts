import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { toast } from "sonner";
import type { Provider, ModelKind } from "./aiProviders";

// Stored in `site_settings.ai_import_models` as:
//   { chat: Slot[], image: Slot[] }   (each array length 3)
// Legacy format (flat string[]) is migrated on read into chat slots
// pinned to the OpenRouter provider.

const SETTINGS_KEY = "ai_import_models";

export interface Slot {
  provider: Provider;
  model: string;
}

export type SlotsByKind = Record<ModelKind, [Slot, Slot, Slot]>;

export const DEFAULT_SLOTS: SlotsByKind = {
  chat: [
    { provider: "openrouter", model: "openai/gpt-4o-mini" },
    { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
    { provider: "openrouter", model: "anthropic/claude-3.5-haiku" },
  ],
  image: [
    { provider: "google", model: "gemini-2.5-flash-image" },
    { provider: "openai", model: "gpt-image-1" },
    { provider: "openrouter", model: "google/gemini-2.5-flash-image" },
  ],
};

export const SLOT_LABELS = [
  "Primary AI model",
  "Fallback model #2",
  "Fallback model #3",
] as const;

const CHANGE_EVENT = "ai-models-changed";

let cache: SlotsByKind | null = null;
let inflight: Promise<SlotsByKind> | null = null;

function clone(s: SlotsByKind): SlotsByKind {
  return {
    chat: [s.chat[0], s.chat[1], s.chat[2]].map((x) => ({ ...x })) as [Slot, Slot, Slot],
    image: [s.image[0], s.image[1], s.image[2]].map((x) => ({ ...x })) as [Slot, Slot, Slot],
  };
}

function normalizeSlot(value: unknown, fallback: Slot): Slot {
  if (value && typeof value === "object") {
    const v = value as any;
    const provider = (["openrouter", "openai", "google"].includes(v.provider) ? v.provider : fallback.provider) as Provider;
    const model = typeof v.model === "string" && v.model ? v.model : fallback.model;
    return { provider, model };
  }
  return { ...fallback };
}

function normalize(value: unknown): SlotsByKind {
  // Legacy: array of strings -> chat slots on openrouter
  if (Array.isArray(value)) {
    const chat = [0, 1, 2].map((i) => {
      const s = typeof value[i] === "string" && value[i] ? (value[i] as string) : DEFAULT_SLOTS.chat[i].model;
      return { provider: "openrouter" as Provider, model: s };
    }) as [Slot, Slot, Slot];
    return { chat, image: clone(DEFAULT_SLOTS).image };
  }
  if (value && typeof value === "object") {
    const v = value as any;
    const chatArr = Array.isArray(v.chat) ? v.chat : [];
    const imgArr = Array.isArray(v.image) ? v.image : [];
    return {
      chat: [0, 1, 2].map((i) => normalizeSlot(chatArr[i], DEFAULT_SLOTS.chat[i])) as [Slot, Slot, Slot],
      image: [0, 1, 2].map((i) => normalizeSlot(imgArr[i], DEFAULT_SLOTS.image[i])) as [Slot, Slot, Slot],
    };
  }
  return clone(DEFAULT_SLOTS);
}

async function fetchFromDb(): Promise<SlotsByKind> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) {
      console.error("[aiModels] load failed:", error.message);
      return clone(DEFAULT_SLOTS);
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

export function useAiModels() {
  const [slots, setSlots] = useState<SlotsByKind>(() => cache ?? clone(DEFAULT_SLOTS));
  const [loading, setLoading] = useState<boolean>(cache === null);

  useEffect(() => {
    let active = true;
    fetchFromDb().then((m) => {
      if (!active) return;
      setSlots(m);
      setLoading(false);
    });
    const refresh = () => {
      if (cache) setSlots(clone(cache));
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  const persist = useCallback(async (next: SlotsByKind) => {
    cache = next;
    setSlots(clone(next));
    broadcast();
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTINGS_KEY, value: next as unknown as any }, { onConflict: "key" });
    if (error) {
      toast.error(`Failed to save model selection: ${error.message}`);
      const fresh = await fetchFromDb();
      setSlots(clone(fresh));
      broadcast();
    } else {
      toast.success("AI model selection saved");
    }
  }, []);

  const setSlot = useCallback(
    (kind: ModelKind, index: 0 | 1 | 2, value: Slot) => {
      const next = clone(cache ?? slots);
      next[kind][index] = value;
      void persist(next);
    },
    [slots, persist],
  );

  const resetSlot = useCallback(
    (kind: ModelKind, index: 0 | 1 | 2) => {
      const next = clone(cache ?? slots);
      next[kind][index] = { ...DEFAULT_SLOTS[kind][index] };
      void persist(next);
    },
    [slots, persist],
  );

  const resetAll = useCallback(() => {
    void persist(clone(DEFAULT_SLOTS));
  }, [persist]);

  return { slots, loading, setSlot, resetSlot, resetAll };
}
