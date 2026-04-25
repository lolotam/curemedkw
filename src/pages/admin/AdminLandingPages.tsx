import { Link } from "react-router-dom";
import { ArrowRight, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HERO_PAGES } from "@/lib/heroSlides";

export default function AdminLandingPages() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Landing Pages</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage hero slides (images & videos) for each landing page.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {HERO_PAGES.map((p) => (
          <Link key={p.key} to={`/admin/landing/${p.key}`}>
            <Card className="p-5 flex items-center gap-4 hover:bg-muted/40 transition-colors">
              <div className="h-12 w-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{p.label}</p>
                <p className="text-xs text-muted-foreground truncate">{p.route}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}