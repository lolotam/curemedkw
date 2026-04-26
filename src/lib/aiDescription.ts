import { supabase } from "@/integrations/supabase/client";

export type DescFormat = "text" | "html";

export interface DescTemplate {
  id: string;
  label: string;
  description: string;
  format: DescFormat;
}

export const DESCRIPTION_TEMPLATES: DescTemplate[] = [
  { id: "clinical", label: "Clinical / medical", description: "Concise, factual, suitable for pharmacy listings.", format: "text" },
  { id: "friendly", label: "Friendly conversational", description: "Warm and approachable, like a trusted advisor.", format: "text" },
  { id: "bullets-html", label: "Benefit bullets (HTML)", description: "An <ul> list of the strongest 6 benefits.", format: "html" },
  { id: "editorial-html", label: "Two-paragraph editorial (HTML)", description: "Two well-flowing <p> blocks, magazine tone.", format: "html" },
  { id: "seo-html", label: "SEO long-form (HTML)", description: "<h3> sections + <p> paragraphs, keyword-rich.", format: "html" },
  { id: "compare-html", label: "Why choose this (HTML table)", description: "An HTML <table> comparing this product vs alternatives.", format: "html" },
  { id: "routine-html", label: "Step-by-step routine (HTML)", description: "An <ol> ordered list explaining how to use it day & night.", format: "html" },
  { id: "derm", label: "Dermatologist tone", description: "Skin-science vocabulary, calm and authoritative.", format: "text" },
  { id: "short", label: "Mobile blurb (≤60 words)", description: "Crisp short paragraph for mobile cards.", format: "text" },
  { id: "bilingual-html", label: "Bilingual EN/AR (HTML)", description: "Two-column HTML with English on the left and Arabic on the right.", format: "html" },
];

export interface RewriteInput {
  templateId: string;
  productName: string;
  brand: string;
  category?: string;
  shortDescription?: string;
  currentLong?: string;
  ingredients?: string[];
  benefits?: string[];
  usage?: string;
}

export async function rewriteDescription(input: RewriteInput): Promise<{ text: string; format: DescFormat }> {
  const { data, error } = await supabase.functions.invoke("rewrite-description", { body: input });
  if (error) throw new Error((data as any)?.error || error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { text: string; format: DescFormat };
}

export function isHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}