import { useEffect, useState } from "react";

export const AI_MODEL_STORAGE_KEYS = [
  "ai-import-model",
  "ai-import-model-2",
  "ai-import-model-3",
] as const;

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

const CHANGE_EVENT = "ai-models-changed";

export function getAiModels(): [string, string, string] {
  if (typeof window === "undefined") return [...DEFAULT_AI_MODELS] as [string, string, string];
  return [
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[0]) || DEFAULT_AI_MODELS[0],
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[1]) || DEFAULT_AI_MODELS[1],
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[2]) || DEFAULT_AI_MODELS[2],
  ];
}

function broadcast() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useAiModels() {
  const [models, setModels] = useState<[string, string, string]>(() => getAiModels());

  useEffect(() => {
    const refresh = () => setModels(getAiModels());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const setModelAt = (slot: 0 | 1 | 2, id: string) => {
    localStorage.setItem(AI_MODEL_STORAGE_KEYS[slot], id);
    setModels((prev) => {
      const next = [...prev] as [string, string, string];
      next[slot] = id;
      return next;
    });
    broadcast();
  };

  const resetSlot = (slot: 0 | 1 | 2) => setModelAt(slot, DEFAULT_AI_MODELS[slot]);

  const resetAll = () => {
    AI_MODEL_STORAGE_KEYS.forEach((k, i) => localStorage.setItem(k, DEFAULT_AI_MODELS[i]));
    setModels([...DEFAULT_AI_MODELS] as [string, string, string]);
    broadcast();
  };

  return { models, setModelAt, resetSlot, resetAll };
}