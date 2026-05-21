import { Link } from "react-router-dom";
import {
  Package,
  Mail,
  Users,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { useProducts, useMessages, useSubscribers, useOrders } from "@/lib/db";
import { BRAND_LIST } from "@/lib/brands";
import { cn } from "@/lib/utils";

type GradientKey = "sky" | "violet" | "emerald" | "amber" | "rose" | "indigo" | "cyan";

const GRADIENTS: Record<GradientKey, { from: string; via?: string; to: string; shadow: string; ring: string }> = {
  sky: { from: "from-sky-400", via: "via-blue-500", to: "to-indigo-500", shadow: "shadow-sky-500/40", ring: "from-sky-400 via-blue-500 to-indigo-500" },
  violet: { from: "from-violet-500", via: "via-fuchsia-500", to: "to-pink-500", shadow: "shadow-violet-500/40", ring: "from-violet-500 via-fuchsia-500 to-pink-500" },
  emerald: { from: "from-emerald-400", via: "via-teal-400", to: "to-cyan-500", shadow: "shadow-emerald-500/40", ring: "from-emerald-400 via-teal-400 to-cyan-500" },
  amber: { from: "from-amber-400", via: "via-orange-400", to: "to-rose-400", shadow: "shadow-amber-500/40", ring: "from-amber-400 via-orange-400 to-rose-400" },
  rose: { from: "from-rose-400", via: "via-pink-500", to: "to-fuchsia-500", shadow: "shadow-rose-500/40", ring: "from-rose-400 via-pink-500 to-fuchsia-500" },
  indigo: { from: "from-indigo-500", via: "via-violet-500", to: "to-purple-500", shadow: "shadow-indigo-500/40", ring: "from-indigo-500 via-violet-500 to-purple-500" },
  cyan: { from: "from-cyan-400", via: "via-sky-500", to: "to-blue-500", shadow: "shadow-cyan-500/40", ring: "from-cyan-400 via-sky-500 to-blue-500" },
};

function Icon3D({ icon: Icon, variant }: { icon: LucideIcon; variant: GradientKey }) {
  const g = GRADIENTS[variant];
  return (
    <span
      className={cn(
        "relative inline-flex h-12 w-12 items-center justify-center rounded-2xl",
        "bg-gradient-to-br ring-1 ring-white/30 shadow-lg",
        "transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110",
        g.from,
        g.via,
        g.to,
        g.shadow,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/50 to-transparent" />
      <Icon className="relative h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
    </span>
  );
}

export default function AdminOverview() {
  const { data: allProducts = [] } = useProducts();
  const { data: allMessages = [] } = useMessages();
  const { data: allSubs = [] } = useSubscribers();
  const { data: allOrders = [] } = useOrders();
  const unread = allMessages.filter((m) => !m.read).length;
  const newOrders = allOrders.filter((o) => o.orderStatus === "new").length;
  const revenue = allOrders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + (o.total ?? 0), 0);

  const stats: { icon: LucideIcon; label: string; value: string | number; variant: GradientKey; sub?: string }[] = [
    { icon: Package, label: "Products", value: allProducts.length, variant: "sky", sub: `${allProducts.filter((p) => p.featured).length} featured` },
    { icon: ShoppingBag, label: "Orders", value: allOrders.length, variant: "violet", sub: `${newOrders} new` },
    { icon: TrendingUp, label: "Revenue (paid)", value: `${revenue.toFixed(3)} KD`, variant: "emerald" },
    { icon: Mail, label: "Unread messages", value: unread, variant: "rose" },
    { icon: Users, label: "Subscribers", value: allSubs.length, variant: "amber" },
    { icon: Sparkles, label: "Featured", value: allProducts.filter((p) => p.featured).length, variant: "indigo" },
  ];

  return (
    <div className="relative">
      <div className="p-6 md:p-10 max-w-7xl">
        {/* Header */}
        <div className="mb-10 animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur-md shadow-sm">
            <Sparkles className="h-3 w-3" /> Dashboard
          </span>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
              Overview
            </span>
          </h1>
          <p className="text-muted-foreground mt-2 text-base">A snapshot of your Curemed site</p>
        </div>


        {/* Stats grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          {stats.map((s, i) => (
            <Stat key={s.label} {...s} delay={i * 80} />
          ))}
        </div>

        {/* Lower grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Products by brand */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-sky-400 via-violet-500 to-pink-500 opacity-50 blur transition-opacity duration-500 group-hover:opacity-90" />
            <div className="relative rounded-3xl border border-border/60 bg-card/90 p-7 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold tracking-tight">Products by brand</h2>
                <Link to="/admin/products" className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-4">
                {BRAND_LIST.map((b, i) => {
                  const count = allProducts.filter((p) => p.brand === b.key).length;
                  const pct = allProducts.length ? (count / allProducts.length) * 100 : 0;
                  const variants: GradientKey[] = ["sky", "violet", "emerald", "amber", "rose", "indigo", "cyan"];
                  const v = variants[i % variants.length];
                  const g = GRADIENTS[v];
                  return (
                    <Link
                      key={b.key}
                      to={`/admin/products?brand=${b.key}`}
                      className="block group/row transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-semibold">{b.name}</span>
                        <span className="text-muted-foreground tabular-nums">{count}</span>
                      </div>
                      <div className="h-2.5 bg-muted/60 rounded-full overflow-hidden ring-1 ring-border/40">
                        <div
                          className={cn(
                            "h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out shadow-sm",
                            g.from,
                            g.via,
                            g.to,
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent messages */}
          <div className="group relative">
            <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500 opacity-50 blur transition-opacity duration-500 group-hover:opacity-90" />
            <div className="relative rounded-3xl border border-border/60 bg-card/90 p-7 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold tracking-tight">Recent messages</h2>
                <Link to="/admin/messages" className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-3">
                {allMessages.slice(0, 5).map((m) => (
                  <Link
                    key={m.id}
                    to="/admin/messages"
                    className="block p-3.5 rounded-xl border border-border/60 bg-background/40 hover:bg-background/80 hover:border-rose-400/40 hover:shadow-md transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{m.name}</p>
                      {!m.read && (
                        <span className="text-[10px] font-bold text-white bg-gradient-to-r from-rose-500 to-pink-500 px-2 py-0.5 rounded-full shadow-sm shadow-rose-500/40 animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{m.subject}</p>
                  </Link>
                ))}
                {allMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No messages yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  variant,
  sub,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  variant: GradientKey;
  sub?: string;
  delay?: number;
}) {
  const g = GRADIENTS[variant];
  return (
    <div className="group relative animate-fade-in" style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}>
      <div
        className={cn(
          "absolute -inset-0.5 rounded-2xl opacity-0 blur transition-opacity duration-500 group-hover:opacity-70 bg-gradient-to-br",
          g.from,
          g.via,
          g.to,
        )}
      />
      <div className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-5 backdrop-blur-md shadow-md transition-all duration-500 group-hover:-translate-y-1.5 group-hover:shadow-2xl">
        {/* corner sheen */}
        <div
          aria-hidden
          className={cn(
            "absolute -top-10 -right-10 h-24 w-24 rounded-full opacity-20 blur-2xl bg-gradient-to-br",
            g.from,
            g.to,
          )}
        />
        <div className="relative flex items-start justify-between">
          <Icon3D icon={icon} variant={variant} />
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <p className="relative mt-4 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        <p className="relative text-sm text-muted-foreground font-medium">{label}</p>
        {sub && <p className="relative mt-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80">{sub}</p>}
      </div>
    </div>
  );
}