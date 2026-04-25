import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Mail, Users, LogOut, ExternalLink, Moon, Sun, Image as ImageIcon } from "lucide-react";
import { adminAuth } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import curemedLogo from "@/assets/curemed-logo.png";

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/landing", icon: ImageIcon, label: "Landing Pages" },
  { to: "/admin/messages", icon: Mail, label: "Messages" },
  { to: "/admin/subscribers", icon: Users, label: "Subscribers" },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  if (!adminAuth.isLoggedIn()) {
    return <Navigate to="/admin/login" replace />;
  }

  const logout = () => {
    adminAuth.logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div data-brand="curemed" className="min-h-screen bg-muted/20 flex" dir="ltr">
      <aside className="w-64 bg-background border-r border-border min-h-screen sticky top-0 flex flex-col">
        <div className="p-5 border-b border-border">
          <img src={curemedLogo} alt="Curemed" className="h-9 w-auto object-contain" />
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
              {item.label}
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