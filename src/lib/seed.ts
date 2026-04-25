import type { Product, Message, Subscriber, BrandKey } from "./db";
import { placeholderImage } from "./placeholder";

const stableId = (b: string, i: number) => `seed-${b}-${i}`;

interface Seed {
  brand: BrandKey;
  name: string;
  category: string;
  price: number;
  shortDescription: string;
  longDescription: string;
  ingredients: string[];
  benefits: string[];
  usage: string;
  size: string;
  tags: string[];
  featured?: boolean;
}

const SEEDS: Seed[] = [
  // ===== Flexitol =====
  {
    brand: "flexitol", name: "Heel Balm", category: "Foot Care", price: 8.5,
    shortDescription: "Intensive 25% urea balm for cracked heels and very dry feet.",
    longDescription: "Flexitol Heel Balm is a clinically tested foot cream formulated with 25% urea to soften, smooth, and visibly repair dry, rough, and cracked heels. Suitable for daily use and recommended for diabetic foot care.",
    ingredients: ["25% Urea", "Shea Butter", "Vitamin E", "Glycerin", "Lanolin"],
    benefits: ["Repairs cracked heels", "Deeply moisturizes", "Suitable for diabetics", "Visible results in days"],
    usage: "Apply liberally to heels and rough areas of the feet morning and night, or as needed.",
    size: "112g", tags: ["foot care", "cracked heels", "urea"], featured: true,
  },
  {
    brand: "flexitol", name: "Lip Balm SPF 30", category: "Lip Care", price: 4.9,
    shortDescription: "Hydrating lip balm with broad-spectrum SPF 30 sun protection.",
    longDescription: "Flexitol Lip Balm provides intensive hydration and broad-spectrum SPF 30 protection. Enriched with shea butter and vitamin E to soothe dry, chapped lips while shielding them from the sun.",
    ingredients: ["Shea Butter", "Vitamin E", "SPF 30 Filters", "Beeswax"],
    benefits: ["SPF 30 protection", "All-day hydration", "Soothes chapped lips", "Pocket-sized"],
    usage: "Apply to lips as needed throughout the day.",
    size: "4.25g", tags: ["lip care", "spf"],
  },
  {
    brand: "flexitol", name: "Hand Balm", category: "Hand Care", price: 6.0,
    shortDescription: "Fast-absorbing 10% urea balm for very dry, working hands.",
    longDescription: "Designed for hands that work hard, Flexitol Hand Balm uses 10% urea, glycerin and shea butter to deeply hydrate, repair and protect dry, cracked hands without leaving a greasy residue.",
    ingredients: ["10% Urea", "Shea Butter", "Glycerin", "Aloe Vera"],
    benefits: ["Non-greasy formula", "Repairs dry skin", "Fast absorbing", "Daily use"],
    usage: "Massage into hands as often as needed, especially after washing.",
    size: "75g", tags: ["hand care", "urea"],
  },
  {
    brand: "flexitol", name: "Diabetic Foot Cream", category: "Foot Care", price: 11.0,
    shortDescription: "Specialist daily moisturizer designed for diabetic feet.",
    longDescription: "A daily-use cream specifically developed for the unique needs of diabetic skin. Helps maintain healthy moisture levels, soothes dryness and supports overall foot skin condition.",
    ingredients: ["10% Urea", "Dimethicone", "Vitamin E", "Glycerin"],
    benefits: ["Diabetic-friendly", "Daily moisture", "Soothes dryness", "Dermatologically tested"],
    usage: "Apply once or twice daily to clean, dry feet.",
    size: "85g", tags: ["diabetic", "foot care"], featured: true,
  },
  {
    brand: "flexitol", name: "Body Lotion", category: "Body Care", price: 9.5,
    shortDescription: "Daily body lotion for very dry and sensitive skin.",
    longDescription: "A lightweight yet deeply hydrating body lotion formulated for very dry and sensitive skin. Absorbs quickly to leave skin soft, smooth and comfortable all day.",
    ingredients: ["Urea", "Glycerin", "Shea Butter", "Allantoin"],
    benefits: ["24h hydration", "Sensitive skin friendly", "Lightweight", "Non-sticky"],
    usage: "Apply all over the body after showering or as needed.",
    size: "250ml", tags: ["body lotion", "sensitive"],
  },

  // ===== Kapiva =====
  {
    brand: "kapiva", name: "Himalayan Shilajit Resin", category: "Capsules", price: 35.0,
    shortDescription: "Pure Himalayan shilajit for energy, stamina and vitality.",
    longDescription: "Sourced from high-altitude Himalayan rocks and triple-purified, Kapiva Shilajit is a potent adaptogen that supports natural energy, stamina, and overall vitality.",
    ingredients: ["Pure Himalayan Shilajit Resin"],
    benefits: ["Boosts energy", "Improves stamina", "Supports vitality", "100% pure"],
    usage: "Dissolve a pea-sized amount in warm water or milk, once daily.",
    size: "20g", tags: ["energy", "ayurveda"], featured: true,
  },
  {
    brand: "kapiva", name: "Aloe Vera Juice", category: "Juices", price: 14.0,
    shortDescription: "Cold-pressed aloe vera juice for digestion and skin.",
    longDescription: "Made from hand-scraped aloe vera pulp grown without pesticides, this juice supports healthy digestion, immunity and glowing skin from within.",
    ingredients: ["Aloe Vera Pulp", "Natural Preservatives"],
    benefits: ["Aids digestion", "Improves skin", "Boosts immunity", "No artificial colors"],
    usage: "30ml mixed with water on an empty stomach in the morning.",
    size: "1L", tags: ["digestion", "skin"],
  },
  {
    brand: "kapiva", name: "Get Slim Mini Juice", category: "Juices", price: 12.0,
    shortDescription: "Ayurvedic blend to support healthy weight management.",
    longDescription: "A targeted Ayurvedic juice combining green coffee, garcinia and guggul to help curb cravings, boost metabolism and support healthy weight management goals.",
    ingredients: ["Green Coffee", "Garcinia", "Guggul", "Vrikshamla"],
    benefits: ["Supports weight loss", "Curbs cravings", "Boosts metabolism", "Ayurvedic blend"],
    usage: "30ml twice daily before meals with warm water.",
    size: "500ml", tags: ["weight", "fitness"],
  },
  {
    brand: "kapiva", name: "Ashwagandha Gold Tablets", category: "Capsules", price: 18.0,
    shortDescription: "Premium ashwagandha for stress relief and better sleep.",
    longDescription: "High-potency ashwagandha tablets standardized for withanolides to help the body manage stress, improve sleep quality and build resilience naturally.",
    ingredients: ["Ashwagandha Extract (KSM-66)", "Black Pepper"],
    benefits: ["Reduces stress", "Improves sleep", "Builds stamina", "Supports immunity"],
    usage: "1 tablet twice daily after meals.",
    size: "60 tablets", tags: ["stress", "sleep"],
  },
  {
    brand: "kapiva", name: "Hair Vitals Gummies", category: "Gummies", price: 22.0,
    shortDescription: "Tasty biotin gummies for stronger hair, skin and nails.",
    longDescription: "Delicious strawberry-flavored gummies packed with biotin, amla and bamboo shoot to nourish hair from within and support healthy skin and nails.",
    ingredients: ["Biotin", "Amla", "Bamboo Shoot Extract", "Vitamin E"],
    benefits: ["Stronger hair", "Glowing skin", "Healthier nails", "Tasty daily ritual"],
    usage: "Chew 2 gummies daily.",
    size: "30 gummies", tags: ["hair", "skin", "gummies"], featured: true,
  },

  // ===== NADA =====
  {
    brand: "nada", name: "Breath & Belly Capsules — Raspberry", category: "Raspberry", price: 7.5,
    shortDescription: "Sugar-free four-layer capsules in sweet raspberry flavor.",
    longDescription: "NADA's signature four-layer capsule with a sweet raspberry shell that melts in your mouth for instant breath freshness, while the inner core works in the stomach for lasting belly freshness.",
    ingredients: ["Sorbitol", "Natural Raspberry Flavor", "Plant Oils", "Mint Extract"],
    benefits: ["Instant fresh breath", "Belly freshening", "Sugar free", "Pocket sized"],
    usage: "Take 1–2 capsules as needed for fresh breath and stomach freshness.",
    size: "30 capsules", tags: ["breath", "raspberry"], featured: true,
  },
  {
    brand: "nada", name: "Breath & Belly Capsules — Melon", category: "Melon", price: 7.5,
    shortDescription: "Refreshing melon flavor for breath and belly freshness.",
    longDescription: "Four-layer capsules with a juicy melon flavor that dissolves in the mouth for instant freshness and continues to work in the stomach for long-lasting confidence.",
    ingredients: ["Sorbitol", "Natural Melon Flavor", "Plant Oils", "Mint Extract"],
    benefits: ["Fresh breath all day", "Sugar free", "Travel friendly", "Dual action"],
    usage: "Take 1–2 capsules as needed.",
    size: "30 capsules", tags: ["breath", "melon"],
  },
  {
    brand: "nada", name: "Breath & Belly Capsules — Peppermint", category: "Peppermint", price: 7.5,
    shortDescription: "Strong peppermint flavor for instant cool freshness.",
    longDescription: "An intense peppermint version of NADA's iconic four-layer capsule, perfect after meals or coffee. Cools instantly in the mouth and freshens from within.",
    ingredients: ["Sorbitol", "Natural Peppermint Oil", "Plant Oils"],
    benefits: ["Strong cool sensation", "Eliminates bad breath", "Sugar free", "After-meal freshness"],
    usage: "Take 1–2 capsules as needed.",
    size: "30 capsules", tags: ["breath", "peppermint"], featured: true,
  },
  {
    brand: "nada", name: "Breath & Belly Capsules — Honey Lemon", category: "Honey Lemon", price: 7.5,
    shortDescription: "Soothing honey-lemon flavor that freshens mouth and stomach.",
    longDescription: "A soft, comforting honey-lemon flavor that melts in the mouth for fresh breath and reaches the digestive system to reduce unpleasant stomach odors.",
    ingredients: ["Sorbitol", "Natural Honey Flavor", "Lemon Extract", "Plant Oils"],
    benefits: ["Soothing flavor", "Sugar free", "Long-lasting freshness", "Comfortable on the stomach"],
    usage: "Take 1–2 capsules as needed.",
    size: "30 capsules", tags: ["breath", "honey", "lemon"],
  },
  {
    brand: "nada", name: "NADA Variety Pack", category: "Raspberry", price: 26.0,
    shortDescription: "Try all four NADA flavors in one convenient pack.",
    longDescription: "Discover all four iconic NADA flavors — Raspberry, Melon, Peppermint and Honey Lemon — in one variety pack. The perfect gift or starter set.",
    ingredients: ["See individual packs"],
    benefits: ["All four flavors", "Great value", "Perfect gift", "Sugar free"],
    usage: "Use as needed.",
    size: "4 × 30 capsules", tags: ["variety", "gift"],
  },

  // ===== ABC Australian Bodycare =====
  {
    brand: "abc", name: "Tea Tree Body Wash", category: "Body Wash", price: 12.0,
    shortDescription: "Daily body wash with natural Tea Tree Oil for clean, healthy skin.",
    longDescription: "A gentle, antibacterial body wash powered by Australian Tea Tree Oil. Cleanses the skin without drying it out, helping to keep skin clean, balanced and healthy every day.",
    ingredients: ["Tea Tree Oil", "Glycerin", "Aloe Vera", "Mild Surfactants"],
    benefits: ["Antibacterial cleanse", "Family friendly", "Doesn't dry skin", "Daily use"],
    usage: "Apply to wet skin, lather, and rinse. Use daily in the shower.",
    size: "500ml", tags: ["tea tree", "body wash"], featured: true,
  },
  {
    brand: "abc", name: "Tea Tree Body Lotion", category: "Lotion", price: 14.5,
    shortDescription: "Hydrating Tea Tree body lotion for smooth, healthy skin.",
    longDescription: "A nourishing body lotion enriched with Tea Tree Oil and natural moisturizers to keep skin soft, supple and protected against everyday irritation.",
    ingredients: ["Tea Tree Oil", "Shea Butter", "Vitamin E", "Glycerin"],
    benefits: ["Long-lasting hydration", "Soothes irritation", "Non-greasy", "Daily care"],
    usage: "Massage into the skin after showering.",
    size: "250ml", tags: ["lotion", "tea tree"],
  },
  {
    brand: "abc", name: "Tea Tree Shampoo", category: "Hair Care", price: 13.0,
    shortDescription: "Anti-dandruff shampoo with purifying Tea Tree Oil.",
    longDescription: "A purifying shampoo that uses Tea Tree Oil to gently cleanse the scalp, help reduce dandruff and leave hair feeling fresh, light and balanced.",
    ingredients: ["Tea Tree Oil", "Panthenol", "Mild Cleansers"],
    benefits: ["Reduces dandruff", "Balances scalp", "Gentle cleanse", "Daily use"],
    usage: "Massage into wet hair, lather and rinse. Suitable for daily use.",
    size: "250ml", tags: ["shampoo", "scalp"],
  },
  {
    brand: "abc", name: "Tea Tree Deodorant", category: "Deodorant", price: 9.0,
    shortDescription: "Long-lasting deodorant with skin-friendly Tea Tree Oil.",
    longDescription: "A long-lasting roll-on deodorant powered by Tea Tree Oil to neutralize odor naturally while being kind to sensitive underarm skin.",
    ingredients: ["Tea Tree Oil", "Aluminum-Free Actives", "Aloe Vera"],
    benefits: ["24h freshness", "Aluminum free", "Skin friendly", "Subtle scent"],
    usage: "Apply to clean, dry underarms each morning.",
    size: "65ml", tags: ["deodorant", "tea tree"], featured: true,
  },
  {
    brand: "abc", name: "Tea Tree Face Wash", category: "Body Wash", price: 11.0,
    shortDescription: "Gentle Tea Tree face wash for clear, balanced skin.",
    longDescription: "A daily face wash that uses Tea Tree Oil to deeply clean pores, help control breakouts and leave skin feeling refreshed and balanced — without stripping it.",
    ingredients: ["Tea Tree Oil", "Salicylic Acid", "Aloe Vera"],
    benefits: ["Cleans pores", "Helps control breakouts", "Refreshing", "Daily use"],
    usage: "Massage onto wet face morning and evening, then rinse with water.",
    size: "150ml", tags: ["face wash", "tea tree"],
  },
];

function makeProduct(s: Seed, idx: number): Product {
  const sku = `${s.brand.toUpperCase()}-${String(idx + 1).padStart(3, "0")}`;
  const main = placeholderImage(s.brand, s.name, 0);
  const gallery = [main, placeholderImage(s.brand, s.name, 1), placeholderImage(s.brand, s.name, 2)];
  const now = Date.now() - idx * 1000 * 60 * 60;
  return {
    id: stableId(s.brand, idx),
    brand: s.brand,
    name: s.name,
    category: s.category,
    price: s.price,
    shortDescription: s.shortDescription,
    longDescription: s.longDescription,
    mainImage: main,
    gallery,
    ingredients: s.ingredients,
    benefits: s.benefits,
    usage: s.usage,
    size: s.size,
    sku,
    stockStatus: "in_stock",
    featured: !!s.featured,
    tags: s.tags,
    createdAt: now,
    updatedAt: now,
  };
}

export function seedDatabase(): {
  products: Product[];
  messages: Message[];
  subscribers: Subscriber[];
} {
  const products = SEEDS.map(makeProduct);

  const now = Date.now();
  const messages: Message[] = [
    {
      id: "seed-msg-1", name: "Sarah Al-Sabah", email: "sarah@example.com",
      brand: "flexitol", subject: "Diabetic foot cream availability",
      message: "Hello, I would like to know if the Flexitol Diabetic Foot Cream is available in pharmacies in Kuwait City. Thank you!",
      read: false, createdAt: now - 1000 * 60 * 30,
    },
    {
      id: "seed-msg-2", name: "Ahmed Khaled", email: "ahmed.k@example.com",
      brand: "nada", subject: "Wholesale inquiry",
      message: "I run a small chain of pharmacies and would love to discuss carrying NADA capsules. Please get in touch.",
      read: false, createdAt: now - 1000 * 60 * 60 * 4,
    },
    {
      id: "seed-msg-3", name: "Mariam Yousef", email: "mariam@example.com",
      brand: "curemed", subject: "General question",
      message: "Are you hiring medical sales representatives? I would love to apply.",
      read: true, createdAt: now - 1000 * 60 * 60 * 28,
    },
  ];

  const subscribers: Subscriber[] = [
    { id: "seed-sub-1", email: "noura@example.com", createdAt: now - 1000 * 60 * 60 * 2 },
    { id: "seed-sub-2", email: "fahad@example.com", createdAt: now - 1000 * 60 * 60 * 24 },
    { id: "seed-sub-3", email: "lulwa@example.com", createdAt: now - 1000 * 60 * 60 * 72 },
  ];

  return { products, messages, subscribers };
}