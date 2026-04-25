import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useCategories } from "@/lib/db";

export function CategoryCarousel() {
  const { t, lang } = useI18n();
  const { data: categories = [] } = useCategories();
  const active = categories.filter((c) => c.isActive);
  if (active.length === 0) return null;

  // Duplicate for seamless marquee loop
  const loop = [...active, ...active];

  return (
    <section className="bg-muted/30 py-14 md:py-20 overflow-hidden">
      <div className="container mb-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold">{t("categories.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("categories.subtitle")}</p>
        </div>
      </div>
      <div
        className="relative group"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
        }}
      >
        <div className="flex gap-5 cat-marquee w-max group-hover:[animation-play-state:paused]">
          {loop.map((c, i) => (
            <Link
              key={`${c.id}-${i}`}
              to={`/category/${c.slug}`}
              className="group/card shrink-0 w-40 sm:w-48 text-center"
            >
              <div className="aspect-square rounded-2xl overflow-hidden border border-border bg-background shadow-sm transition-all group-hover/card:-translate-y-1 group-hover/card:shadow-lg">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={c.nameEn} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-brand/10 flex items-center justify-center text-brand font-bold text-2xl">
                    {c.nameEn.charAt(0)}
                  </div>
                )}
              </div>
              <p className="mt-3 font-semibold text-sm">{lang === "ar" && c.nameAr ? c.nameAr : c.nameEn}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}