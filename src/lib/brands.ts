import type { BrandKey } from "./db";

export interface BrandMeta {
  key: BrandKey;
  slug: string;
  name: string;
  tagline: { en: string; ar: string };
  about: { en: string; ar: string };
  themeAttr: string;
  categories: string[];
}

export const BRANDS: Record<BrandKey, BrandMeta> = {
  flexitol: {
    key: "flexitol",
    slug: "flexitol",
    name: "Flexitol",
    tagline: {
      en: "Intense moisturization for very dry skin",
      ar: "ترطيب مكثف للبشرة شديدة الجفاف",
    },
    about: {
      en: "Clinically tested skincare for lips, hands, feet, body and scalp — suitable for diabetic foot care and the whole family.",
      ar: "عناية بالبشرة مختبرة سريرياً للشفاه واليدين والقدمين والجسم وفروة الرأس — مناسبة للعناية بقدم مرضى السكري ولجميع أفراد العائلة.",
    },
    themeAttr: "flexitol",
    categories: ["Foot Care", "Hand Care", "Lip Care", "Body Care"],
  },
  kapiva: {
    key: "kapiva",
    slug: "kapiva",
    name: "Kapiva",
    tagline: {
      en: "Modern Ayurveda for everyday wellness",
      ar: "أيورفيدا حديثة لعافية يومية",
    },
    about: {
      en: "Science-backed Ayurvedic juices, capsules and gummies designed around real wellness goals — energy, fitness, sugar management and more.",
      ar: "عصائر وكبسولات وحلوى أيورفيدية مدعومة بالعلم لتحقيق أهداف عافية حقيقية — الطاقة واللياقة وإدارة السكر والمزيد.",
    },
    themeAttr: "kapiva",
    categories: ["Juices", "Capsules", "Gummies", "Wellness Foods"],
  },
  nada: {
    key: "nada",
    slug: "nada",
    name: "NADA",
    tagline: {
      en: "Breath & belly freshness in one capsule",
      ar: "انتعاش الفم والمعدة في كبسولة واحدة",
    },
    about: {
      en: "Sugar-free four-layer capsules from Japan that freshen your breath instantly and continue working in your stomach for lasting confidence.",
      ar: "كبسولات يابانية رباعية الطبقات وخالية من السكر تنعش النفس فوراً وتستمر في العمل داخل المعدة لثقة تدوم طويلاً.",
    },
    themeAttr: "nada",
    categories: ["Raspberry", "Melon", "Peppermint", "Honey Lemon"],
  },
  abc: {
    key: "abc",
    slug: "australian-bodycare",
    name: "Australian Bodycare",
    tagline: {
      en: "Tea Tree Oil care for healthy skin every day",
      ar: "عناية بزيت شجرة الشاي لبشرة صحية كل يوم",
    },
    about: {
      en: "Daily skin and hair care powered by natural Tea Tree Oil — antibacterial, antiseptic and gentle for the whole family.",
      ar: "عناية يومية بالبشرة والشعر بقوة زيت شجرة الشاي الطبيعي — مضاد للبكتيريا ومطهّر ولطيف على جميع أفراد العائلة.",
    },
    themeAttr: "abc",
    categories: ["Body Wash", "Lotion", "Hair Care", "Deodorant"],
  },
};

export const BRAND_LIST: BrandMeta[] = [
  BRANDS.flexitol,
  BRANDS.kapiva,
  BRANDS.nada,
  BRANDS.abc,
];

export const slugToBrand = (slug: string): BrandKey | null => {
  const m = BRAND_LIST.find((b) => b.slug === slug);
  return m ? m.key : null;
};