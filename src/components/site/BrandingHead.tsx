import { useEffect } from "react";
import { useBrandingFavicon, useImageCompressionEnabled, useImageCompressionQuality } from "@/lib/db";
import { setImageCompressionConfig } from "@/lib/imageConvert";

const DEFAULT_FAVICON = "/favicon.png";

/**
 * Keeps the document <link rel="icon"> in sync with the admin-configured
 * favicon URL stored in site_settings. Falls back to /favicon.png.
 */
export function BrandingHead() {
  const { data: faviconUrl } = useBrandingFavicon();
  const { data: compEnabled } = useImageCompressionEnabled();
  const { data: compQuality } = useImageCompressionQuality();
  const url = faviconUrl?.trim() || DEFAULT_FAVICON;

  useEffect(() => {
    setImageCompressionConfig({
      enabled: compEnabled ?? true,
      quality: typeof compQuality === "number" ? compQuality : 99,
    });
  }, [compEnabled, compQuality]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    // Remove any existing icon links so the new one wins unambiguously.
    document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']").forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = url;
    // Hint at SVG when extension says so; browsers ignore otherwise.
    if (/\.svg(\?|$)/i.test(url)) link.type = "image/svg+xml";
    else if (/\.png(\?|$)/i.test(url)) link.type = "image/png";
    else if (/\.ico(\?|$)/i.test(url)) link.type = "image/x-icon";
    document.head.appendChild(link);
  }, [url]);

  return null;
}