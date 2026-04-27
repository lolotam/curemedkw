import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { BRAND_LIST, BRANDS } from "@/lib/brands";
import { Mail, Phone, MapPin } from "lucide-react";
import curemedLogo from "@/assets/curemed-logo.png";

const CUREMED_INSTAGRAM = "https://www.instagram.com/curemedkw/";

export function SiteFooter({ brand = "curemed" }: { brand?: string }) {
  const { t, lang } = useI18n();
  const brandMeta = Object.values(BRANDS).find((b) => b.themeAttr === brand);
  const logo = brandMeta?.logo ?? curemedLogo;
  const brandName = brandMeta?.name ?? "Curemed";
  const seoText = brandMeta
    ? brandMeta.seo[lang as "en" | "ar"] ?? brandMeta.seo.en
    : t("about.body");
  const instagram = brandMeta?.instagram ?? CUREMED_INSTAGRAM;
  const instagramHandle = `@${instagram.replace(/\/+$/, "").split("/").pop()}`;
  return (
    <footer className="border-t border-border/50 bg-muted/30 mt-16">
      <div className="container py-12 grid gap-8 md:grid-cols-4">
        <div className="space-y-3">
          <img src={logo} alt={brandName} className="h-12 w-auto object-contain" />
          <p className="text-sm text-muted-foreground max-w-xs">{seoText}</p>
          <a
            href={instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${brandName} on Instagram`}
            className="group inline-flex items-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md transition-transform duration-300 group-hover:scale-110"
              style={{
                background:
                  "radial-gradient(circle at 30% 110%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </span>
            {instagramHandle}
          </a>
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
            <li className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Kuwait – Hawally – Tunis St – Gulf Mart Complex, Floor 2, Office 2</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <a href="tel:+96560003759" className="hover:text-brand transition-colors">+965 6000 3759</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <a href="mailto:info@curemed.com" className="hover:text-brand transition-colors">info@curemed.com</a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">{brandName}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/curemed" className="hover:text-brand">{t("nav.home")}</Link></li>
            <li><Link to="/about" className="hover:text-brand">{t("nav.about")}</Link></li>
            <li><Link to="/contact" className="hover:text-brand">{t("nav.contact")}</Link></li>
            <li><Link to="/admin" className="hover:text-brand">{t("nav.admin")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/50 py-4">
        <div className="container text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {brandName}. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}