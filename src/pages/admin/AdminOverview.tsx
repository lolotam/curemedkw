import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Mail, Users, Sparkles, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { products, messages, subscribers, useDbVersion, resetSampleData } from "@/lib/db";
import { BRAND_LIST } from "@/lib/brands";
import { toast } from "sonner";

export default function AdminOverview() {
  useDbVersion();
  const allProducts = products.list();
  const allMessages = messages.list();
  const allSubs = subscribers.list();
  const unread = allMessages.filter((m) => !m.read).length;
  const reset = () => { if (confirm("Reset all data to seeded sample data?")) { resetSampleData(); toast.success("Sample data restored"); } };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div><h1 className="text-3xl font-bold">Overview</h1><p className="text-muted-foreground mt-1">A snapshot of your Curemed site</p></div>
        <Button variant="outline" onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" /> Reset sample data</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Stat icon={Package} label="Products" value={allProducts.length} accent="bg-blue-500/10 text-blue-600" />
        <Stat icon={Sparkles} label="Featured" value={allProducts.filter((p) => p.featured).length} accent="bg-amber-500/10 text-amber-600" />
        <Stat icon={Mail} label="Unread messages" value={unread} accent="bg-red-500/10 text-red-600" />
        <Stat icon={Users} label="Subscribers" value={allSubs.length} accent="bg-green-500/10 text-green-600" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Products by brand</h2>
          <div className="space-y-3">
            {BRAND_LIST.map((b) => {
              const count = allProducts.filter((p) => p.brand === b.key).length;
              const pct = allProducts.length ? (count / allProducts.length) * 100 : 0;
              return (
                <Link key={b.key} to={`/admin/products?brand=${b.key}`} className="block hover:opacity-80">
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">{b.name}</span><span className="text-muted-foreground">{count}</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Recent messages</h2><Link to="/admin/messages" className="text-xs text-brand hover:underline">View all</Link></div>
          <div className="space-y-3">
            {allMessages.slice(0, 4).map((m) => (
              <Link key={m.id} to="/admin/messages" className="block p-3 rounded-lg border border-border hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2"><p className="font-medium text-sm">{m.name}</p>{!m.read && <span className="text-[10px] font-bold text-brand">NEW</span>}</div>
                <p className="text-xs text-muted-foreground line-clamp-1">{m.subject}</p>
              </Link>
            ))}
            {allMessages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (<Card className="p-5"><div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent}`}><Icon className="h-5 w-5" /></div><p className="mt-3 text-3xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></Card>);
}