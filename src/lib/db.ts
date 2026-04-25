import { seedDatabase } from "./seed";

export type BrandKey = "flexitol" | "kapiva" | "nada" | "abc";

export interface Product {
  id: string;
  brand: BrandKey;
  name: string;
  category: string;
  price: number;
  shortDescription: string;
  longDescription: string;
  mainImage: string; // image id or data URL
  gallery: string[]; // image ids or data URLs
  ingredients: string[];
  benefits: string[];
  usage: string;
  size: string;
  sku: string;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  featured: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  phone?: string;
  brand?: BrandKey | "curemed";
  subject: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export interface Subscriber {
  id: string;
  email: string;
  createdAt: number;
}

const KEYS = {
  products: "curemed.db.products",
  messages: "curemed.db.messages",
  subscribers: "curemed.db.subscribers",
  seeded: "curemed.db.seeded.v1",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("curemed-db-change", { detail: { key } }));
  } catch (e) {
    console.error("DB write failed (storage may be full):", e);
    throw e;
  }
}

export const id = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ===== Products ===== */
export const products = {
  list: (): Product[] => read<Product[]>(KEYS.products, []),
  byBrand: (brand: BrandKey) => products.list().filter((p) => p.brand === brand),
  featured: () => products.list().filter((p) => p.featured),
  get: (pid: string) => products.list().find((p) => p.id === pid) || null,
  create: (data: Omit<Product, "id" | "createdAt" | "updatedAt">): Product => {
    const now = Date.now();
    const item: Product = { ...data, id: id(), createdAt: now, updatedAt: now };
    write(KEYS.products, [item, ...products.list()]);
    return item;
  },
  update: (pid: string, patch: Partial<Product>) => {
    const list = products.list().map((p) =>
      p.id === pid ? { ...p, ...patch, updatedAt: Date.now() } : p,
    );
    write(KEYS.products, list);
    return products.get(pid);
  },
  remove: (pid: string) => {
    write(KEYS.products, products.list().filter((p) => p.id !== pid));
  },
};

/* ===== Messages ===== */
export const messages = {
  list: (): Message[] =>
    read<Message[]>(KEYS.messages, []).sort((a, b) => b.createdAt - a.createdAt),
  get: (mid: string) => messages.list().find((m) => m.id === mid) || null,
  unreadCount: () => messages.list().filter((m) => !m.read).length,
  create: (data: Omit<Message, "id" | "createdAt" | "read">) => {
    const item: Message = { ...data, id: id(), createdAt: Date.now(), read: false };
    write(KEYS.messages, [item, ...messages.list()]);
    return item;
  },
  setRead: (mid: string, read: boolean) => {
    write(
      KEYS.messages,
      messages.list().map((m) => (m.id === mid ? { ...m, read } : m)),
    );
  },
  remove: (mid: string) => {
    write(KEYS.messages, messages.list().filter((m) => m.id !== mid));
  },
  removeMany: (ids: string[]) => {
    write(KEYS.messages, messages.list().filter((m) => !ids.includes(m.id)));
  },
};

/* ===== Subscribers ===== */
export const subscribers = {
  list: (): Subscriber[] =>
    read<Subscriber[]>(KEYS.subscribers, []).sort((a, b) => b.createdAt - a.createdAt),
  add: (email: string) => {
    const existing = subscribers.list().find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
    const item: Subscriber = { id: id(), email, createdAt: Date.now() };
    write(KEYS.subscribers, [item, ...subscribers.list()]);
    return item;
  },
  remove: (sid: string) => {
    write(KEYS.subscribers, subscribers.list().filter((s) => s.id !== sid));
  },
};

/* ===== Init / Reset ===== */
export function ensureSeeded() {
  if (localStorage.getItem(KEYS.seeded)) return;
  const seed = seedDatabase();
  write(KEYS.products, seed.products);
  write(KEYS.messages, seed.messages);
  write(KEYS.subscribers, seed.subscribers);
  localStorage.setItem(KEYS.seeded, "1");
}

export function resetSampleData() {
  const seed = seedDatabase();
  write(KEYS.products, seed.products);
  write(KEYS.messages, seed.messages);
  write(KEYS.subscribers, seed.subscribers);
  localStorage.setItem(KEYS.seeded, "1");
}

export function useDbVersion() {
  // tiny hook: forces re-render on db change
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require("react") as typeof import("react");
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    const handler = () => setV((x) => x + 1);
    window.addEventListener("curemed-db-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("curemed-db-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return v;
}