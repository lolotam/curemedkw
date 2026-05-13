import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Seo } from "@/components/site/Seo";

const NotFound = () => {
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <>
      <Seo
        title="404 — Page not found | Curemed"
        description="The page you are looking for does not exist."
        path={location.pathname}
        noindex
      />
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">404</h1>
          <p className="mb-2 text-xl font-semibold">{t("notfound.title")}</p>
          <p className="mb-4 text-muted-foreground">{t("notfound.subtitle")}</p>
          <a href="/" className="text-primary underline hover:text-primary/90">
            {t("notfound.cta")}
          </a>
        </div>
      </div>
    </>
  );
};

export default NotFound;
