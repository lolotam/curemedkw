import type { BrandKey } from "./db";

// Brand logos served from the public `brands-images` Supabase storage bucket.
const BRAND_LOGO_BASE =
  "https://yjvqzvmyritxegugfhkt.supabase.co/storage/v1/object/public/brands-images";
const flexitolLogo = `${BRAND_LOGO_BASE}/flexitol.png`;
const kapivaLogo = `${BRAND_LOGO_BASE}/kapiva.png`;
const nadaLogo = `${BRAND_LOGO_BASE}/NADA.png`;
const abcLogo = `${BRAND_LOGO_BASE}/Australian%20Bodycare.png`;
const lafesLogo = `${BRAND_LOGO_BASE}/Lafes.png`;
const hartingtonLogo = `${BRAND_LOGO_BASE}/Hartington.png`;
const phytopharLogo = `${BRAND_LOGO_BASE}/Phytophar.png`;

export interface BrandMeta {
  key: BrandKey;
  slug: string;
  name: string;
  shortName?: string;
  tagline: { en: string; ar: string };
  about: { en: string; ar: string };
  themeAttr: string;
  categories: string[];
  logo: string;
  instagram: string;
  seo: { en: string; ar: string };
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
    logo: flexitolLogo,
    instagram: "https://www.instagram.com/flexitolkw",
    seo: {
      en: "Flexitol Kuwait — Heel Balm, Hand Balm and intensive moisturizers for very dry skin and diabetic foot care.",
      ar: "فليكسيتول الكويت — بلسم الكعب واليدين ومرطبات مكثفة للبشرة شديدة الجفاف والعناية بقدم مرضى السكري.",
    },
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
    logo: kapivaLogo,
    instagram: "https://www.instagram.com/shilajitkapivakw",
    seo: {
      en: "Kapiva Kuwait — Ayurvedic juices, capsules and gummies for energy, fitness and natural wellness.",
      ar: "كابيفا الكويت — عصائر وكبسولات وحلوى أيورفيدية للطاقة واللياقة والعافية الطبيعية.",
    },
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
    logo: nadaLogo,
    instagram: "https://www.instagram.com/nudemintkw",
    seo: {
      en: "NADA Kuwait — Sugar-free Japanese breath capsules for instant freshness and lasting confidence.",
      ar: "ندى الكويت — كبسولات يابانية خالية من السكر لانتعاش فوري للنفس وثقة تدوم طويلاً.",
    },
  },
  abc: {
    key: "abc",
    slug: "australian-bodycare",
    name: "ABC",
    shortName: "ABC",
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
    logo: abcLogo,
    instagram: "https://www.instagram.com/australianbodycarekw",
    seo: {
      en: "Australian Bodycare Kuwait — Natural Tea Tree Oil body wash, lotion and hair care for the whole family.",
      ar: "أستراليان بودي كير الكويت — غسول الجسم واللوشن والعناية بالشعر بزيت شجرة الشاي الطبيعي لجميع أفراد العائلة.",
    },
  },
  lafes: {
    key: "lafes",
    slug: "lafes",
    name: "Lafe's",
    tagline: {
      en: "Clean, natural personal care",
      ar: "عناية شخصية طبيعية ونقية",
    },
    about: {
      en: "Plant-powered deodorants and body care, free from aluminum, parabens, and harsh chemicals — kind to your skin and the planet.",
      ar: "مزيلات عرق وعناية بالجسم بقوة النباتات، خالية من الألومنيوم والبارابين والمواد الكيميائية القاسية — لطيفة على بشرتك وعلى الكوكب.",
    },
    themeAttr: "lafes",
    categories: ["Deodorant", "Body Care"],
    logo: lafesLogo,
    instagram: "https://www.instagram.com/lafeskw",
    seo: {
      en: "Lafe's Kuwait — Natural aluminum-free deodorants and clean personal care for the whole family.",
      ar: "لافيز الكويت — مزيلات عرق طبيعية خالية من الألومنيوم وعناية شخصية نقية لجميع أفراد العائلة.",
    },
  },
  hartington: {
    key: "hartington",
    slug: "hartington",
    name: "Hartington Pharmaceutical",
    shortName: "Hartington",
    tagline: {
      en: "Trusted pharmaceutical care",
      ar: "رعاية صيدلانية موثوقة",
    },
    about: {
      en: "Pharmaceutical-grade products developed for everyday health needs — backed by science, designed for daily use.",
      ar: "منتجات بدرجة صيدلانية مصممة لاحتياجات الصحة اليومية — مدعومة بالعلم، صُممت للاستخدام اليومي.",
    },
    themeAttr: "hartington",
    categories: ["Health", "Wellness"],
    logo: hartingtonLogo,
    instagram: "https://www.instagram.com/hartingtonkw",
    seo: {
      en: "Hartington Pharmaceutical Kuwait — Trusted pharmaceutical-grade health and wellness products.",
      ar: "هارتنغتون فارماسيوتيكال الكويت — منتجات صحية وعافية بدرجة صيدلانية موثوقة.",
    },
  },
  phytophar: {
    key: "phytophar",
    slug: "phytophar",
    name: "Phytophar",
    tagline: {
      en: "Plant-based wellness solutions",
      ar: "حلول عافية نباتية",
    },
    about: {
      en: "Phytotherapy-inspired supplements and wellness products from natural plant sources — pure, potent and effective.",
      ar: "مكملات وحلول عافية مستوحاة من العلاج بالنباتات من مصادر طبيعية — نقية وفعالة وقوية.",
    },
    themeAttr: "phytophar",
    categories: ["Supplements", "Wellness"],
    logo: phytopharLogo,
    instagram: "https://www.instagram.com/phytopharkw",
    seo: {
      en: "Phytophar Kuwait — Plant-based phytotherapy supplements and natural wellness products.",
      ar: "فيتوفار الكويت — مكملات نباتية للعلاج بالأعشاب ومنتجات عافية طبيعية.",
    },
  },
};

export const BRAND_LIST: BrandMeta[] = [
  BRANDS.flexitol,
  BRANDS.kapiva,
  BRANDS.abc,
  BRANDS.nada,
  BRANDS.lafes,
  BRANDS.hartington,
  BRANDS.phytophar,
];

export const slugToBrand = (slug: string): BrandKey | null => {
  const m = BRAND_LIST.find((b) => b.slug === slug);
  return m ? m.key : null;
};