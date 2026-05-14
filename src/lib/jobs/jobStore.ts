import { useEffect, useState, useSyncExternalStore } from "react";

type Listener = () => void;

export interface JobStore<TJob extends { status: string }> {
  get(key: string): TJob | undefined;
  set(key: string, job: TJob): void;
  update(key: string, patch: Partial<TJob>): void;
  remove(key: string): void;
  subscribe(key: string, l: Listener): () => void;
  subscribeAll(l: Listener): () => void;
  keys(): string[];
  all(): Array<[string, TJob]>;
}

export function createJobStore<TJob extends { status: string }>(opts: {
  storageKey: string;
  /** Called for any job persisted with an "in-flight" status when the page reloads. */
  onInterruptedReload?: (job: TJob) => TJob;
}): JobStore<TJob> {
  const map = new Map<string, TJob>();
  const listeners = new Map<string, Set<Listener>>();
  const globalListeners = new Set<Listener>();

  // Load persisted state
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(opts.storageKey) : null;
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, TJob>;
      for (const [k, v] of Object.entries(obj)) {
        const job = opts.onInterruptedReload ? opts.onInterruptedReload(v) : v;
        map.set(k, job);
      }
    }
  } catch {
    // ignore
  }

  function persist() {
    try {
      const obj: Record<string, TJob> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(opts.storageKey, JSON.stringify(obj));
    } catch {
      // ignore quota / SSR
    }
  }

  function notify(key: string) {
    listeners.get(key)?.forEach((l) => l());
    globalListeners.forEach((l) => l());
  }

  return {
    get: (key) => map.get(key),
    set(key, job) {
      map.set(key, job);
      persist();
      notify(key);
    },
    update(key, patch) {
      const cur = map.get(key);
      if (!cur) return;
      map.set(key, { ...cur, ...patch });
      persist();
      notify(key);
    },
    remove(key) {
      map.delete(key);
      persist();
      notify(key);
    },
    subscribe(key, l) {
      let s = listeners.get(key);
      if (!s) {
        s = new Set();
        listeners.set(key, s);
      }
      s.add(l);
      return () => {
        s!.delete(l);
      };
    },
    subscribeAll(l) {
      globalListeners.add(l);
      return () => {
        globalListeners.delete(l);
      };
    },
    keys: () => Array.from(map.keys()),
    all: () => Array.from(map.entries()),
  };
}

export function useJob<T extends { status: string }>(
  store: JobStore<T>,
  key: string | null | undefined,
): T | undefined {
  const subscribe = (cb: () => void) => (key ? store.subscribe(key, cb) : () => {});
  const getSnapshot = () => (key ? store.get(key) : undefined);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Re-renders the calling component every `intervalMs`, plus immediately on tab visibility change. */
export function useTick(intervalMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((n) => n + 1);
    const id = window.setInterval(bump, intervalMs);
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, [intervalMs]);
}

/** Tiny stable hash (FNV-1a) for keying jobs by content. */
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
