import * as React from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

export const TRANSLATIONS: Dict = {
  "nav.home": { en: "Home", ar: "الرئيسية" },
  "nav.about": { en: "About", ar: "من نحن" },
  "nav.brands": { en: "Brands", ar: "العلامات" },
  "nav.products": { en: "Products", ar: "المنتجات" },
  "nav.contact": { en: "Contact", ar: "تواصل معنا" },
  "nav.admin": { en: "Admin", ar: "الإدارة" },

  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.discover": { en: "Discover", ar: "اكتشف" },
  "common.viewAll": { en: "View all", ar: "عرض الكل" },
  "common.viewProduct": { en: "View product", ar: "عرض المنتج" },
  "common.shopAll": { en: "Explore products", ar: "تصفح المنتجات" },
  "common.featured": { en: "Featured", ar: "مميز" },
  "common.inStock": { en: "In stock", ar: "متوفر" },
  "common.lowStock": { en: "Low stock", ar: "كمية محدودة" },
  "common.outOfStock": { en: "Out of stock", ar: "غير متوفر" },
  "common.relatedProducts": { en: "You may also like", ar: "قد يعجبك أيضاً" },
  "common.backToBrand": { en: "Back to brand", ar: "العودة إلى العلامة" },

  "hero.title": { en: "Your trusted partner in healthcare solutions", ar: "شريكك الموثوق في حلول الرعاية الصحية" },
  "hero.subtitle": {
    en: "Curemed brings together a curated portfolio of world-class pharmaceutical, dermatological and wellness brands — distributed with care across Kuwait.",
    ar: "تجمع كيورميد بين باقة مختارة من أفضل العلامات الدوائية والجلدية والعافية في العالم — يتم توزيعها بعناية في جميع أنحاء الكويت.",
  },
  "hero.exploreBrands": { en: "Explore our brands", ar: "تصفح علاماتنا" },

  "brands.title": { en: "Our brands", ar: "علاماتنا" },
  "brands.subtitle": { en: "Four trusted brands, one curated portfolio.", ar: "أربع علامات موثوقة، باقة واحدة منتقاة." },

  "spotlight.title": { en: "Featured products", ar: "منتجات مميزة" },

  "about.title": { en: "About Curemed", ar: "عن كيورميد" },
  "about.body": {
    en: "Curemed is a Kuwait-based pharmaceuticals and medical supplies company. We carefully select partner brands and product portfolios based on quality, efficacy and safety — supported by experienced medical and sales representatives.",
    ar: "كيورميد شركة كويتية متخصصة في توزيع الأدوية والمستلزمات الطبية. نختار شركاءنا ومنتجاتنا بعناية وفقاً لمعايير الجودة والفعالية والسلامة، يدعمنا فريق محترف من المندوبين الطبيين وذوي الخبرة.",
  },

  "pillars.title": { en: "What we do", ar: "ماذا نقدم" },
  "pillars.pharma.title": { en: "Pharmaceuticals", ar: "الأدوية" },
  "pillars.pharma.body": { en: "Trusted medicines and OTC solutions.", ar: "أدوية موثوقة وحلول صحية متاحة دون وصفة." },
  "pillars.skincare.title": { en: "Skincare", ar: "العناية بالبشرة" },
  "pillars.skincare.body": { en: "Dermatologically tested daily care.", ar: "عناية يومية مختبرة جلدياً." },
  "pillars.wellness.title": { en: "Wellness", ar: "العافية" },
  "pillars.wellness.body": { en: "Modern Ayurveda and self-care.", ar: "أيورفيدا حديثة وعناية ذاتية." },
  "pillars.medical.title": { en: "Medical supplies", ar: "المستلزمات الطبية" },
  "pillars.medical.body": { en: "Equipment for clinics and homes.", ar: "معدات للعيادات والمنازل." },

  "testimonials.title": { en: "What people say", ar: "آراء عملائنا" },
  "faq.title": { en: "Frequently asked questions", ar: "الأسئلة الشائعة" },

  "contact.title": { en: "Get in touch", ar: "تواصل معنا" },
  "contact.subtitle": { en: "Send us a message — we usually reply within one business day.", ar: "أرسل لنا رسالة — نرد عادةً خلال يوم عمل واحد." },
  "contact.name": { en: "Your name", ar: "الاسم" },
  "contact.email": { en: "Email", ar: "البريد الإلكتروني" },
  "contact.phone": { en: "Phone (optional)", ar: "الهاتف (اختياري)" },
  "contact.subject": { en: "Subject", ar: "الموضوع" },
  "contact.message": { en: "Message", ar: "الرسالة" },
  "contact.send": { en: "Send message", ar: "إرسال" },
  "contact.success": { en: "Thanks! Your message has been received.", ar: "شكراً! تم استلام رسالتك." },
  "contact.error": { en: "Please fill out all required fields.", ar: "يرجى تعبئة جميع الحقول المطلوبة." },

  "newsletter.title": { en: "Stay in the loop", ar: "ابقَ على اطلاع" },
  "newsletter.subtitle": { en: "New products, offers and brand news — straight to your inbox.", ar: "منتجات جديدة وعروض وأخبار العلامات مباشرة إلى بريدك." },
  "newsletter.placeholder": { en: "your@email.com", ar: "بريدك@example.com" },
  "newsletter.subscribe": { en: "Subscribe", ar: "اشترك" },
  "newsletter.success": { en: "Subscribed! Welcome aboard.", ar: "تم الاشتراك! أهلاً بك." },

  "footer.rights": { en: "All rights reserved.", ar: "جميع الحقوق محفوظة." },

  "loader.tagline": { en: "Trusted healthcare solutions", ar: "حلول الرعاية الصحية الموثوقة" },

  "product.ingredients": { en: "Ingredients", ar: "المكونات" },
  "product.benefits": { en: "Benefits", ar: "الفوائد" },
  "product.usage": { en: "How to use", ar: "طريقة الاستخدام" },
  "product.size": { en: "Size", ar: "الحجم" },
  "product.sku": { en: "SKU", ar: "رمز المنتج" },

  "admin.login.title": { en: "Admin sign in", ar: "تسجيل دخول الإدارة" },
  "admin.login.password": { en: "Password", ar: "كلمة المرور" },
  "admin.login.submit": { en: "Sign in", ar: "تسجيل الدخول" },
  "admin.login.invalid": { en: "Incorrect password.", ar: "كلمة المرور غير صحيحة." },

  "categories.title": { en: "Shop by category", ar: "تسوّق حسب الفئة" },
  "categories.subtitle": { en: "Find what you need, by area of care.", ar: "اعثر على ما تحتاجه حسب مجال العناية." },
  "category.allProducts": { en: "All products", ar: "جميع المنتجات" },
  "category.noProducts": { en: "No products in this category yet.", ar: "لا توجد منتجات في هذه الفئة بعد." },
  "filter.title": { en: "Filter by", ar: "تصفية حسب" },
  "filter.areas": { en: "Areas", ar: "المجالات" },
  "filter.clear": { en: "Clear filters", ar: "إزالة التصفية" },

  "discount.was": { en: "Was", ar: "كان" },
  "discount.now": { en: "Now", ar: "الآن" },
  "discount.badge": { en: "OFF", ar: "خصم" },
  "discount.title": { en: "Special offers", ar: "عروض خاصة" },
  "discount.subtitle": { en: "Save more on these limited-time deals.", ar: "وفّر أكثر مع هذه العروض لفترة محدودة." },
  "filter.discounted": { en: "Discounted only", ar: "العروض فقط" },
  "category.subcategories": { en: "Subcategories", ar: "الفئات الفرعية" },
  "viewing.now": { en: "viewing now", ar: "يتصفحون الآن" },
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
}

const I18nContext = React.createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem("curemed.lang") as Lang) || "en";
  });

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("curemed.lang", l);
  }, []);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const t = React.useCallback(
    (key: string) => TRANSLATIONS[key]?.[lang] ?? key,
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}