import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useCategories, useProducts } from "@/lib/db";
import { cn } from "@/lib/utils";

/** Pillar-tinted palette cycled across category tiles (matches the
 *  "What we do" pillars section on the home page). */
const PALETTES = [
  {
    grad: "from-sky-500 to-cyan-400",
    softTint: "from-sky-100/70 to-sky-50",
    blob: "bg-sky-400/30",
    ring: "group-hover/card:shadow-sky-400/40",
    titleHover: "group-hover/card:text-sky-600",
    badge: "bg-sky-500/10 text-sky-700",
  },
  {
    grad: "from-pink-500 to-rose-400",
    softTint: "from-pink-100/70 to-rose-50",
    blob: "bg-pink-400/30",
    ring: "group-hover/card:shadow-pink-400/40",
    titleHover: "group-hover/card:text-pink-600",
    badge: "bg-pink-500/10 text-pink-700",
  },
  {
    grad: "from-emerald-500 to-teal-400",
    softTint: "from-emerald-100/70 to-teal-50",
    blob: "bg-emerald-400/30",
    ring: "group-hover/card:shadow-emerald-400/40",
    titleHover: "group-hover/card:text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-700",
  },
  {
    grad: "from-violet-500 to-indigo-400",
    softTint: "from-violet-100/70 to-indigo-50",
    blob: "bg-violet-400/30",
    ring: "group-hover/card:shadow-violet-400/40",
    titleHover: "group-hover/card:text-violet-600",
    badge: "bg-violet-500/10 text-violet-700",
  },
] as const;

export function CategoryCarousel() {
  const { t, lang } = useI18n();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();

  // Show every active category — both parents and subcategories.
  const active = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );

  // Direct product count per category (no descendant roll-up since subs are
  // shown as their own tiles now).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of active) {
      let n = 0;
      for (const p of products) {
        const productCatIds = new Set<string>([
          ...(p.categoryIds ?? []),
          ...(p.categoryId ? [p.categoryId] : []),
        ]);
        if (productCatIds.has(c.id)) n++;
      }
      m.set(c.id, n);
    }
    return m;
  }, [active, products]);

  if (active.length === 0) return null;

  return (
    <section className="bg-muted/30 py-14 md:py-20">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("categories.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("categories.subtitle")}</p>
        </div>
      </div>

      <div
        className="group relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        }}
      >
        <div className="cat-marquee flex w-max gap-5 md:gap-6 group-hover:[animation-play-state:paused] py-2">
          {[...active, ...active].map((c, i) => {
            const palette = PALETTES[i % PALETTES.length];
            const count = counts.get(c.id) ?? 0;
            const isClone = i >= active.length;
            return (
              <div
                key={`${c.id}-${i}`}
                className="group/card relative shrink-0 w-44 sm:w-52 md:w-56"
                aria-hidden={isClone || undefined}
              >
                {/* gradient halo behind card on hover (matches pillars) */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-0 blur transition-opacity duration-500 group-hover/card:opacity-60",
                    palette.grad,
                  )}
                />
                <Link
                  to={`/category/${c.slug}`}
                  tabIndex={isClone ? -1 : undefined}
                  className={cn(
                    "relative block h-full overflow-hidden rounded-3xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-500 group-hover/card:-translate-y-2 group-hover/card:shadow-2xl",
                    palette.ring,
                  )}
                >
                  {/* decorative tinted blob */}
                  <div
                    aria-hidden
                    className={cn(
                      "absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl",
                      palette.blob,
                    )}
                  />

                  {/* square image panel with soft tinted background */}
                  <div
                    className={cn(
                      "relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br",
                      palette.softTint,
                    )}
                  >
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={c.nameEn}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-foreground/70">
                        {c.nameEn.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* name + count pill */}
                  <div className="relative mt-4 flex flex-col items-center text-center gap-2">
                    <h3
                      className={cn(
                        "font-semibold text-sm md:text-base transition-colors duration-300",
                        palette.titleHover,
                      )}
                    >
                      {lang === "ar" && c.nameAr ? c.nameAr : c.nameEn}
                    </h3>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        palette.badge,
                      )}
                    >
                      {count}{" "}
                      {count === 1 ? t("categories.product") : t("categories.products")}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}