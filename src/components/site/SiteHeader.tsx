import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, Globe, X, Bell, Mail, User as UserIcon, LogOut, Package } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { BRAND_LIST } from "@/lib/brands";
import { cn } from "@/lib/utils";
import curemedLogo from "@/assets/curemed-logo.png";
import { useAdminSession } from "@/lib/admin";
import { useMessages, useUnreadMessageCount } from "@/lib/db";
import { CartIcon } from "@/components/site/CartIcon";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAdminSession();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-24 items-center justify-between gap-4">
        <Link to="/curemed" className="flex items-center gap-2">
          <img src={curemedLogo} alt="Curemed" className="h-20 w-auto" />
        </Link>

        <nav className="hidden items-center gap-3 xl:gap-5 lg:flex">
          <NavItem to="/curemed" label={t("nav.home")} active={isActive("/curemed")} />
          {BRAND_LIST.map((b) => (
            <NavItem
              key={b.key}
              to={`/${b.slug}`}
              label={b.shortName ?? b.name}
              active={location.pathname.startsWith(`/${b.slug}`)}
            />
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {isAdmin && <AdminBell />}
          <CartIcon />
          <UserMenu />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="gap-1.5"
            aria-label="Toggle language"
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs font-semibold">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 bg-background lg:hidden">
          <div className="container flex flex-col gap-1 py-3">
            <MobileItem to="/curemed" label={t("nav.home")} onClick={() => setOpen(false)} />
            {BRAND_LIST.map((b) => (
              <MobileItem
                key={b.key}
                to={`/${b.slug}`}
                label={b.shortName ?? b.name}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function AdminBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: unreadCount = 0 } = useUnreadMessageCount();
  const { data: messages = [] } = useMessages();
  const recent = messages.slice(0, 20);

  const goTo = (id?: string) => {
    setOpen(false);
    if (id) {
      navigate("/admin/messages", { state: { focusMessageId: id } });
    } else {
      navigate("/admin/messages");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col" dir="ltr">
          <SheetHeader className="p-5 border-b border-border text-left">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
            </SheetTitle>
            <SheetDescription>
              {unreadCount} unread of {messages.length} total
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />
                No messages yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((m) => (
                  <li
                    key={m.id}
                    onClick={() => goTo(m.id)}
                    className={cn(
                      "flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                      !m.read && "bg-brand/[0.04]",
                    )}
                  >
                    {!m.read ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-sm truncate", !m.read && "font-bold")}>{m.name}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 truncate mt-0.5">{m.subject}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{m.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-border">
            <Button variant="outline" className="w-full" onClick={() => goTo()}>
              View all messages
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function NavItem({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "relative rounded-md px-4 py-2.5 text-base font-bold uppercase tracking-wide transition-all duration-300",
        "after:content-[''] after:absolute after:left-4 after:right-4 after:bottom-1 after:h-0.5 after:bg-brand",
        "after:scale-x-0 after:origin-left after:transition-transform after:duration-300",
        "hover:text-brand hover:after:scale-x-100",
        active && "text-brand after:scale-x-100",
      )}
    >
      {label}
    </Link>
  );
}

function MobileItem({ to, label, onClick }: { to: string; label: string; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted"
    >
      {label}
    </Link>
  );
}