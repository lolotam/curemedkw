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

export const AI_MODEL_SLOT_LABELS = [
  "Primary AI model",
  "Fallback model #2",
  "Fallback model #3",
] as const;

const CHANGE_EVENT = "ai-models-changed";

export function getAiModels(): [string, string, string] {
  if (typeof window === "undefined") return [...DEFAULT_AI_MODELS];
  return [
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[0]) || DEFAULT_AI_MODELS[0],
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[1]) || DEFAULT_AI_MODELS[1],
    localStorage.getItem(AI_MODEL_STORAGE_KEYS[2]) || DEFAULT_AI_MODELS[2],
  ];
}

export function useAiModels() {
  const [models, setModelsState] = useState<[string, string, string]>(() => getAiModels());

  useEffect(() => {
    const reload = () => setModelsState(getAiModels());
    window.addEventListener("storage", reload);
    window.addEventListener(CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(CHANGE_EVENT, reload);
    };
  }, []);

  const setModelAt = (slot: 0 | 1 | 2, id: string) => {
    const next = [...getAiModels()] as [string, string, string];
    next[slot] = id;
    localStorage.setItem(AI_MODEL_STORAGE_KEYS[slot], id);
    setModelsState(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const resetSlot = (slot: 0 | 1 | 2) => setModelAt(slot, DEFAULT_AI_MODELS[slot]);

  const resetAll = () => {
    DEFAULT_AI_MODELS.forEach((m, i) => localStorage.setItem(AI_MODEL_STORAGE_KEYS[i], m));
    setModelsState([...DEFAULT_AI_MODELS]);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return { models, setModelAt, resetSlot, resetAll };
}
