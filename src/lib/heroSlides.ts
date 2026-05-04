import { supabase } from "@/integrations/supabase/clientRuntime";
import { convertToWebP } from "@/lib/imageConvert";

export type HeroPageKey =
  | "curemed"
  | "flexitol"
  | "kapiva"
  | "nada"
  | "abc"
  | "lafes"
  | "hartington"
  | "phytophar"
  | "hualunhongli";

export const HERO_PAGES: { key: HeroPageKey; label: string; route: string }[] = [
  { key: "curemed", label: "Curemed (Main)", route: "/curemed" },
  { key: "flexitol", label: "Flexitol", route: "/flexitol" },
  { key: "kapiva", label: "Kapiva", route: "/kapiva" },
  { key: "nada", label: "NADA", route: "/nada" },
  { key: "abc", label: "Australian Bodycare", route: "/australian-bodycare" },
  { key: "lafes", label: "Lafe's", route: "/lafes" },
  { key: "hartington", label: "Hartington", route: "/hartington" },
  { key: "phytophar", label: "Phytophar", route: "/phytophar" },
  { key: "hualunhongli", label: "Hualunhongli", route: "/hualunhongli" },
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
  overlay_opacity: number;
  created_at: string;
  updated_at: string;
  // Typography
  font_family_en: string;
  font_family_ar: string;
  h1_font_size: number;
  h2_font_size: number;
  cta_font_size: number;
  // Motion
  h1_animation: string;
  h2_animation: string;
  cta_animation: string;
  // Position (percent of slide width/height where the text block anchors)
  text_position_x: number;
  text_position_y: number;
  text_align: "left" | "center" | "right";
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
  const converted = file.type.startsWith("image/") ? await convertToWebP(file) : file;
  const ext = converted.name.split(".").pop() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("hero-media").upload(path, converted, {
    cacheControl: "3600",
    upsert: false,
    contentType: converted.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("hero-media").getPublicUrl(path);
  const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  return { url: data.publicUrl, type };
}