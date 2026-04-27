import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Reveal-on-scroll hook (no deps). */
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, ...options },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options]);
  return { ref, inView };
}

export type GradientKey =
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo"
  | "cyan";

export const GRADIENTS: Record<
  GradientKey,
  { from: string; via?: string; to: string; shadow: string }
> = {
  sky: { from: "from-sky-400", via: "via-blue-500", to: "to-indigo-500", shadow: "shadow-sky-500/40" },
  violet: { from: "from-violet-500", via: "via-fuchsia-500", to: "to-pink-500", shadow: "shadow-violet-500/40" },
  emerald: { from: "from-emerald-400", via: "via-teal-400", to: "to-cyan-500", shadow: "shadow-emerald-500/40" },
  amber: { from: "from-amber-400", via: "via-orange-400", to: "to-rose-400", shadow: "shadow-amber-500/40" },
  rose: { from: "from-rose-400", via: "via-pink-500", to: "to-fuchsia-500", shadow: "shadow-rose-500/40" },
  indigo: { from: "from-indigo-500", via: "via-violet-500", to: "to-purple-500", shadow: "shadow-indigo-500/40" },
  cyan: { from: "from-cyan-400", via: "via-sky-500", to: "to-blue-500", shadow: "shadow-cyan-500/40" },
};

/** 3D-style colored icon badge. */
export function Icon3D({
  icon: Icon,
  variant,
  size = "md",
}: {
  icon: LucideIcon;
  variant: GradientKey;
  size?: "sm" | "md" | "lg";
}) {
  const g = GRADIENTS[variant];
  const dims = size === "lg" ? "h-20 w-20" : size === "md" ? "h-14 w-14" : "h-11 w-11";
  const iconSize = size === "lg" ? "h-10 w-10" : size === "md" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-2xl",
        "bg-gradient-to-br ring-1 ring-white/30 shadow-xl",
        "transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110",
        dims,
        g.from,
        g.via,
        g.to,
        g.shadow,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/50 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"
      />
      <Icon className={cn("relative text-white drop-shadow-md", iconSize)} strokeWidth={2.25} />
    </span>
  );
}

/** Wrapper that fades + lifts content into view on scroll. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Animated colorful gradient background with floating blobs + dotted texture. */
export function ColorfulHeroBg() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-pink-500/10" />
      <div className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-sky-400/30 blur-3xl animate-blob-drift" />
      <div className="absolute -top-20 right-0 h-[24rem] w-[24rem] rounded-full bg-violet-400/25 blur-3xl animate-blob-drift animation-delay-200" />
      <div className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-pink-400/25 blur-3xl animate-blob-drift animation-delay-300" />
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
    </div>
  );
}

/** Glow ring + glass card wrapper. */
export function GlowCard({
  variant = "sky",
  className,
  children,
}: {
  variant?: GradientKey;
  className?: string;
  children: React.ReactNode;
}) {
  const g = GRADIENTS[variant];
  return (
    <div className="group relative h-full">
      <div
        className={cn(
          "absolute -inset-0.5 rounded-3xl opacity-50 blur transition-opacity duration-500 group-hover:opacity-90 bg-gradient-to-br",
          g.from,
          g.via,
          g.to,
        )}
      />
      <div
        className={cn(
          "relative h-full rounded-3xl border border-border/60 bg-card/85 backdrop-blur-md shadow-xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}