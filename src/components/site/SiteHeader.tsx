import { Link, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, Globe, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { BRAND_LIST } from "@/lib/brands";
import { cn } from "@/lib/utils";
import curemedLogo from "@/assets/curemed-logo.png";

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/curemed" className="flex items-center gap-2">
          <img src={curemedLogo} alt="Curemed" className="h-9 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          <NavItem to="/curemed" label={t("nav.home")} active={isActive("/curemed")} />
          {BRAND_LIST.map((b) => (
            <NavItem
              key={b.key}
              to={`/${b.slug}`}
              label={b.name}
              active={location.pathname.startsWith(`/${b.slug}`)}
            />
          ))}
        </nav>

        <div className="flex items-center gap-1">
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
                label={b.name}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function NavItem({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
        active && "text-brand bg-muted",
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