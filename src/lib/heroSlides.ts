import { supabase } from "@/integrations/supabase/client";

export type HeroPageKey = "curemed" | "flexitol" | "kapiva" | "nada" | "abc";

export const HERO_PAGES: { key: HeroPageKey; label: string; route: string }[] = [
  { key: "curemed", label: "Curemed (Main)", route: "/curemed" },
  { key: "flexitol", label: "Flexitol", route: "/flexitol" },
  { key: "kapiva", label: "Kapiva", route: "/kapiva" },
  { key: "nada", label: "NADA", route: "/nada" },
  { key: "abc", label: "Australian Bodycare", route: "/australian-bodycare" },
];

export interface HeroSlide {
  id: string;
  page_key: HeroPageKey;
  media_url: string;
  media_type: "image" | "video";
  title_en: string | null;
  title_ar: string | null;
  subtitle_en: string | null;
  subtitle_ar: string | null;
  cta_label_en: string | null;
  cta_label_ar: string | null;
  cta_href: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type HeroSlideInput = Omit<HeroSlide, "id" | "created_at" | "updated_at">;

export async function listSlidesForPage(pageKey: HeroPageKey, onlyActive = true) {
  let q = supabase.from("hero_slides").select("*").eq("page_key", pageKey).order("sort_order", { ascending: true });
  if (onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HeroSlide[];
}

export async function getSlide(id: string) {
  const { data, error } = await supabase.from("hero_slides").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as HeroSlide | null;
}

export async function createSlide(input: HeroSlideInput) {
  const { data, error } = await supabase.from("hero_slides").insert(input).select("*").single();
  if (error) throw error;
  return data as HeroSlide;
}

export async function updateSlide(id: string, patch: Partial<HeroSlideInput>) {
  const { data, error } = await supabase.from("hero_slides").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as HeroSlide;
}

export async function deleteSlide(id: string) {
  const { error } = await supabase.from("hero_slides").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadHeroMedia(file: File): Promise<{ url: string; type: "image" | "video" }> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("hero-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("hero-media").getPublicUrl(path);
  const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  return { url: data.publicUrl, type };
}