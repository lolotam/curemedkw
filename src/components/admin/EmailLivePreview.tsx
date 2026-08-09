import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailLivePreviewProps {
  /** Fully rendered HTML — tokens already substituted. */
  html: string;
  /** Debounce before the iframe re-renders, ms. */
  debounceMs?: number;
  className?: string;
}

/**
 * Renders an order email exactly as a mail client would.
 *
 * `sandbox=""` (deliberately empty) is what makes this trustworthy: it blocks
 * scripts and same-origin access, and — the reason it matters most here — it
 * stops the dashboard's Tailwind from leaking in. With dangerouslySetInnerHTML
 * the admin theme would style the preview and you would be judging something
 * the recipient never sees.
 *
 * Note the preview intentionally sets no `dir`: direction must come from the
 * template's own <html dir="rtl">, because that is all the mail client gets.
 */
export function EmailLivePreview({
  html,
  debounceMs = 200,
  className,
}: EmailLivePreviewProps) {
  const [srcDoc, setSrcDoc] = useState(html);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  // Debounced so the iframe does not remount on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSrcDoc(html), debounceMs);
    return () => clearTimeout(id);
  }, [html, debounceMs]);

  return (
    <div className={cn("rounded-2xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-semibold text-muted-foreground">Live preview</span>
        <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden text-[11px]">
          {([
            { key: "desktop", icon: Monitor, label: "Desktop" },
            { key: "mobile", icon: Smartphone, label: "Mobile" },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setWidth(key)}
              aria-pressed={width === key}
              className={cn(
                "flex items-center gap-1 px-2 py-1 transition-colors",
                width === key
                  ? "bg-brand text-white"
                  : "bg-background hover:bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#f6f7fb] p-3 flex justify-center">
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={srcDoc}
          className={cn(
            "h-[560px] bg-white border border-border rounded-lg transition-all",
            width === "mobile" ? "w-[380px]" : "w-full",
          )}
        />
      </div>
    </div>
  );
}
