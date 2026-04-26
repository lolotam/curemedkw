import { useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Quote, MapPin, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useTestimonials, useApprovedReviews } from "@/lib/db";

export function Testimonials() {
  const { t, lang } = useI18n();
  const { data: items = [] } = useTestimonials();
  const { data: reviews = [] } = useApprovedReviews();
  const trackRef = useRef<HTMLDivElement>(null);

  type Slide =
    | {
        kind: "testimonial";
        id: string;
        nameEn: string;
        nameAr: string;
        roleEn: string;
        roleAr: string;
        quoteEn: string;
        quoteAr: string;
        location: string;
        gender: string;
      }
    | {
        kind: "review";
        id: string;
        name: string;
        comment: string;
        rating: number;
        createdAt: string;
      };

  const slides = useMemo<Slide[]>(() => {
    const t1: Slide[] = items.map((it) => ({ kind: "testimonial", ...it }));
    const r1: Slide[] = reviews.slice(0, 12).map((r) => ({
      kind: "review",
      id: r.id,
      name: r.reviewerName,
      comment: r.comment,
      rating: r.rating,
      createdAt: r.createdAt,
    }));
    // Interleave so reviews appear mixed in, not all bunched at the end
    const merged: Slide[] = [];
    const max = Math.max(t1.length, r1.length);
    for (let i = 0; i < max; i++) {
      if (i < t1.length) merged.push(t1[i]);
      if (i < r1.length) merged.push(r1[i]);
    }
    return merged;
  }, [items, reviews]);

  if (slides.length === 0) return null;

  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-testimonial-card]");
    const step = card ? card.offsetWidth + 20 : 340;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="container py-16 md:py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold">{t("testimonials.title")}</h2>
      </div>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous testimonial"
          onClick={() => scrollByCard(-1)}
          className="absolute left-0 rtl:left-auto rtl:right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/90 shadow-md hidden sm:inline-flex"
        >
          <ChevronLeft className="h-5 w-5 rtl:hidden" />
          <ChevronRight className="h-5 w-5 hidden rtl:block" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next testimonial"
          onClick={() => scrollByCard(1)}
          className="absolute right-0 rtl:right-auto rtl:left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/90 shadow-md hidden sm:inline-flex"
        >
          <ChevronRight className="h-5 w-5 rtl:hidden" />
          <ChevronLeft className="h-5 w-5 hidden rtl:block" />
        </Button>
        <div
          ref={trackRef}
          className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 px-1 sm:px-12 [scrollbar-width:thin]"
          dir="ltr"
        >
          {slides.map((it, idx) => {
            const isReview = it.kind === "review";
            const name = isReview ? it.name : lang === "ar" ? it.nameAr : it.nameEn;
            const role = isReview
              ? t("testimonials.verifiedReview")
              : lang === "ar"
                ? it.roleAr
                : it.roleEn;
            const quote = isReview ? it.comment : lang === "ar" ? it.quoteAr : it.quoteEn;
            const initial = (name || "?").charAt(0);
            const tint =
              isReview
                ? "bg-amber-500/15 text-amber-600"
                : it.gender === "f"
                  ? "bg-pink-500/15 text-pink-600"
                  : "bg-blue-500/15 text-blue-600";
            return (
              <Card
                key={`${it.id}-${idx}`}
                data-testimonial-card
                className="p-6 bg-brand-soft border-brand/10 w-[320px] md:w-[360px] shrink-0 snap-start"
              >
                {isReview ? (
                  <div className="flex items-center gap-0.5 mb-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={
                          i < it.rating
                            ? "h-4 w-4 fill-amber-400 text-amber-400"
                            : "h-4 w-4 text-muted-foreground/30"
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Quote className="h-7 w-7 text-brand opacity-30 mb-3" />
                )}
                <p
                  className="text-sm leading-relaxed text-foreground line-clamp-5"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  "{quote}"
                </p>
                <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${tint}`}
                  >
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {role}
                      {!isReview && it.location ? ` · ${it.location}` : ""}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}