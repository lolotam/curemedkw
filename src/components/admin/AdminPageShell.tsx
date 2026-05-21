import { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared visual chrome for every /admin/* page.
 * Mirrors the AdminOverview look: animated multicolor gradient backdrop,
 * eyebrow chip, gradient page title, fade-in entrance.
 */

export type AdminGradient =
  | "sky-violet-pink"
  | "violet-fuchsia-pink"
  | "emerald-teal-cyan"
  | "amber-orange-rose"
  | "rose-pink-fuchsia"
  | "indigo-violet-purple"
  | "cyan-sky-blue";

const GRADIENT_CLASS: Record<AdminGradient, string> = {
  "sky-violet-pink": "from-sky-500 via-violet-500 to-pink-500",
  "violet-fuchsia-pink": "from-violet-500 via-fuchsia-500 to-pink-500",
  "emerald-teal-cyan": "from-emerald-400 via-teal-400 to-cyan-500",
  "amber-orange-rose": "from-amber-400 via-orange-400 to-rose-400",
  "rose-pink-fuchsia": "from-rose-400 via-pink-500 to-fuchsia-500",
  "indigo-violet-purple": "from-indigo-500 via-violet-500 to-purple-500",
  "cyan-sky-blue": "from-cyan-400 via-sky-500 to-blue-500",
};

export function adminGradient(g: AdminGradient = "sky-violet-pink") {
  return GRADIENT_CLASS[g];
}

export interface AdminPageShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  eyebrowIcon?: LucideIcon;
  actions?: ReactNode;
  gradient?: AdminGradient;
  /** Override the inner container width. */
  maxWidthClass?: string;
  children: ReactNode;
}

export function AdminPageShell({
  title,
  subtitle,
  eyebrow = "Dashboard",
  eyebrowIcon: EyebrowIcon = Sparkles,
  actions,
  gradient = "sky-violet-pink",
  maxWidthClass = "w-full max-w-none",
  children,
}: AdminPageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient backdrop — identical to AdminOverview */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/[0.06] via-violet-500/[0.05] to-pink-500/[0.06]" />
        <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-sky-400/20 blur-3xl animate-blob-drift" />
        <div className="absolute top-20 right-0 h-[24rem] w-[24rem] rounded-full bg-violet-400/15 blur-3xl animate-blob-drift animation-delay-200" />
        <div className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-pink-400/15 blur-3xl animate-blob-drift animation-delay-300" />
      </div>

      <div className={cn("p-6 md:p-10", maxWidthClass)}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
              <EyebrowIcon className="h-3 w-3" /> {eyebrow}
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", GRADIENT_CLASS[gradient])}>
                {title}
              </span>
            </h1>
            {subtitle && <p className="text-muted-foreground mt-2 text-base">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}

export interface AdminGlassCardProps {
  children: ReactNode;
  gradient?: AdminGradient;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Inner padding (default p-7). Set false to opt out (e.g. for raw tables). */
  padded?: boolean;
}

export function AdminGlassCard({
  children,
  gradient = "sky-violet-pink",
  title,
  action,
  className,
  padded = true,
}: AdminGlassCardProps) {
  return (
    <div className={cn("group relative", className)}>
      <div
        aria-hidden
        className={cn(
          "absolute -inset-0.5 rounded-3xl bg-gradient-to-br opacity-40 blur transition-opacity duration-500 group-hover:opacity-80",
          GRADIENT_CLASS[gradient],
        )}
      />
      <div
        className={cn(
          "relative rounded-3xl border border-border/60 bg-card/90 backdrop-blur-md shadow-xl",
          padded && "p-6 md:p-7",
        )}
      >
        {(title || action) && (
          <div className={cn("flex items-center justify-between gap-3", padded ? "mb-5" : "px-6 md:px-7 pt-6 md:pt-7 mb-5")}>
            {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}
            {action && <div className="ml-auto">{action}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
