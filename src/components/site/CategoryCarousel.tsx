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
    ring: "group-hover:shadow-sky-400/40",
    titleHover: "group-hover:text-sky-600",
    badge: "bg-sky-500/10 text-sky-700",
  },
  {
    grad: "from-pink-500 to-rose-400",
    softTint: "from-pink-100/70 to-rose-50",
    blob: "bg-pink-400/30",
    ring: "group-hover:shadow-pink-400/40",
    titleHover: "group-hover:text-pink-600",
    badge: "bg-pink-500/10 text-pink-700",
  },
  {
    grad: "from-emerald-500 to-teal-400",
    softTint: "from-emerald-100/70 to-teal-50",
    blob: "bg-emerald-400/30",
    ring: "group-hover:shadow-emerald-400/40",
    titleHover: "group-hover:text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-700",
  },
  {
    grad: "from-violet-500 to-indigo-400",
    softTint: "from-violet-100/70 to-indigo-50",
    blob: "bg-violet-400/30",
    ring: "group-hover:shadow-violet-400/40",
    titleHover: "group-hover:text-violet-600",
    badge: "bg-violet-500/10 text-violet-700",
  },
] as const;

export function CategoryCarousel() {
  const { t, lang } = useI18n();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();

  // Only show top-level categories; subcategories are reachable via the parent.
  const active = useMemo(
    () => categories.filter((c) => c.isActive && !c.parentId),
    [categories],
  );

  // Build descendant-id map so subcategory products roll up to the parent tile.
  const descendantsByParent = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    for (const c of categories) {
      if (c.parentId) {
        const arr = childrenOf.get(c.parentId) ?? [];
        arr.push(c.id);
        childrenOf.set(c.parentId, arr);
      }
    }
    const result = new Map<string, Set<string>>();
    const collect = (rootId: string): Set<string> => {
      const set = new Set<string>([rootId]);
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of childrenOf.get(cur) ?? []) {
          if (!set.has(child)) {
            set.add(child);
            stack.push(child);
          }
        }
      }
      return set;
    };
    for (const c of active) result.set(c.id, collect(c.id));
    return result;
  }, [categories, active]);

  // Count products per top-level category (including its subcategories).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of active) {
      const ids = descendantsByParent.get(c.id) ?? new Set([c.id]);
      let n = 0;
      for (const p of products) {
        const productCatIds = new Set<string>([
          ...(p.categoryIds ?? []),
          ...(p.categoryId ? [p.categoryId] : []),
        ]);
        for (const pid of productCatIds) {
          if (ids.has(pid)) {
            n++;
            break; // count each product once per top-level category
          }
        }
      }
      m.set(c.id, n);
    }
    return m;
  }, [active, products, descendantsByParent]);

  if (active.length === 0) return null;

  return (
    <section className="bg-muted/30 py-14 md:py-20">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("categories.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("categories.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
          {active.map((c, i) => {
            const palette = PALETTES[i % PALETTES.length];
            const count = counts.get(c.id) ?? 0;
            return (
              <div key={c.id} className="group relative">
                {/* gradient halo behind card on hover (matches pillars) */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-0 blur transition-opacity duration-500 group-hover:opacity-60",
                    palette.grad,
                  )}
                />
                <Link
                  to={`/category/${c.slug}`}
                  className={cn(
                    "relative block h-full overflow-hidden rounded-3xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl",
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
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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