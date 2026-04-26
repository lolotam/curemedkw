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
  categoryId: string | null;
  categoryIds: string[];
  price: number;
  originalPrice: number | null;
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
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
  // Arabic translations
  nameAr: string;
  categoryAr: string;
  shortDescriptionAr: string;
  longDescriptionAr: string;
  usageAr: string;
  benefitsAr: string[];
  ingredientsAr: string[];
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
  category_id: string | null;
  original_price: number | null;
  source_url: string;
  name_ar: string;
  category_ar: string;
  short_description_ar: string;
  long_description_ar: string;
  usage_ar: string;
  benefits_ar: string[];
  ingredients_ar: string[];
};

const rowToProduct = (r: ProductRow): Product => ({
  id: r.id,
  brand: r.brand,
  name: r.name,
  category: r.category,
  categoryId: r.category_id ?? null,
  categoryIds: [],
  price: Number(r.price),
  originalPrice: r.original_price === null || r.original_price === undefined ? null : Number(r.original_price),
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
  sourceUrl: r.source_url ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  nameAr: r.name_ar ?? "",
  categoryAr: r.category_ar ?? "",
  shortDescriptionAr: r.short_description_ar ?? "",
  longDescriptionAr: r.long_description_ar ?? "",
  usageAr: r.usage_ar ?? "",
  benefitsAr: r.benefits_ar ?? [],
  ingredientsAr: r.ingredients_ar ?? [],
});

export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;

const productToRow = (p: Partial<ProductInput>): Partial<ProductRow> => {
  const out: any = {};
  if (p.brand !== undefined) out.brand = p.brand;
  if (p.name !== undefined) out.name = p.name;
  if (p.category !== undefined) out.category = p.category;
  if (p.categoryId !== undefined) out.category_id = p.categoryId;
  if (p.price !== undefined) out.price = p.price;
  if (p.originalPrice !== undefined) out.original_price = p.originalPrice;
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
  if (p.sourceUrl !== undefined) out.source_url = p.sourceUrl;
  if (p.nameAr !== undefined) out.name_ar = p.nameAr;
  if (p.categoryAr !== undefined) out.category_ar = p.categoryAr;
  if (p.shortDescriptionAr !== undefined) out.short_description_ar = p.shortDescriptionAr;
  if (p.longDescriptionAr !== undefined) out.long_description_ar = p.longDescriptionAr;
  if (p.usageAr !== undefined) out.usage_ar = p.usageAr;
  if (p.benefitsAr !== undefined) out.benefits_ar = p.benefitsAr;
  if (p.ingredientsAr !== undefined) out.ingredients_ar = p.ingredientsAr;
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
  productsDiscounted: ["products", "discounted"] as const,
  productsByCategory: (id: string) => ["products", "category", id] as const,
  messages: ["messages"] as const,
  unreadCount: ["messages", "unread"] as const,
  subscribers: ["subscribers"] as const,
  categories: ["categories"] as const,
  category: (slug: string) => ["categories", "slug", slug] as const,
  tags: ["tags"] as const,
  testimonials: ["testimonials"] as const,
};

/* ============================================================
 * Products
 * ============================================================ */

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: async () => {
      const [{ data, error }, { data: links, error: linkErr }] = await Promise.all([
        supabase.from("products").select("*").order("updated_at", { ascending: false }),
        supabase.from("product_categories").select("product_id, category_id"),
      ]);
      if (error) throw error;
      if (linkErr) throw linkErr;
      const linkMap = new Map<string, string[]>();
      for (const l of (links ?? []) as { product_id: string; category_id: string }[]) {
        const arr = linkMap.get(l.product_id) ?? [];
        arr.push(l.category_id);
        linkMap.set(l.product_id, arr);
      }
      return (data as ProductRow[]).map((r) => {
        const p = rowToProduct(r);
        const ids = linkMap.get(p.id) ?? (p.categoryId ? [p.categoryId] : []);
        return { ...p, categoryIds: ids };
      });
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
      const products = (data as ProductRow[]).map(rowToProduct);
      const ids = products.map((p) => p.id);
      if (!ids.length) return products;
      const { data: links, error: linkErr } = await supabase
        .from("product_categories")
        .select("product_id, category_id")
        .in("product_id", ids);
      if (linkErr) throw linkErr;
      const linkMap = new Map<string, string[]>();
      for (const l of (links ?? []) as { product_id: string; category_id: string }[]) {
        const arr = linkMap.get(l.product_id) ?? [];
        arr.push(l.category_id);
        linkMap.set(l.product_id, arr);
      }
      return products.map((p) => ({
        ...p,
        categoryIds: linkMap.get(p.id) ?? (p.categoryId ? [p.categoryId] : []),
      }));
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

export function useDiscountedProducts() {
  return useQuery({
    queryKey: qk.productsDiscounted,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .not("original_price", "is", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ProductRow[])
        .map(rowToProduct)
        .filter((p) => (p.originalPrice ?? 0) > p.price && p.price > 0);
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
      if (!data) return null;
      const product = rowToProduct(data as ProductRow);
      const { data: links, error: linkErr } = await supabase
        .from("product_categories")
        .select("category_id")
        .eq("product_id", id!);
      if (linkErr) throw linkErr;
      const ids = (links ?? []).map((l: any) => l.category_id as string);
      return {
        ...product,
        categoryIds: ids.length ? ids : (product.categoryId ? [product.categoryId] : []),
      };
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const ids = input.categoryIds ?? [];
      // Keep legacy primary category_id in sync (first selected, or existing value)
      const primary = ids[0] ?? input.categoryId ?? null;
      const row = productToRow({ ...input, categoryId: primary });
      const { data, error } = await supabase
        .from("products").insert(row as any).select("*").single();
      if (error) throw error;
      const product = rowToProduct(data as ProductRow);
      if (ids.length) {
        const rows = ids.map((cid) => ({ product_id: product.id, category_id: cid }));
        const { error: linkErr } = await supabase.from("product_categories").insert(rows);
        if (linkErr) throw linkErr;
      }
      // Sync any new tags into the master tags table
      await syncProductTags(input.tags ?? []);
      return { ...product, categoryIds: ids };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.productsFeatured });
      qc.invalidateQueries({ queryKey: qk.tags });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductInput> }) => {
      const ids = patch.categoryIds;
      const patchToWrite =
        ids !== undefined
          ? { ...patch, categoryId: ids[0] ?? null }
          : patch;
      const { data, error } = await supabase
        .from("products").update(productToRow(patchToWrite) as any).eq("id", id).select("*").single();
      if (error) throw error;
      const product = rowToProduct(data as ProductRow);
      if (ids !== undefined) {
        // Replace the full set
        const { error: delErr } = await supabase
          .from("product_categories").delete().eq("product_id", id);
        if (delErr) throw delErr;
        if (ids.length) {
          const rows = ids.map((cid) => ({ product_id: id, category_id: cid }));
          const { error: insErr } = await supabase.from("product_categories").insert(rows);
          if (insErr) throw insErr;
        }
        // Sync tags too if they were part of the patch
        if (patch.tags !== undefined) await syncProductTags(patch.tags);
        return { ...product, categoryIds: ids };
      }
      if (patch.tags !== undefined) await syncProductTags(patch.tags);
      return product;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.product(vars.id) });
      qc.invalidateQueries({ queryKey: qk.productsFeatured });
      qc.invalidateQueries({ queryKey: qk.tags });
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

export function useBulkDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.productsFeatured });
    },
  });
}

export function useProductsByCategory(categoryId: string | undefined) {
  return useQuery({
    queryKey: categoryId ? qk.productsByCategory(categoryId) : ["products", "category", "none"],
    enabled: !!categoryId,
    queryFn: async () => {
      // Prefer the junction table so multi-category products show up under each category
      const { data: links, error: linkErr } = await supabase
        .from("product_categories")
        .select("product_id")
        .eq("category_id", categoryId!);
      if (linkErr) throw linkErr;
      const productIds = Array.from(new Set((links ?? []).map((l: any) => l.product_id as string)));
      if (!productIds.length) return [] as Product[];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ProductRow[]).map(rowToProduct);
    },
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
 * Categories
 * ============================================================ */

export interface Category {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
  visiblePages: string[];
  createdAt: string;
  updatedAt: string;
}

type CategoryRow = {
  id: string; slug: string; name_en: string; name_ar: string;
  image_url: string; sort_order: number; is_active: boolean;
  created_at: string; updated_at: string;
  parent_id: string | null;
  visible_pages: string[];
};

const rowToCategory = (r: CategoryRow): Category => ({
  id: r.id,
  slug: r.slug,
  nameEn: r.name_en,
  nameAr: r.name_ar,
  imageUrl: r.image_url,
  sortOrder: r.sort_order,
  isActive: r.is_active,
  parentId: r.parent_id ?? null,
  visiblePages: r.visible_pages ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type CategoryInput = Omit<Category, "id" | "createdAt" | "updatedAt">;

const categoryToRow = (c: Partial<CategoryInput>): Partial<CategoryRow> => {
  const out: any = {};
  if (c.slug !== undefined) out.slug = c.slug;
  if (c.nameEn !== undefined) out.name_en = c.nameEn;
  if (c.nameAr !== undefined) out.name_ar = c.nameAr;
  if (c.imageUrl !== undefined) out.image_url = c.imageUrl;
  if (c.sortOrder !== undefined) out.sort_order = c.sortOrder;
  if (c.isActive !== undefined) out.is_active = c.isActive;
  if (c.parentId !== undefined) out.parent_id = c.parentId;
  if (c.visiblePages !== undefined) out.visible_pages = c.visiblePages;
  return out;
};

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true });
      if (error) throw error;
      return (data as CategoryRow[]).map(rowToCategory);
    },
  });
}

export function useCategoryBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? qk.category(slug) : ["categories", "slug", "none"],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("*").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data ? rowToCategory(data as CategoryRow) : null;
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        .from("categories").insert(categoryToRow(input) as any).select("*").single();
      if (error) throw error;
      return rowToCategory(data as CategoryRow);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CategoryInput> }) => {
      const { data, error } = await supabase
        .from("categories").update(categoryToRow(patch) as any).eq("id", id).select("*").single();
      if (error) throw error;
      return rowToCategory(data as CategoryRow);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export function useBulkDeleteCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("categories").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export async function uploadCategoryImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("category-images")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("category-images").getPublicUrl(path).data.publicUrl;
}

export const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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

/* ============================================================
 * Tags
 * ============================================================ */

export interface Tag {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

type TagRow = { id: string; name: string; slug: string; created_at: string };
const rowToTag = (r: TagRow): Tag => ({ id: r.id, name: r.name, slug: r.slug, createdAt: r.created_at });

export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data as TagRow[]).map(rowToTag);
    },
  });
}

export function useUpsertTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Empty tag name");
      const slug = slugify(name);
      const { data, error } = await supabase
        .from("tags").upsert({ name, slug }, { onConflict: "slug" }).select("*").single();
      if (error) throw error;
      return rowToTag(data as TagRow);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.tags }); },
  });
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oldName, newName }: { id: string; oldName: string; newName: string }) => {
      const name = newName.trim();
      if (!name) throw new Error("Empty tag name");
      const slug = slugify(name);
      const { error } = await supabase.from("tags").update({ name, slug }).eq("id", id);
      if (error) throw error;
      // Replace in every product's tags array (client-side rewrite)
      const { data: products, error: pErr } = await supabase
        .from("products").select("id, tags").contains("tags", [oldName]);
      if (pErr) throw pErr;
      for (const p of (products ?? []) as { id: string; tags: string[] }[]) {
        const next = (p.tags ?? []).map((t) => (t === oldName ? name : t));
        await supabase.from("products").update({ tags: next }).eq("id", p.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tags });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
      // Strip from products
      const { data: products, error: pErr } = await supabase
        .from("products").select("id, tags").contains("tags", [name]);
      if (pErr) throw pErr;
      for (const p of (products ?? []) as { id: string; tags: string[] }[]) {
        const next = (p.tags ?? []).filter((t) => t !== name);
        await supabase.from("products").update({ tags: next }).eq("id", p.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tags });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

/* ============================================================
 * Testimonials
 * ============================================================ */

export interface Testimonial {
  id: string;
  nameEn: string; nameAr: string;
  roleEn: string; roleAr: string;
  quoteEn: string; quoteAr: string;
  gender: "m" | "f";
  location: string;
  sortOrder: number;
  isActive: boolean;
}

type TestimonialRow = {
  id: string; name_en: string; name_ar: string;
  role_en: string; role_ar: string;
  quote_en: string; quote_ar: string;
  gender: string; location: string;
  sort_order: number; is_active: boolean;
};
const rowToTestimonial = (r: TestimonialRow): Testimonial => ({
  id: r.id,
  nameEn: r.name_en, nameAr: r.name_ar,
  roleEn: r.role_en, roleAr: r.role_ar,
  quoteEn: r.quote_en, quoteAr: r.quote_ar,
  gender: (r.gender === "f" ? "f" : "m"),
  location: r.location,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

export function useTestimonials() {
  return useQuery({
    queryKey: qk.testimonials,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials").select("*").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as TestimonialRow[]).map(rowToTestimonial);
    },
  });
}