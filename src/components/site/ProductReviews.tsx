import { Star } from "lucide-react";
import { useProductReviews } from "@/lib/db";
import { ReviewForm } from "./ReviewForm";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function ProductReviews({ productId }: { productId: string }) {
  const { data: reviews = [] } = useProductReviews(productId);
  const { t, lang } = useI18n();
  const avg =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="container py-12 md:py-16 grid lg:grid-cols-[1fr_420px] gap-8">
      <div>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">{t("reviews.title")}</h2>
          {reviews.length > 0 && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{avg.toFixed(1)}</span>
              <span>({reviews.length})</span>
            </span>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("reviews.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-brand/15 text-brand flex items-center justify-center font-bold">
                    {(r.reviewerName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{r.reviewerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-4 w-4",
                          i < r.rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30",
                        )}
                      />
                    ))}
                  </div>
                </div>
                {r.comment && (
                  <p className="mt-3 text-sm text-foreground/80 whitespace-pre-line">
                    {r.comment}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <ReviewForm productId={productId} />
      </div>
    </section>
  );
}