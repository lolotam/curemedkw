import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import curemedLogo from "@/assets/curemed-logo.png";

const SEEN_KEY = "curemed.loader.seen";

export default function Loading() {
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    // If already seen this session, skip animation
    if (sessionStorage.getItem(SEEN_KEY)) {
      navigate("/curemed", { replace: true });
      return;
    }
    sessionStorage.setItem(SEEN_KEY, "1");
    const timer = setTimeout(() => navigate("/curemed", { replace: true }), 2200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      data-brand="curemed"
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: "hsl(var(--curemed-beige))" }}
    >
      <div className="animate-logo-pulse">
        <img src={curemedLogo} alt="Curemed" className="h-16 md:h-20 w-auto" />
      </div>
      <p className="mt-8 text-sm tracking-widest uppercase text-muted-foreground animate-fade-in-up">
        {t("loader.tagline")}
      </p>
      <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full w-1/3 rounded-full bg-brand animate-[marquee_1.4s_linear_infinite]" />
      </div>
    </div>
  );
}