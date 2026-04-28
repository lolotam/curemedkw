import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Mail, Users, LogOut, ExternalLink, Moon, Sun, Image as ImageIcon, Sparkles, Tags, Tag, Flag, Star, ShoppingBag, Ticket, UserCog, Bell, Palette } from "lucide-react";
import { adminLogout, useAdminSession } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import defaultLogo from "@/assets/curemed-logo.png";
import { Loader2, ShieldAlert } from "lucide-react";
import { useUnreadMessageCount, useBrandingLogo, useBrandingLogoRemoveBg } from "@/lib/db";

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/admin/users", icon: UserCog, label: "Users" },
  { to: "/admin/coupons", icon: Ticket, label: "Coupons" },
  { to: "/admin/categories", icon: Tags, label: "Categories" },
  { to: "/admin/tags", icon: Tag, label: "Tags" },
  { to: "/admin/landing", icon: ImageIcon, label: "Landing Pages" },
  { to: "/admin/models", icon: Sparkles, label: "AI Models" },
  { to: "/admin/reviews", icon: Star, label: "Reviews" },
  { to: "/admin/notifications", icon: Bell, label: "Notifications" },
  { to: "/admin/branding", icon: Palette, label: "Branding" },
  { to: "/admin/flags", icon: Flag, label: "Site Flags" },
  { to: "/admin/messages", icon: Mail, label: "Messages" },
  { to: "/admin/subscribers", icon: Users, label: "Subscribers" },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { user, isAdmin, loading } = useAdminSession();
  const { data: unreadCount = 0 } = useUnreadMessageCount();
  const { data: brandingLogo } = useBrandingLogo();
  const { data: removeBg } = useBrandingLogoRemoveBg();
  const logoSrc = brandingLogo?.trim() || defaultLogo;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div data-brand="curemed" className="min-h-screen flex items-center justify-center bg-brand-soft p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive mb-3">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold">Not authorized</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your account ({user.email}) doesn't have admin access. Contact a site administrator.
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            <Button variant="outline" asChild><Link to="/curemed">Back to site</Link></Button>
            <Button variant="ghost" onClick={async () => { await adminLogout(); navigate("/admin/login", { replace: true }); }}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  const logout = async () => {
    await adminLogout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div data-brand="curemed" className="min-h-screen bg-muted/20 flex" dir="ltr">
      <aside className="w-64 bg-background border-r border-border min-h-screen sticky top-0 flex flex-col">
        <div className="p-5 border-b border-border flex flex-col items-center text-center">
          <Link to="/curemed" aria-label="Go to main page">
            <img
              src={logoSrc}
              alt="Curemed"
              className={cn("h-16 w-auto object-contain brand-logo-img", removeBg && "brand-logo-img--remove-white")}
            />
          </Link>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 font-semibold">Admin Dashboard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-brand text-white" : "text-foreground hover:bg-muted",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/admin/messages" && unreadCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Link to="/curemed" target="_blank">
              <ExternalLink className="h-4 w-4" /> View site
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={toggle} className="w-full justify-start gap-2">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Theme
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start gap-2 text-destructive hover:text-destructive">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}