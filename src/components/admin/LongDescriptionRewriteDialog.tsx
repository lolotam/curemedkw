import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/clientRuntime";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  content: string;
  onApply: (text: string) => void;
}

export default function LongDescriptionRewriteDialog({ open, onOpenChange, content, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (v: boolean) => {
    if (!v) {
      setResult(null);
      setError(null);
    }
    onOpenChange(v);
  };

  const handleImprove = async () => {
    if (!content.trim()) {
      toast.error("Long description is empty — nothing to rewrite.");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("rewrite-long-description", {
        body: { content },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const text = (data as any)?.text;
      if (!text) throw new Error("No text returned from AI.");
      setResult(text);
    } catch (e: any) {
      setError(e.message ?? "AI rewrite failed.");
      toast.error(e.message ?? "AI rewrite failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApply(result);
      handleClose(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            AI Rewrite — Long Description
          </DialogTitle>
          <DialogDescription>
            Uses your configured Chat Models (primary → fallback #2 → #3) and the Long Description Prompt template.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4 min-h-0">
          {/* Original content */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Original</p>
            <Textarea
              value={content}
              readOnly
              rows={6}
              className="font-mono text-xs resize-none bg-muted/40 text-muted-foreground"
            />
          </div>

          {/* Action button */}
          <div className="flex justify-center">
            <Button
              onClick={handleImprove}
              disabled={loading || !content.trim()}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Improving…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Improve this content
                </>
              )}
            </Button>
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Result */}
          {result !== null && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Improved — review before applying
              </p>
              <Textarea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={12}
                className="font-mono text-xs resize-y"
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!result || loading} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Apply to product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
