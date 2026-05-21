import { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminGradient, type AdminGradient } from "./AdminPageShell";

export interface AdminPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  eyebrowIcon?: LucideIcon;
  actions?: ReactNode;
  gradient?: AdminGradient;
  className?: string;
}

/**
 * Reusable page header matching AdminOverview: eyebrow chip + gradient
 * bg-clip-text title + muted subtitle + optional right-aligned actions.
 */
export function AdminPageHeader({
  title,
  subtitle,
  eyebrow = "Dashboard",
  eyebrowIcon: EyebrowIcon = Sparkles,
  actions,
  gradient = "sky-violet-pink",
  className,
}: AdminPageHeaderProps) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-in", className)}>
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
          <EyebrowIcon className="h-3 w-3" /> {eyebrow}
        </span>
        <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
          <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", adminGradient(gradient))}>
            {title}
          </span>
        </h1>
        {subtitle && <p className="text-muted-foreground mt-2 text-sm md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
