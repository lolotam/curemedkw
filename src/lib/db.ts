import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/clientRuntime";
import { convertToWebP } from "@/lib/imageConvert";

export type BrandKey =
  | "flexitol"
  | "kapiva"
  | "nada"
  | "abc"
  | "lafes"
  | "hartington"
  | "phytophar"
  | "hualunhongli";
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
  siteSetting: (key: string) => ["site_settings", key] as const,
  productReviews: (productId: string) => ["product_reviews", productId] as const,
  approvedReviews: ["product_reviews", "approved"] as const,
  adminReviews: ["product_reviews", "admin"] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["orders", id] as const,
  profile: (id: string) => ["profile", id] as const,
  myOrders: (uid: string) => ["orders", "mine", uid] as const,
  myNotifications: (uid: string) => ["notifications", "mine", uid] as const,
  notificationsUnread: (uid: string) => ["notifications", "unread", uid] as const,
  coupons: ["coupons"] as const,
  notificationTemplates: ["notification_templates"] as const,
  adminUsers: ["admin", "users"] as const,
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
  const converted = await convertToWebP(file);
  const ext = converted.name.split(".").pop() || "webp";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, converted, { cacheControl: "3600", upsert: false, contentType: converted.type });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a branding image (logo / favicon / per-brand logo) to the
 * public `brands-images` bucket under a `branding/` folder, and returns
 * the public URL. Used by the Admin Branding page.
 */
export async function uploadBrandingImage(file: File, prefix: string): Promise<string> {
  const converted = await convertToWebP(file);
  const ext = (converted.name.split(".").pop() || "webp").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = `branding/${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext || "png"}`;
  const { error } = await supabase.storage
    .from("brands-images")
    .upload(path, converted, { cacheControl: "3600", upsert: false, contentType: converted.type });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("row-level security") || msg.includes("unauthorized") || msg.includes("denied") || msg.includes("403")) {
      throw new Error("Upload denied — make sure you are signed in as an admin.");
    }
    throw error;
  }
  return supabase.storage.from("brands-images").getPublicUrl(path).data.publicUrl;
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
  bannerUrl: string;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
  visiblePages: string[];
  showInCarousel: boolean;
  createdAt: string;
  updatedAt: string;
}

type CategoryRow = {
  id: string; slug: string; name_en: string; name_ar: string;
  image_url: string; banner_url: string;
  sort_order: number; is_active: boolean;
  created_at: string; updated_at: string;
  parent_id: string | null;
  visible_pages: string[];
  show_in_carousel: boolean;
};

const rowToCategory = (r: CategoryRow): Category => ({
  id: r.id,
  slug: r.slug,
  nameEn: r.name_en,
  nameAr: r.name_ar,
  imageUrl: r.image_url,
  bannerUrl: r.banner_url ?? "",
  sortOrder: r.sort_order,
  isActive: r.is_active,
  parentId: r.parent_id ?? null,
  visiblePages: r.visible_pages ?? [],
  showInCarousel: r.show_in_carousel ?? true,
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
  if (c.bannerUrl !== undefined) out.banner_url = c.bannerUrl;
  if (c.sortOrder !== undefined) out.sort_order = c.sortOrder;
  if (c.isActive !== undefined) out.is_active = c.isActive;
  if (c.parentId !== undefined) out.parent_id = c.parentId;
  if (c.visiblePages !== undefined) out.visible_pages = c.visiblePages;
  if (c.showInCarousel !== undefined) out.show_in_carousel = c.showInCarousel;
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
  const converted = await convertToWebP(file);
  const ext = converted.name.split(".").pop() || "webp";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("category-images")
    .upload(path, converted, { cacheControl: "3600", upsert: false, contentType: converted.type });
  if (error) throw error;
  return supabase.storage.from("category-images").getPublicUrl(path).data.publicUrl;
}

export async function uploadCategoryBanner(file: File): Promise<string> {
  const converted = await convertToWebP(file);
  const ext = converted.name.split(".").pop() || "webp";
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("category-images")
    .upload(path, converted, { cacheControl: "3600", upsert: false, contentType: converted.type });
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

/**
 * Idempotently inserts every non-empty tag into the master `tags` table.
 * Safe to call from product create/update flows or from a manual "sync" button.
 */
export async function syncProductTags(tags: string[] | undefined | null): Promise<number> {
  const list = (tags ?? [])
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0);
  if (!list.length) return 0;
  const rows = Array.from(
    new Map(list.map((name) => [slugify(name), { name, slug: slugify(name) }])).values(),
  );
  const { error } = await supabase
    .from("tags")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
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

/* ============================================================
 * Site settings (key/value)
 * ============================================================ */

export interface PriceVisibility {
  global: boolean;
  brands: Record<BrandKey, boolean>;
}

const DEFAULT_PRICE_VISIBILITY: PriceVisibility = {
  global: false,
  brands: {
    flexitol: false,
    kapiva: false,
    nada: false,
    abc: false,
    lafes: false,
    hartington: false,
    phytophar: false,
    hualunhongli: false,
  },
};

export function usePriceVisibility() {
  return useQuery({
    queryKey: qk.siteSetting("price_visibility"),
    queryFn: async (): Promise<PriceVisibility> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "price_visibility")
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.value ?? null) as Partial<PriceVisibility> | null;
      return {
        global: raw?.global ?? DEFAULT_PRICE_VISIBILITY.global,
        brands: { ...DEFAULT_PRICE_VISIBILITY.brands, ...(raw?.brands ?? {}) },
      };
    },
    staleTime: 30_000,
  });
}

export function useUpdatePriceVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: PriceVisibility) => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "price_visibility", value: next as any }, { onConflict: "key" });
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.siteSetting("price_visibility") });
    },
  });
}

export function useSiteSetting<T = unknown>(key: string, fallback: T) {
  return useQuery({
    queryKey: qk.siteSetting(key),
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return ((data?.value ?? fallback) as T);
    },
    staleTime: 30_000,
  });
}

export function useUpdateSiteSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key, value: value as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.siteSetting(vars.key) });
    },
  });
}

/* ============================================================
 * Branding (logo + favicon) — backed by site_settings
 * ============================================================ */

export const BRANDING_LOGO_KEY = "branding_logo_url";
export const BRANDING_FAVICON_KEY = "branding_favicon_url";
export const BRANDING_LOGO_REMOVE_BG_KEY = "branding_logo_remove_bg";

/** Returns the configured logo URL, or empty string when unset (caller falls back). */
export function useBrandingLogo() {
  return useSiteSetting<string>(BRANDING_LOGO_KEY, "");
}

/** Returns the configured favicon URL, or empty string when unset. */
export function useBrandingFavicon() {
  return useSiteSetting<string>(BRANDING_FAVICON_KEY, "");
}

/** Whether to apply a blend-mode hack to "remove" white background from a non-transparent logo. */
export function useBrandingLogoRemoveBg() {
  return useSiteSetting<boolean>(BRANDING_LOGO_REMOVE_BG_KEY, false);
}

/** Per-brand header logo (overrides the global Curemed logo on that brand's pages). */
export const BRANDING_BRAND_LOGO_KEY = (brand: BrandKey) => `branding_brand_logo_${brand}`;

export function useBrandingBrandLogo(brand: BrandKey | null | undefined) {
  return useSiteSetting<string>(brand ? BRANDING_BRAND_LOGO_KEY(brand) : "branding_brand_logo_none", "");
}

/** Per-brand card logo (shown inside the brand tile in the Curemed home "Our brands" carousel). */
export const BRANDING_BRAND_CARD_LOGO_KEY = (brand: BrandKey) => `branding_brand_card_logo_${brand}`;

export function useBrandingBrandCardLogo(brand: BrandKey | null | undefined) {
  return useSiteSetting<string>(brand ? BRANDING_BRAND_CARD_LOGO_KEY(brand) : "branding_brand_card_logo_none", "");
}

// Image compression (WebP) settings — admin-controlled.
export const IMAGE_COMPRESSION_ENABLED_KEY = "image_compression_enabled";
export const IMAGE_COMPRESSION_QUALITY_KEY = "image_compression_quality";

export function useImageCompressionEnabled() {
  return useSiteSetting<boolean>(IMAGE_COMPRESSION_ENABLED_KEY, true);
}

export function useImageCompressionQuality() {
  return useSiteSetting<number>(IMAGE_COMPRESSION_QUALITY_KEY, 99);
}

// Featured product card glass-strip background opacity (0-100). Default 70.
export const FEATURED_GLASS_OPACITY_KEY = "featured_glass_opacity";

export function useFeaturedGlassOpacity() {
  return useSiteSetting<number>(FEATURED_GLASS_OPACITY_KEY, 70);
}

// Loading page gradient progress bar settings.
export interface LoaderBarSettings {
  visible: boolean;     // show or hide the gradient bar
  durationMs: number;   // total time bar takes to fill
  positionX: number;    // 0-100 % of viewport width
  positionY: number;    // 0-100 % of viewport height
  widthPx: number;      // bar width in px
}
export const LOADER_BAR_KEY = "loader_bar";
export const LOADER_BAR_DEFAULTS: LoaderBarSettings = {
  visible: true,
  durationMs: 3200,
  positionX: 50,
  positionY: 50,
  widthPx: 420,
};
export function useLoaderBarSettings() {
  return useSiteSetting<LoaderBarSettings>(LOADER_BAR_KEY, LOADER_BAR_DEFAULTS);
}

// Loading page video URL (splash screen). Stored in site_settings so admin can update.
export const LOADER_VIDEO_KEY = "loader_video_url";
export const LOADER_VIDEO_DEFAULT =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/hero-media//CureMed_logo_loading_animation_202604300936.mp4";
export function useLoaderVideoUrl() {
  return useSiteSetting<string>(LOADER_VIDEO_KEY, LOADER_VIDEO_DEFAULT);
}

/** Uploads a video to the public `hero-media` bucket under `branding/` and returns the public URL. */
export async function uploadBrandingVideo(file: File, prefix: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = `branding/${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext || "mp4"}`;
  const { error } = await supabase.storage
    .from("hero-media")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("row-level security") || msg.includes("unauthorized") || msg.includes("denied") || msg.includes("403")) {
      throw new Error("Upload denied — make sure you are signed in as an admin.");
    }
    throw error;
  }
  return supabase.storage.from("hero-media").getPublicUrl(path).data.publicUrl;
}

/* ============================================================
 * Product reviews
 * ============================================================ */

export interface ProductReview {
  id: string;
  productId: string;
  reviewerName: string;
  reviewerEmail: string | null;
  rating: number;
  comment: string;
  isApproved: boolean;
  createdAt: string;
}

type ReviewRow = {
  id: string;
  product_id: string;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  comment: string;
  is_approved: boolean;
  created_at: string;
};

const rowToReview = (r: ReviewRow): ProductReview => ({
  id: r.id,
  productId: r.product_id,
  reviewerName: r.reviewer_name,
  reviewerEmail: r.reviewer_email,
  rating: r.rating,
  comment: r.comment,
  isApproved: r.is_approved,
  createdAt: r.created_at,
});

export function useProductReviews(productId: string | undefined) {
  return useQuery({
    queryKey: productId ? qk.productReviews(productId) : ["product_reviews", "none"],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", productId!)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ReviewRow[]).map(rowToReview);
    },
  });
}

export function useApprovedReviews() {
  return useQuery({
    queryKey: qk.approvedReviews,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as ReviewRow[]).map(rowToReview);
    },
  });
}

export function useAdminReviews() {
  return useQuery({
    queryKey: qk.adminReviews,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ReviewRow[]).map(rowToReview);
    },
  });
}

export interface CreateReviewInput {
  productId: string;
  reviewerName: string;
  reviewerEmail?: string;
  rating: number;
  comment: string;
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReviewInput) => {
      const { error } = await supabase.from("product_reviews").insert({
        product_id: input.productId,
        reviewer_name: input.reviewerName.trim(),
        reviewer_email: input.reviewerEmail?.trim() || null,
        rating: Math.max(1, Math.min(5, Math.round(input.rating))),
        comment: input.comment.trim(),
        is_approved: false,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.productReviews(vars.productId) });
      qc.invalidateQueries({ queryKey: qk.adminReviews });
    },
  });
}

export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("product_reviews")
        .update({ is_approved: approve })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminReviews });
      qc.invalidateQueries({ queryKey: qk.approvedReviews });
      qc.invalidateQueries({ queryKey: ["product_reviews"] });
    },
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminReviews });
      qc.invalidateQueries({ queryKey: qk.approvedReviews });
      qc.invalidateQueries({ queryKey: ["product_reviews"] });
    },
  });
}
/* ============================================================
 * Orders
 * ============================================================ */

export type OrderStatus = "new" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentMethod = "pay_by_link" | "cod";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productNameSnapshot: string;
  productImageSnapshot: string;
  brandSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  country: string;
  governorate: string;
  city: string;
  area: string;
  block: string;
  street: string;
  building: string;
  addressLine: string;
  notes: string;
  adminNotes: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

const rowToOrder = (r: any, items?: OrderItem[]): Order => ({
  id: r.id,
  orderNumber: r.order_number,
  userId: r.user_id ?? null,
  customerName: r.customer_name,
  customerEmail: r.customer_email,
  customerPhone: r.customer_phone,
  country: r.country ?? "Kuwait",
  governorate: r.governorate ?? "",
  city: r.city ?? "",
  area: r.area ?? "",
  block: r.block ?? "",
  street: r.street ?? "",
  building: r.building ?? "",
  addressLine: r.address_line ?? "",
  notes: r.notes ?? "",
  adminNotes: r.admin_notes ?? "",
  subtotal: Number(r.subtotal ?? 0),
  discountAmount: Number(r.discount_amount ?? 0),
  total: Number(r.total ?? 0),
  couponCode: r.coupon_code ?? null,
  paymentMethod: r.payment_method,
  paymentStatus: r.payment_status,
  orderStatus: r.order_status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items,
});

const rowToOrderItem = (r: any): OrderItem => ({
  id: r.id,
  orderId: r.order_id,
  productId: r.product_id ?? null,
  productNameSnapshot: r.product_name_snapshot,
  productImageSnapshot: r.product_image_snapshot ?? "",
  brandSnapshot: r.brand_snapshot ?? "",
  quantity: r.quantity,
  unitPrice: Number(r.unit_price),
  lineTotal: Number(r.line_total),
});

export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  country: string;
  governorate: string;
  city: string;
  area: string;
  block: string;
  street: string;
  building: string;
  addressLine?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  discountAmount?: number;
  items: Array<{
    productId: string;
    productName: string;
    productImage: string;
    brand: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const subtotal = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const discount = input.discountAmount ?? 0;
      const total = Math.max(0, subtotal - discount);
      const { data: userData } = await supabase.auth.getUser();
      const { data: orderRow, error } = await supabase
        .from("orders")
        .insert({
          user_id: userData?.user?.id ?? null,
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          customer_phone: input.customerPhone,
          country: input.country,
          governorate: input.governorate,
          city: input.city,
          area: input.area,
          block: input.block,
          street: input.street,
          building: input.building,
          address_line: input.addressLine ?? "",
          notes: input.notes ?? "",
          subtotal,
          discount_amount: discount,
          total,
          coupon_code: input.couponCode ?? null,
          payment_method: input.paymentMethod,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      const order = rowToOrder(orderRow);
      const itemRows = input.items.map((i) => ({
        order_id: order.id,
        product_id: i.productId,
        product_name_snapshot: i.productName,
        product_image_snapshot: i.productImage,
        brand_snapshot: i.brand,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        line_total: i.unitPrice * i.quantity,
      }));
      if (itemRows.length) {
        const { error: itemErr } = await supabase.from("order_items").insert(itemRows);
        if (itemErr) throw itemErr;
      }
      // Best-effort: bump coupon usage and notify the user.
      if (input.couponCode) {
        try {
          const { data: cur } = await supabase
            .from("coupons")
            .select("id, used_count")
            .eq("code", input.couponCode)
            .maybeSingle();
          if (cur) {
            await supabase
              .from("coupons")
              .update({ used_count: (cur.used_count ?? 0) + 1 })
              .eq("id", cur.id);
          }
        } catch {/* ignore */}
      }
      if (userData?.user?.id) {
        try {
          await supabase.from("notifications").insert({
            user_id: userData.user.id,
            title: `Order #${order.orderNumber} placed`,
            body: `Thank you! We received your order and will contact you shortly.`,
            type: "order",
            link: `/order-confirmation/${order.id}`,
          });
        } catch {/* ignore */}
      }
      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orders });
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: qk.orders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => rowToOrder(r));
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.order(id) : ["orders", "none"],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: orderData, error: oErr }, { data: itemsData, error: iErr }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", id!).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", id!).order("created_at", { ascending: true }),
      ]);
      if (oErr) throw oErr;
      if (iErr) throw iErr;
      if (!orderData) return null;
      return rowToOrder(orderData, (itemsData ?? []).map(rowToOrderItem));
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        orderStatus: OrderStatus;
        paymentStatus: PaymentStatus;
        adminNotes: string;
      }>;
    }) => {
      const row: any = {};
      if (patch.orderStatus !== undefined) row.order_status = patch.orderStatus;
      if (patch.paymentStatus !== undefined) row.payment_status = patch.paymentStatus;
      if (patch.adminNotes !== undefined) row.admin_notes = patch.adminNotes;
      const { error } = await supabase.from("orders").update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.orders });
      qc.invalidateQueries({ queryKey: qk.order(vars.id) });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete items first (no cascade defined client-side)
      await supabase.from("order_items").delete().eq("order_id", id);
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orders });
    },
  });
}

/* ============================================================
 * Profile
 * ============================================================ */

export interface Profile {
  id: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  country: string;
  governorate: string;
  city: string;
  area: string;
  block: string;
  street: string;
  building: string;
  addressLine: string;
  notes: string;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

const rowToProfile = (r: any): Profile => ({
  id: r.id,
  fullName: r.full_name ?? "",
  phone: r.phone ?? "",
  avatarUrl: r.avatar_url ?? "",
  country: r.country ?? "Kuwait",
  governorate: r.governorate ?? "",
  city: r.city ?? "",
  area: r.area ?? "",
  block: r.block ?? "",
  street: r.street ?? "",
  building: r.building ?? "",
  addressLine: r.address_line ?? "",
  notes: r.notes ?? "",
  isBlocked: !!r.is_blocked,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.profile(userId) : ["profile", "none"],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToProfile(data) : null;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<Profile, "id" | "createdAt" | "updatedAt" | "isBlocked">>;
    }) => {
      const row: any = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
      if (patch.country !== undefined) row.country = patch.country;
      if (patch.governorate !== undefined) row.governorate = patch.governorate;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.area !== undefined) row.area = patch.area;
      if (patch.block !== undefined) row.block = patch.block;
      if (patch.street !== undefined) row.street = patch.street;
      if (patch.building !== undefined) row.building = patch.building;
      if (patch.addressLine !== undefined) row.address_line = patch.addressLine;
      if (patch.notes !== undefined) row.notes = patch.notes;
      // Upsert so first-time profile creation works (e.g. existing users from before trigger).
      const { error } = await supabase
        .from("profiles")
        .upsert({ id, ...row }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.profile(vars.id) });
      qc.invalidateQueries({ queryKey: qk.adminUsers });
    },
  });
}

/* ============================================================
 * My orders (signed-in user)
 * ============================================================ */

export function useMyOrders(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.myOrders(userId) : ["orders", "mine", "none"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => rowToOrder(r));
    },
  });
}

/* ============================================================
 * Notifications
 * ============================================================ */

export type NotificationType = "order" | "system" | "message";

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const rowToNotification = (r: any): UserNotification => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  body: r.body ?? "",
  type: r.type,
  link: r.link ?? null,
  isRead: !!r.is_read,
  createdAt: r.created_at,
});

export function useMyNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.myNotifications(userId) : ["notifications", "mine", "none"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(rowToNotification);
    },
  });
}

export function useMyUnreadNotificationCount(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? qk.notificationsUnread(userId) : ["notifications", "unread", "none"],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      qc.invalidateQueries({ queryKey: qk.myNotifications(userId) });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread(userId) });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      qc.invalidateQueries({ queryKey: qk.myNotifications(userId) });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread(userId) });
    },
  });
}

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body?: string;
  type?: NotificationType;
  link?: string | null;
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNotificationInput) => {
      const { error } = await supabase.from("notifications").insert({
        user_id: input.userId,
        title: input.title,
        body: input.body ?? "",
        type: input.type ?? "system",
        link: input.link ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.myNotifications(vars.userId) });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread(vars.userId) });
    },
  });
}

/* ============================================================
 * Notification Templates (admin)
 * ============================================================ */

export interface NotificationTemplate {
  id: string;
  key: string;
  subject: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const rowToTemplate = (r: any): NotificationTemplate => ({
  id: r.id,
  key: r.key,
  subject: r.subject,
  body: r.body,
  isActive: !!r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function useNotificationTemplates() {
  return useQuery({
    queryKey: qk.notificationTemplates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_notification_templates")
        .select("*")
        .order("key", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToTemplate);
    },
  });
}

export function useUpsertNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { id?: string; key: string; subject: string; body: string; isActive: boolean }) => {
      const row: any = { key: t.key, subject: t.subject, body: t.body, is_active: t.isActive };
      if (t.id) {
        const { error } = await supabase
          .from("user_notification_templates")
          .update(row)
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_notification_templates")
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationTemplates });
    },
  });
}

export function useDeleteNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_notification_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationTemplates });
    },
  });
}

/* ============================================================
 * Coupons
 * ============================================================ */

export type CouponType = "percent" | "fixed";

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discountType: CouponType;
  discountValue: number;
  minOrderAmount: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const rowToCoupon = (r: any): Coupon => ({
  id: r.id,
  code: r.code,
  description: r.description ?? "",
  discountType: r.discount_type,
  discountValue: Number(r.discount_value),
  minOrderAmount: Number(r.min_order_amount ?? 0),
  maxUses: r.max_uses ?? null,
  usedCount: r.used_count ?? 0,
  expiresAt: r.expires_at ?? null,
  isActive: !!r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function useCoupons() {
  return useQuery({
    queryKey: qk.coupons,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToCoupon);
    },
  });
}

export interface CouponInput {
  id?: string;
  code: string;
  description?: string;
  discountType: CouponType;
  discountValue: number;
  minOrderAmount?: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

export function useUpsertCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CouponInput) => {
      const row: any = {
        code: c.code.trim().toUpperCase(),
        description: c.description ?? "",
        discount_type: c.discountType,
        discount_value: c.discountValue,
        min_order_amount: c.minOrderAmount ?? 0,
        max_uses: c.maxUses ?? null,
        expires_at: c.expiresAt ?? null,
        is_active: c.isActive ?? true,
      };
      if (c.id) {
        const { error } = await supabase.from("coupons").update(row).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.coupons }),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.coupons }),
  });
}

export async function validateCoupon(code: string, subtotal: number): Promise<{ ok: true; coupon: Coupon; discount: number } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "Invalid coupon code" };
  const c = rowToCoupon(data);
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return { ok: false, reason: "Coupon has expired" };
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return { ok: false, reason: "Coupon usage limit reached" };
  if (subtotal < c.minOrderAmount) return { ok: false, reason: `Minimum order amount: KD ${c.minOrderAmount.toFixed(2)}` };
  const discount = c.discountType === "percent"
    ? Math.round((subtotal * c.discountValue) / 100 * 1000) / 1000
    : Math.min(subtotal, c.discountValue);
  return { ok: true, coupon: c, discount };
}

/* ============================================================
 * Admin: Users
 * ============================================================ */

export interface AdminUserRow {
  profile: Profile;
  isAdmin: boolean;
  orderCount: number;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: qk.adminUsers,
    queryFn: async (): Promise<AdminUserRow[]> => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: orderCounts, error: oErr }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("orders").select("user_id"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (oErr) throw oErr;
      const adminSet = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      const orderMap = new Map<string, number>();
      for (const o of (orderCounts ?? []) as { user_id: string | null }[]) {
        if (!o.user_id) continue;
        orderMap.set(o.user_id, (orderMap.get(o.user_id) ?? 0) + 1);
      }
      return (profiles ?? []).map((p: any) => ({
        profile: rowToProfile(p),
        isAdmin: adminSet.has(p.id),
        orderCount: orderMap.get(p.id) ?? 0,
      }));
    },
  });
}

export function useToggleAdminRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminUsers }),
  });
}

export function useToggleUserBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_blocked: blocked })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminUsers }),
  });
}
