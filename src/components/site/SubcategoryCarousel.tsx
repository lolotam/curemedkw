import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useProducts, type Category } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

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

export function SubcategoryCarousel({ categories }: { categories: Category[] }) {
  const { t, lang } = useI18n();
  const { data: products = [] } = useProducts();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categories) {
      let n = 0;
      for (const p of products) {
        const ids = new Set<string>([
          ...(p.categoryIds ?? []),
          ...(p.categoryId ? [p.categoryId] : []),
        ]);
        if (ids.has(c.id)) n++;
      }
      m.set(c.id, n);
    }
    return m;
  }, [categories, products]);

  if (categories.length === 0) return null;

  return (
    <section className="container py-8 md:py-10">
      <Carousel opts={{ align: "start", dragFree: true }} className="relative">
        <CarouselContent className="-ml-5 md:-ml-6">
          {categories.map((c, i) => {
            const palette = PALETTES[i % PALETTES.length];
            const count = counts.get(c.id) ?? 0;
            return (
              <CarouselItem
                key={c.id}
                className="pl-5 md:pl-6 basis-auto"
              >
                <div className="group/card relative shrink-0 w-44 sm:w-52 md:w-56">
                  <div
                    aria-hidden
                    className={cn(
                      "absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-0 blur transition-opacity duration-500 group-hover/card:opacity-60",
                      palette.grad,
                    )}
                  />
                  <Link
                    to={`/categories/${c.slug}`}
                    className={cn(
                      "relative block h-full overflow-hidden rounded-3xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-500 group-hover/card:-translate-y-2 group-hover/card:shadow-2xl",
                      palette.ring,
                    )}
                  >
                    <div
                      aria-hidden
                      className={cn(
                        "absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl",
                        palette.blob,
                      )}
                    />
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
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
    </section>
  );
}
