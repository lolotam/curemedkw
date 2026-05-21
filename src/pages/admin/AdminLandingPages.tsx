import { Link } from "react-router-dom";
import { ArrowRight, Image as ImageIcon, Sparkles, Home, ListFilter } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { HERO_PAGES, type HeroPageKey } from "@/lib/heroSlides";
import { BRANDS } from "@/lib/brands";
import { useBrandingBrandCardLogo, useBrandingFavicon, type BrandKey } from "@/lib/db";
import { cn } from "@/lib/utils";
import curemedBadge from "@/assets/curemed-c-badge.png";

export type HomeCarouselAutoscroll = { brands: boolean; categories: boolean };
export const HOME_CAROUSEL_AUTOSCROLL_KEY = "home_carousel_autoscroll";
export const DEFAULT_HOME_CAROUSEL_AUTOSCROLL: HomeCarouselAutoscroll = {
  brands: true,
  categories: true,
};

export default function AdminLandingPages() {
  return (
    <div className="p-6 md:p-10 w-full max-w-none">
      <AdminPageHeader
        eyebrow="Landing"
        eyebrowIcon={ImageIcon}
        title="Landing Pages"
        subtitle="Manage hero slides (images & videos) for each landing page."
        gradient="violet-fuchsia-pink"
        actions={
          <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 border border-border">
            {HERO_PAGES.length} pages
          </span>
        }
      />

      <div className="mb-6 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-foreground/80 flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-brand" />
          Tip: use the unified editor with the page dropdown to switch quickly between brands.
        </p>
        <Link
          to="/admin/landing"
          className="text-sm font-semibold text-brand hover:underline inline-flex items-center gap-1"
        >
          Open unified editor <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>


      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {HERO_PAGES.map((p, i) => (
          <BrandLandingCard key={p.key} pageKey={p.key} label={p.label} route={p.route} index={i} />
        ))}
      </div>
    </div>
  );
}

function BrandLandingCard({
  pageKey,
  label,
  route,
  index,
}: {
  pageKey: HeroPageKey;
  label: string;
  route: string;
  index: number;
}) {
  const isMain = pageKey === "curemed";
  const meta = isMain ? null : BRANDS[pageKey as BrandKey];
  const tagline = meta?.tagline.en;
  const { data: cardLogo } = useBrandingBrandCardLogo(isMain ? null : pageKey as BrandKey);
  const { data: favicon } = useBrandingFavicon();
  const logoSrc = (cardLogo && cardLogo.trim()) ? cardLogo.trim() : meta?.logo;
  const mainSrc = (favicon && favicon.trim()) ? favicon.trim() : curemedBadge;

  return (
    <Link
      to={`/admin/landing/${pageKey}`}
      data-brand={meta?.themeAttr ?? "curemed"}
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-border bg-card",
        "shadow-sm transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-2xl hover:border-brand/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "animate-fade-in",
      )}
    >
      {/* Top media band */}
      <div className="relative h-28 overflow-hidden bg-brand-soft">
        {/* gradient wash using brand tokens */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-brand/30 via-brand/10 to-transparent"
          aria-hidden
        />
        {/* radial highlight */}
        <div
          className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/40 blur-2xl"
          aria-hidden
        />
        {/* dotted texture */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "14px 14px",
          }}
          aria-hidden
        />

        {/* Top-right chip */}
        <span
          className={cn(
            "absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur",
            isMain
              ? "bg-brand text-white shadow-md"
              : "bg-white/85 text-brand ring-1 ring-black/5",
          )}
        >
          {isMain ? <><Home className="h-2.5 w-2.5" /> Main</> : <><ImageIcon className="h-2.5 w-2.5" /> Hero</>}
        </span>

        {/* Logo / monogram badge */}
        <div className="absolute bottom-3 left-3">
          {meta ? (
            <div className="h-14 w-14 rounded-xl bg-white/95 backdrop-blur p-2 shadow-md ring-1 ring-black/5 flex items-center justify-center">
              <img
                src={logoSrc}
                alt={meta.name}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="h-14 w-14 rounded-xl bg-white/95 backdrop-blur p-2 shadow-md ring-1 ring-black/5 flex items-center justify-center">
              <img
                src={mainSrc}
                alt="Curemed"
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-base leading-tight truncate">{label}</h3>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
            {route}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1 min-h-[1rem]">
          {tagline ?? "Main landing page hero slides"}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
            <ImageIcon className="h-3.5 w-3.5" /> Manage slides
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand" />
        </div>
      </div>
    </Link>
  );
}