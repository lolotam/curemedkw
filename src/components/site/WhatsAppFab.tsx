import { useI18n } from "@/lib/i18n";
import { logOperation } from "@/lib/logs";

const PHONE = "96560003759";

export function WhatsAppFab() {
  const { lang, t } = useI18n();
  const text = lang === "ar" ? "السلام عليكم، عندي استفسار عن المنتجات" : "Hello, I'd like to ask about your products";
  const href = `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`;

  const handleClick = () => {
    logOperation({ category: "whatsapp", operation: "whatsapp_click", status: "info", metadata: { phone: PHONE, page: window.location.pathname } });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsapp.label")}
      className="fixed bottom-6 right-6 rtl:right-auto rtl:left-6 z-50 group"
      onClick={handleClick}
    >
      <span className="absolute inset-0 rounded-full bg-[hsl(142,70%,49%)]/35 animate-ping" />
      <span
        className="relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, hsl(142 78% 62%) 0%, hsl(142 70% 49%) 45%, hsl(142 76% 35%) 100%)",
          boxShadow:
            "0 14px 28px -8px hsl(142 70% 30% / 0.55), 0 6px 10px -4px hsl(142 70% 25% / 0.4), inset 0 -3px 8px hsl(142 78% 25% / 0.45), inset 0 2px 6px hsl(0 0% 100% / 0.35)",
        }}
      >
        {/* WhatsApp glyph */}
        <svg viewBox="0 0 32 32" className="h-8 w-8 drop-shadow" fill="currentColor" aria-hidden="true">
          <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 01-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 01-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977.873 2.834 1.36 2.51 3.41 4.802 6.026 5.93.402.172.832.314 1.262.43.502.13 1.018.115 1.519.013.704-.143 1.74-.715 2.075-1.36.13-.245.245-.502.285-.762.117-.625-.86-1.07-1.32-1.234zM16 30.2c-7.79 0-14.2-6.41-14.2-14.2S8.21 1.8 16 1.8 30.2 8.21 30.2 16 23.79 30.2 16 30.2zm0-26.71c-6.91 0-12.51 5.6-12.51 12.51 0 2.45.7 4.83 2.04 6.86l-1.34 4.92 5.05-1.32c1.95 1.06 4.13 1.62 6.36 1.62h.01c6.91 0 12.51-5.6 12.51-12.51 0-3.34-1.3-6.49-3.66-8.85a12.43 12.43 0 00-8.85-3.66z" />
        </svg>
      </span>
    </a>
  );
}