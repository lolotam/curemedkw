import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandKey = "flexitol" | "kapiva" | "nada" | "abc";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

/* ============================================================
 * Domain types (camelCase) + DB row mappers
 * ============================================================ */

export interface Product {
  id: string;
  brand: BrandKey;
  name: string;
  category: string;
  price: number;
  shortDescription: string;
  longDescription: string;
  mainImage: string;
  gallery: string[];
  ingredients: string[];
  benefits: string[];
  usage: string;
  size: string;
  sku: string;
  stockStatus: StockStatus;
  featured: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  brand: BrandKey | "curemed" | null;
  subject: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  createdAt: string;
}

type ProductRow = {
  id: string; brand: BrandKey; name: string; category: string; price: number;
  short_description: string; long_description: string; main_image: string;
  gallery: string[]; ingredients: string[]; benefits: string[]; usage: string;
  size: string; sku: string; stock_status: StockStatus; featured: boolean;
  tags: string[]; created_at: string; updated_at: string;
};

const rowToProduct = (r: ProductRow): Product => ({
  id: r.id,
  brand: r.brand,
  name: r.name,
  category: r.category,
  price: Number(r.price),
  shortDescription: r.short_description,
  longDescription: r.long_description,
  mainImage: r.main_image,
  gallery: r.gallery ?? [],
  ingredients: r.ingredients ?? [],
  benefits: r.benefits ?? [],
  usage: r.usage,
  size: r.size,
  sku: r.sku,
  stockStatus: r.stock_status,
  featured: r.featured,
  tags: r.tags ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;

const productToRow = (p: Partial<ProductInput>): Partial<ProductRow> => {
  const out: any = {};
  if (p.brand !== undefined) out.brand = p.brand;
  if (p.name !== undefined) out.name = p.name;
  if (p.category !== undefined) out.category = p.category;
  if (p.price !== undefined) out.price = p.price;
  if (p.shortDescription !== undefined) out.short_description = p.shortDescription;
  if (p.longDescription !== undefined) out.long_description = p.longDescription;
  if (p.mainImage !== undefined) out.main_image = p.mainImage;
  if (p.gallery !== undefined) out.gallery = p.gallery;
  if (p.ingredients !== undefined) out.ingredients = p.ingredients;
  if (p.benefits !== undefined) out.benefits = p.benefits;
  if (p.usage !== undefined) out.usage = p.usage;
  if (p.size !== undefined) out.size = p.size;
  if (p.sku !== undefined) out.sku = p.sku;
  if (p.stockStatus !== undefined) out.stock_status = p.stockStatus;
  if (p.featured !== undefined) out.featured = p.featured;
  if (p.tags !== undefined) out.tags = p.tags;
  return out;
};

/* ============================================================
 * Query keys
 * ============================================================ */

export const qk = {
  products: ["products"] as const,
  product: (id: string) => ["products", id] as const,
  productsByBrand: (b: BrandKey) => ["products", "brand", b] as const,
  productsFeatured: ["products", "featured"] as const,
  messages: ["messages"] as const,
  unreadCount: ["messages", "unread"] as const,
  subscribers: ["subscribers"] as const,
};

/* ============================================================
 * Products
 * ============================================================ */

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ProductRow[]).map(rowToProduct);
    },
  });
}

export function useProductsByBrand(brand: BrandKey) {
  return useQuery({
    queryKey: qk.productsByBrand(brand),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("brand", brand)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as ProductRow[]).map(rowToProduct);
    },
  });
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: qk.productsFeatured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("featured", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ProductRow[]).map(rowToProduct);
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: qk.product(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? rowToProduct(data as ProductRow) : null;
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const row = productToRow(input);
      const { data, error } = await supabase
        .from("products").insert(row as any).select("*").single();
      if (error) throw error;
      return rowToProduct(data as ProductRow);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.products }); qc.invalidateQueries({ queryKey: qk.productsFeatured }); },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductInput> }) => {
      const { data, error } = await supabase
        .from("products").update(productToRow(patch) as any).eq("id", id).select("*").single();
      if (error) throw error;
      return rowToProduct(data as ProductRow);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.product(vars.id) });
      qc.invalidateQueries({ queryKey: qk.productsFeatured });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.products }); qc.invalidateQueries({ queryKey: qk.productsFeatured }); },
  });
}

/* ============================================================
 * Image uploads (product-images bucket)
 * ============================================================ */

export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

/* ============================================================
 * Messages
 * ============================================================ */

type MessageRow = {
  id: string; name: string; email: string; phone: string | null;
  brand: string | null; subject: string; message: string;
  read: boolean; created_at: string;
};
const rowToMessage = (r: MessageRow): Message => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone,
  brand: (r.brand as Message["brand"]) ?? null,
  subject: r.subject, message: r.message, read: r.read, createdAt: r.created_at,
});

export function useMessages() {
  return useQuery({
    queryKey: qk.messages,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as MessageRow[]).map(rowToMessage);
    },
  });
}

export function useUnreadMessageCount() {
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("messages").select("*", { count: "exact", head: true }).eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export interface MessageInput {
  name: string; email: string; phone?: string;
  brand?: BrandKey | "curemed"; subject: string; message: string;
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MessageInput) => {
      const { error } = await supabase.from("messages").insert({
        name: input.name, email: input.email, phone: input.phone ?? null,
        brand: input.brand ?? null, subject: input.subject, message: input.message,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.messages }); qc.invalidateQueries({ queryKey: qk.unreadCount }); },
  });
}

export function useMarkMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const { error } = await supabase.from("messages").update({ read }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.messages }); qc.invalidateQueries({ queryKey: qk.unreadCount }); },
  });
}

export function useDeleteMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("messages").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.messages }); qc.invalidateQueries({ queryKey: qk.unreadCount }); },
  });
}

/* ============================================================
 * Subscribers
 * ============================================================ */

type SubscriberRow = { id: string; email: string; created_at: string };
const rowToSubscriber = (r: SubscriberRow): Subscriber => ({
  id: r.id, email: r.email, createdAt: r.created_at,
});

export function useSubscribers() {
  return useQuery({
    queryKey: qk.subscribers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscribers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as SubscriberRow[]).map(rowToSubscriber);
    },
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from("subscribers").insert({ email });
      // Unique-constraint violation = already subscribed; treat as success
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.subscribers }); },
  });
}

export function useDeleteSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscribers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.subscribers }); },
  });
}