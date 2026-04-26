import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import {
  useMyNotifications, useMyUnreadNotificationCount,
  useMarkNotificationRead, useMarkAllNotificationsRead,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function UserNotificationBell() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: unread = 0 } = useMyUnreadNotificationCount(user?.id);
  const { data: notifications = [] } = useMyNotifications(user?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Realtime subscription so the bell updates instantly when admin sends a message.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", "mine", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications", "unread", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  if (!user) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("header.notifications")}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-5 border-b border-border text-left">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> {t("nav.notifications")}
            </SheetTitle>
            <SheetDescription>
              {unread > 0 ? `${unread} ${t("nav.notifications").toLowerCase()}` : t("account.noNotifications")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                {t("account.noNotifications")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => !n.isRead && markRead.mutate({ id: n.id, userId: user.id })}
                    className={cn(
                      "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                      !n.isRead && "bg-brand/[0.05]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm", !n.isRead && "font-bold")}>{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-1">{n.body}</p>}
                        {n.link && (
                          <Link
                            to={n.link}
                            onClick={() => setOpen(false)}
                            className="text-xs text-brand hover:underline mt-1 inline-block"
                          >
                            {t("product.viewArrow")}
                          </Link>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-border flex gap-2">
            {unread > 0 && (
              <Button variant="outline" className="flex-1" onClick={() => markAllRead.mutate(user.id)}>
                <CheckCheck className="h-4 w-4 mr-1.5" />
                {t("account.markAllRead")}
              </Button>
            )}
            <Button asChild className="flex-1 bg-brand hover:bg-brand/90 text-white" onClick={() => setOpen(false)}>
              <Link to="/account">{t("nav.account")}</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}