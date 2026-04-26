// Kuwaiti name + area pools used for the live-order ticker and other social-proof widgets.

export const KW_MEN_NAMES = [
  { en: "Abdullah", ar: "عبدالله" },
  { en: "Yousef", ar: "يوسف" },
  { en: "Bader", ar: "بدر" },
  { en: "Faisal", ar: "فيصل" },
  { en: "Mohammad", ar: "محمد" },
  { en: "Khalid", ar: "خالد" },
  { en: "Ahmad", ar: "أحمد" },
  { en: "Saud", ar: "سعود" },
  { en: "Nasser", ar: "ناصر" },
  { en: "Hamad", ar: "حمد" },
  { en: "Salem", ar: "سالم" },
  { en: "Talal", ar: "طلال" },
  { en: "Meshal", ar: "مشعل" },
  { en: "Fahad", ar: "فهد" },
  { en: "Jassem", ar: "جاسم" },
];

export const KW_WOMEN_NAMES = [
  { en: "Noura", ar: "نورة" },
  { en: "Sara", ar: "سارة" },
  { en: "Maryam", ar: "مريم" },
  { en: "Latifa", ar: "لطيفة" },
  { en: "Dalal", ar: "دلال" },
  { en: "Shaikha", ar: "شيخة" },
  { en: "Hessa", ar: "حصة" },
  { en: "Fatima", ar: "فاطمة" },
  { en: "Reem", ar: "ريم" },
  { en: "Aisha", ar: "عائشة" },
  { en: "Bibi", ar: "بيبي" },
  { en: "Mona", ar: "منى" },
  { en: "Ghadeer", ar: "غدير" },
  { en: "Munira", ar: "منيرة" },
  { en: "Rania", ar: "رانيا" },
];

export const KW_AREAS = [
  { en: "Salmiya", ar: "السالمية" },
  { en: "Hawally", ar: "حولي" },
  { en: "Jahra", ar: "الجهراء" },
  { en: "Farwaniya", ar: "الفروانية" },
  { en: "Ahmadi", ar: "الأحمدي" },
  { en: "Mubarak Al-Kabeer", ar: "مبارك الكبير" },
  { en: "Capital", ar: "العاصمة" },
  { en: "Mishref", ar: "مشرف" },
  { en: "Bayan", ar: "بيان" },
  { en: "Jabriya", ar: "الجابرية" },
  { en: "Rumaithiya", ar: "الرميثية" },
  { en: "Surra", ar: "السرة" },
];

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}