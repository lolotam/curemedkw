import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST } from "@/lib/brands";
import { Mail, Phone, MapPin } from "lucide-react";
import curemedLogo from "@/assets/curemed-logo.png";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border/50 bg-muted/30 mt-16">
      <div className="container py-12 grid gap-8 md:grid-cols-4">
        <div className="space-y-3">
          <img src={curemedLogo} alt="Curemed" className="h-10 w-auto" />
          <p className="text-sm text-muted-foreground max-w-xs">
            {t("about.body")}
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">{t("nav.brands")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {BRAND_LIST.map((b) => (
              <li key={b.key}>
                <Link to={`/${b.slug}`} className="hover:text-brand transition-colors">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">{t("nav.contact")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Kuwait City, Kuwait</li>
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> +965 0000 0000</li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> info@curemed.com</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Curemed</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/curemed" className="hover:text-brand">{t("nav.home")}</Link></li>
            <li><Link to="/admin" className="hover:text-brand">{t("nav.admin")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/50 py-4">
        <div className="container text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Curemed. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}