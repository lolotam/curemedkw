import { useState } from "react";
import { Star, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCreateReview } from "@/lib/db";
import { cn } from "@/lib/utils";

export function ReviewForm({ productId }: { productId: string }) {
  const create = useCreateReview();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter your name");
    if (rating < 1) return toast.error("Please pick a rating");
    if (!comment.trim()) return toast.error("Please write a short review");
    try {
      await create.mutateAsync({
        productId,
        reviewerName: name,
        reviewerEmail: email || undefined,
        rating,
        comment,
      });
      toast.success("Thanks! Your review will appear once approved.");
      setName("");
      setEmail("");
      setRating(0);
      setComment("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  const display = hover || rating;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Write a review</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Reviews are visible after approval. Email is optional and never shown publicly.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Your name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email (optional)</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
          Rating *
        </label>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="p-0.5"
              aria-label={`${n} stars`}
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  n <= display
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 hover:text-amber-300",
                )}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-xs font-semibold text-muted-foreground">{rating}/5</span>
          )}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Your review *</label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="What did you like? How did it work for you?"
        />
      </div>
      <Button
        type="submit"
        disabled={create.isPending}
        className="bg-brand hover:bg-brand/90 text-white"
      >
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Send className="h-4 w-4 mr-2" />
        )}
        Submit review
      </Button>
    </form>
  );
}