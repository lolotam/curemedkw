import * as React from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Admin-flavoured DialogContent: rounded glass surface with a subtle
 * sky→violet→pink gradient halo so dialogs match the admin pages.
 *
 * Drop-in replacement for shadcn's DialogContent inside admin flows.
 */
export const AdminDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, children, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      "relative overflow-visible rounded-3xl border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl",
      "before:absolute before:-inset-0.5 before:rounded-[1.6rem] before:-z-10 before:blur",
      "before:bg-gradient-to-br before:from-sky-400/40 before:via-violet-500/40 before:to-pink-500/40",
      className,
    )}
    {...props}
  >
    {children}
  </DialogContent>
));
AdminDialogContent.displayName = "AdminDialogContent";
