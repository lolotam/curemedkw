import { useMemo, useState } from "react";
import { Check, Loader2, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useAdminReviews,
  useApproveReview,
  useDeleteReview,
  useProducts,
} from "@/lib/db";
import { cn } from "@/lib/utils";

type Tab = "pending" | "approved" | "all";

export default function AdminReviews() {
  const { data: reviews = [], isLoading } = useAdminReviews();
  const { data: products = [] } = useProducts();
  const approve = useApproveReview();
  const remove = useDeleteReview();
  const [tab, setTab] = useState<Tab>("pending");

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  const filtered = reviews.filter((r) =>
    tab === "all" ? true : tab === "pending" ? !r.isApproved : r.isApproved,
  );

  const counts = {
    pending: reviews.filter((r) => !r.isApproved).length,
    approved: reviews.filter((r) => r.isApproved).length,
    all: reviews.length,
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Product reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve customer reviews to show them on the product page and the homepage testimonials.
        </p>
      </header>

      <div className="flex gap-2 mb-5">
        {(["pending", "approved", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors inline-flex items-center gap-2",
              tab === k ? "bg-brand text-white" : "bg-muted hover:bg-muted/70",
            )}
          >
            {k}
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold",
                tab === k ? "bg-white/20" : "bg-background",
              )}
            >
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No reviews in this view.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{r.reviewerName}</p>
                    {r.reviewerEmail && (
                      <span className="text-xs text-muted-foreground">· {r.reviewerEmail}</span>
                    )}
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide",
                        r.isApproved
                          ? "bg-green-500/15 text-green-700 dark:text-green-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {r.isApproved ? "Approved" : "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {productMap.get(r.productId) ?? "Unknown product"} ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex items-center gap-0.5">
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
                  {r.comment && (
                    <p className="mt-2 text-sm text-foreground/80 whitespace-pre-line">
                      {r.comment}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.isApproved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        approve
                          .mutateAsync({ id: r.id, approve: false })
                          .then(() => toast.success("Unapproved"))
                          .catch((e) => toast.error(e.message))
                      }
                    >
                      <X className="h-4 w-4 mr-1" /> Unapprove
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-brand hover:bg-brand/90 text-white"
                      onClick={() =>
                        approve
                          .mutateAsync({ id: r.id, approve: true })
                          .then(() => toast.success("Approved"))
                          .catch((e) => toast.error(e.message))
                      }
                    >
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (!confirm("Delete this review permanently?")) return;
                      remove
                        .mutateAsync(r.id)
                        .then(() => toast.success("Deleted"))
                        .catch((e) => toast.error(e.message));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}