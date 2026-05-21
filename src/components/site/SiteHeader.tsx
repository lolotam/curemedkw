import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, Globe, X, Bell, Mail, User as UserIcon, LogOut, Package, ChevronDown, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { BRAND_LIST, slugToBrand } from "@/lib/brands";
import { cn } from "@/lib/utils";
import defaultLogo from "@/assets/curemed-logo.png";
import { useAdminSession } from "@/lib/admin";
import { useMessages, useUnreadMessageCount, useBrandingLogo, useBrandingLogoRemoveBg, useBrandingBrandLogo } from "@/lib/db";
import { CartIcon } from "@/components/site/CartIcon";
import { useAuth } from "@/lib/auth";
import { UserNotificationBell } from "@/components/site/UserNotificationBell";
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
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const { isAdmin } = useAdminSession();
  const { data: brandingLogo } = useBrandingLogo();
  const { data: removeBg } = useBrandingLogoRemoveBg();
  // Detect a brand-specific page from the URL (e.g. /flexitol or /australian-bodycare/...)
  const firstSegment = location.pathname.split("/").filter(Boolean)[0] ?? "";
  const activeBrandKey = slugToBrand(firstSegment);
  const { data: brandLogo } = useBrandingBrandLogo(activeBrandKey);
  const logoSrc =
    (activeBrandKey && brandLogo?.trim()) ||
    brandingLogo?.trim() ||
    defaultLogo;

  useEffect(() => {
    if (open) setHidden(false);
  }, [open]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (open) {
        setHidden(false);
      } else if (y < 80) {
        setHidden(false);
      } else if (y > lastScrollY.current) {
        setHidden(true);
      } else if (y < lastScrollY.current) {
        setHidden(false);
      }
      lastScrollY.current = y;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < 80) setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [open]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        "transition-transform duration-300 will-change-transform",
        hidden && "-translate-y-full",
      )}
    >
      <div className="container flex h-24 items-center justify-between gap-4">
        <Link to="/curemed" className="flex items-center gap-2">
          <img
            src={logoSrc}
            alt="Curemed"
            width={240}
            height={96}
            className={cn("h-20 w-auto brand-logo-img", removeBg && "brand-logo-img--remove-white")}
          />
        </Link>

        <nav className="hidden items-center gap-3 xl:gap-5 lg:flex">
          <NavItem to="/curemed" label={t("nav.home")} active={isActive("/curemed")} />
          <PartnersMenu active={BRAND_LIST.some((b) => location.pathname.startsWith(`/${b.slug}`))} label={t("nav.partners")} lang={lang} />
          <NavItem to="/about" label={t("nav.about")} active={isActive("/about")} />
          <NavItem to="/contact" label={t("nav.contact")} active={isActive("/contact")} />
        </nav>

        <div className="flex items-center gap-1">
          {isAdmin && <AdminBell />}
          <UserNotificationBell />
          <CartIcon />
          <UserMenu />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="gap-1.5"
            aria-label={t("header.toggleLang")}
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs font-semibold">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("header.toggleTheme")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label={t("header.menu")}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 bg-background lg:hidden">
          <div className="container flex flex-col gap-1 py-3">
            <MobileItem to="/curemed" label={t("nav.home")} onClick={() => setOpen(false)} />
            <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("nav.partners")}
            </div>
            {BRAND_LIST.map((b) => (
              <MobileItem
                key={b.key}
                to={`/${b.slug}`}
                label={lang === "ar" ? (b.shortNameAr ?? b.nameAr) : (b.shortName ?? b.name)}
                onClick={() => setOpen(false)}
                indent
              />
            ))}

            <MobileItem to="/about" label={t("nav.about")} onClick={() => setOpen(false)} />
            <MobileItem to="/contact" label={t("nav.contact")} onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}

function PartnersMenu({ active, label, lang }: { active: boolean; label: string; lang: "en" | "ar" }) {
  const [hoveredBrand, setHoveredBrand] = useState(BRAND_LIST[0]);
  const isAr = lang === "ar";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "relative inline-flex items-center gap-1 rounded-md px-4 py-2.5 text-base font-bold uppercase tracking-wide transition-all duration-300",
            "after:content-[''] after:absolute after:left-4 after:right-4 after:bottom-1 after:h-0.5 after:bg-brand",
            "after:scale-x-0 after:origin-left after:transition-transform after:duration-300",
            "hover:text-brand hover:after:scale-x-100 focus:outline-none",
            active && "text-brand after:scale-x-100",
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[28rem] p-0 overflow-hidden">
        <div className={cn("flex", isAr && "flex-row-reverse")} dir={isAr ? "rtl" : "ltr"}>
          <div className="w-1/2 p-1">
            {BRAND_LIST.map((b) => (
              <DropdownMenuItem
                key={b.key}
                asChild
                onMouseEnter={() => setHoveredBrand(b)}
                onFocus={() => setHoveredBrand(b)}
              >
                <Link to={`/${b.slug}`} className="cursor-pointer font-medium">
                  {isAr ? (b.shortNameAr ?? b.nameAr) : (b.shortName ?? b.name)}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
          <div className={cn("w-1/2 bg-muted/30 flex items-center justify-center p-4", isAr ? "border-r border-border" : "border-l border-border")}>
            <BrandLogoPreview brand={hoveredBrand} />
          </div>

        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function BrandLogoPreview({ brand }: { brand: typeof BRAND_LIST[number] }) {
  const { data: brandLogo } = useBrandingBrandLogo(brand.key);
  const { data: brandingLogo } = useBrandingLogo();
  const { data: removeBg } = useBrandingLogoRemoveBg();
  const src = (brandLogo?.trim()) || (brandingLogo?.trim()) || brand.logo;
  return (
    <Link
      to={`/${brand.slug}`}
      className="flex items-center justify-center w-full h-full transition-opacity hover:opacity-80"
      aria-label={brand.name}
    >
      <img
        src={src}
        alt={brand.name}
        className={cn("max-h-24 max-w-full object-contain brand-logo-img", removeBg && "brand-logo-img--remove-white")}
      />
    </Link>
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

function MobileItem({ to, label, onClick, indent }: { to: string; label: string; onClick: () => void; indent?: boolean }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted",
        indent && "ms-4",
      )}
    >
      {label}
    </Link>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAdmin } = useAdminSession();

  if (!user) {
    return (
      <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
        <UserIcon className="h-4 w-4" />
        <span className="hidden sm:inline text-xs font-semibold">{t("nav.signin")}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/account")}>
          <UserIcon className="h-4 w-4 mr-2" />{t("nav.account")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/account")}>
          <Package className="h-4 w-4 mr-2" />{t("nav.myOrders")}
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/admin")}>
              <Shield className="h-4 w-4 mr-2" />{t("nav.admin")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await signOut(); navigate("/"); }}>
          <LogOut className="h-4 w-4 mr-2" />{t("nav.signout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}