// Hierarchical region data: Country → Governorate → Area
// Compiled from Wikipedia governorate lists, national post offices and tourism boards.
// Display names are bilingual; the EN value is the canonical stored value.

export type LocalizedName = { en: string; ar: string };
export type Area = LocalizedName;
export type Governorate = LocalizedName & { areas: Area[] };
export type Country = LocalizedName & {
  code: string;
  dialCode: string;
  governorates: Governorate[];
};

export const COUNTRIES: Country[] = [
  // ===================== KUWAIT =====================
  {
    code: "KW",
    dialCode: "+965",
    en: "Kuwait",
    ar: "الكويت",
    governorates: [
      {
        en: "Capital",
        ar: "العاصمة",
        areas: [
          { en: "Sharq", ar: "شرق" },
          { en: "Mirqab", ar: "المرقاب" },
          { en: "Dasman", ar: "دسمان" },
          { en: "Qibla", ar: "القبلة" },
          { en: "Dasma", ar: "الدسمة" },
          { en: "Daiya", ar: "الدعية" },
          { en: "Mansouriya", ar: "المنصورية" },
          { en: "Adailiya", ar: "العديلية" },
          { en: "Khaldiya", ar: "الخالدية" },
          { en: "Shamiya", ar: "الشامية" },
          { en: "Faiha", ar: "الفيحاء" },
          { en: "Nuzha", ar: "النزهة" },
          { en: "Surra", ar: "السرة" },
          { en: "Yarmouk", ar: "اليرموك" },
          { en: "Rawda", ar: "الروضة" },
          { en: "Qadsia", ar: "القادسية" },
          { en: "Kaifan", ar: "كيفان" },
          { en: "Qortuba", ar: "قرطبة" },
          { en: "Sulaibikhat", ar: "الصليبخات" },
          { en: "Doha", ar: "الدوحة" },
          { en: "Shuwaikh", ar: "الشويخ" },
          { en: "Granada", ar: "غرناطة" },
          { en: "Jaber Al-Ahmad", ar: "جابر الأحمد" },
          { en: "North West Sulaibikhat", ar: "شمال غرب الصليبخات" },
        ],
      },
      {
        en: "Hawalli",
        ar: "حولي",
        areas: [
          { en: "Hawalli", ar: "حولي" },
          { en: "Salmiya", ar: "السالمية" },
          { en: "Rumaithiya", ar: "الرميثية" },
          { en: "Bayan", ar: "بيان" },
          { en: "Mishref", ar: "مشرف" },
          { en: "Jabriya", ar: "الجابرية" },
          { en: "Salwa", ar: "سلوى" },
          { en: "Shaab", ar: "الشعب" },
          { en: "Hittin", ar: "حطين" },
          { en: "Zahra", ar: "الزهراء" },
          { en: "Anjafa", ar: "أنجفة" },
          { en: "Bida'a", ar: "البدع" },
          { en: "Maidan Hawalli", ar: "ميدان حولي" },
          { en: "Nigra", ar: "النقرة" },
        ],
      },
      {
        en: "Farwaniya",
        ar: "الفروانية",
        areas: [
          { en: "Farwaniya", ar: "الفروانية" },
          { en: "Khaitan", ar: "خيطان" },
          { en: "Riggae", ar: "الرقعي" },
          { en: "Andalous", ar: "الأندلس" },
          { en: "Ardiya", ar: "العارضية" },
          { en: "Jleeb Al-Shuyoukh", ar: "جليب الشيوخ" },
          { en: "Sabah Al-Nasser", ar: "صباح الناصر" },
          { en: "Rabia", ar: "الرابية" },
          { en: "Ishbiliya", ar: "إشبيلية" },
          { en: "Firdous", ar: "الفردوس" },
          { en: "Omariya", ar: "العمرية" },
          { en: "Rehab", ar: "الرحاب" },
          { en: "Abdullah Al-Mubarak", ar: "عبدالله المبارك" },
          { en: "Abraq Khaitan", ar: "أبرق خيطان" },
        ],
      },
      {
        en: "Mubarak Al-Kabeer",
        ar: "مبارك الكبير",
        areas: [
          { en: "Adan", ar: "العدان" },
          { en: "Qurain", ar: "القرين" },
          { en: "Qusour", ar: "القصور" },
          { en: "Messila", ar: "المسيلة" },
          { en: "Sabah Al-Salem", ar: "صباح السالم" },
          { en: "Funaitees", ar: "الفنيطيس" },
          { en: "Abu Al Hasaniya", ar: "أبو الحصانية" },
          { en: "Abu Fatira", ar: "أبو فطيرة" },
          { en: "Mubarak Al-Kabeer", ar: "مبارك الكبير" },
          { en: "South Wista", ar: "جنوب الوسطى" },
        ],
      },
      {
        en: "Ahmadi",
        ar: "الأحمدي",
        areas: [
          { en: "Fahaheel", ar: "الفحيحيل" },
          { en: "Mahboula", ar: "المهبولة" },
          { en: "Mangaf", ar: "المنقف" },
          { en: "Abu Halifa", ar: "أبو حليفة" },
          { en: "Fintas", ar: "الفنطاس" },
          { en: "Egaila", ar: "العقيلة" },
          { en: "Wafra", ar: "الوفرة" },
          { en: "Ahmadi", ar: "الأحمدي" },
          { en: "Ali Al-Salem", ar: "علي صباح السالم" },
          { en: "Hadiya", ar: "هدية" },
          { en: "Riqqa", ar: "الرقة" },
          { en: "Sabahiya", ar: "الصباحية" },
          { en: "Jaber Al-Ali", ar: "جابر العلي" },
          { en: "Bnaider", ar: "بنيدر" },
          { en: "Khairan", ar: "الخيران" },
          { en: "Nuwaiseeb", ar: "النويصيب" },
          { en: "Zoor", ar: "الزور" },
          { en: "Dhaher", ar: "الظهر" },
        ],
      },
      {
        en: "Jahra",
        ar: "الجهراء",
        areas: [
          { en: "Jahra", ar: "الجهراء" },
          { en: "Saad Al-Abdullah", ar: "سعد العبدالله" },
          { en: "Naseem", ar: "النسيم" },
          { en: "Oyoun", ar: "العيون" },
          { en: "Qasr", ar: "القصر" },
          { en: "Taima", ar: "تيماء" },
          { en: "Sulaibiya", ar: "الصليبية" },
          { en: "Waha", ar: "الواحة" },
          { en: "Naeem", ar: "النعيم" },
          { en: "Amghara", ar: "أمغرة" },
          { en: "Abdali", ar: "العبدلي" },
          { en: "Subiya", ar: "الصبية" },
        ],
      },
    ],
  },

  // ===================== UAE =====================
  {
    code: "AE",
    dialCode: "+971",
    en: "United Arab Emirates",
    ar: "الإمارات العربية المتحدة",
    governorates: [
      {
        en: "Abu Dhabi",
        ar: "أبوظبي",
        areas: [
          { en: "Corniche", ar: "الكورنيش" },
          { en: "Khalidiya", ar: "الخالدية" },
          { en: "Al Bateen", ar: "البطين" },
          { en: "Al Reem Island", ar: "جزيرة الريم" },
          { en: "Yas Island", ar: "جزيرة ياس" },
          { en: "Saadiyat Island", ar: "جزيرة السعديات" },
          { en: "Mussafah", ar: "مصفح" },
          { en: "Al Ain", ar: "العين" },
          { en: "Madinat Zayed", ar: "مدينة زايد" },
          { en: "Khalifa City", ar: "مدينة خليفة" },
          { en: "Al Raha", ar: "الراحة" },
          { en: "Al Nahyan", ar: "آل نهيان" },
          { en: "Al Mushrif", ar: "المشرف" },
          { en: "Tourist Club Area", ar: "منطقة النادي السياحي" },
        ],
      },
      {
        en: "Dubai",
        ar: "دبي",
        areas: [
          { en: "Deira", ar: "ديرة" },
          { en: "Bur Dubai", ar: "بر دبي" },
          { en: "Jumeirah", ar: "جميرا" },
          { en: "Dubai Marina", ar: "دبي مارينا" },
          { en: "JLT", ar: "أبراج بحيرات جميرا" },
          { en: "Downtown Dubai", ar: "وسط مدينة دبي" },
          { en: "Business Bay", ar: "الخليج التجاري" },
          { en: "Al Barsha", ar: "البرشاء" },
          { en: "Mirdif", ar: "مردف" },
          { en: "Al Qusais", ar: "القصيص" },
          { en: "Discovery Gardens", ar: "ديسكفري جاردنز" },
          { en: "JVC", ar: "قرية جميرا الدائرية" },
          { en: "Silicon Oasis", ar: "واحة دبي للسيليكون" },
          { en: "Arabian Ranches", ar: "المرابع العربية" },
          { en: "Palm Jumeirah", ar: "نخلة جميرا" },
          { en: "DIFC", ar: "مركز دبي المالي العالمي" },
          { en: "Al Karama", ar: "الكرامة" },
          { en: "Al Satwa", ar: "السطوة" },
          { en: "Dubai Investment Park", ar: "مجمع دبي للاستثمار" },
        ],
      },
      {
        en: "Sharjah",
        ar: "الشارقة",
        areas: [
          { en: "Al Majaz", ar: "المجاز" },
          { en: "Al Nahda", ar: "النهدة" },
          { en: "Al Khan", ar: "الخان" },
          { en: "Al Qasimia", ar: "القاسمية" },
          { en: "Muwaileh", ar: "مويلح" },
          { en: "University City", ar: "المدينة الجامعية" },
          { en: "Al Taawun", ar: "التعاون" },
          { en: "Al Mamzar", ar: "الممزر" },
          { en: "Khor Fakkan", ar: "خورفكان" },
          { en: "Kalba", ar: "كلباء" },
        ],
      },
      {
        en: "Ajman",
        ar: "عجمان",
        areas: [
          { en: "Al Nuaimiya", ar: "النعيمية" },
          { en: "Al Rashidiya", ar: "الراشدية" },
          { en: "Al Jurf", ar: "الجرف" },
          { en: "Al Hamidiyah", ar: "الحميدية" },
          { en: "Al Rawda", ar: "الروضة" },
          { en: "Al Mowaihat", ar: "المويهات" },
        ],
      },
      {
        en: "Ras Al Khaimah",
        ar: "رأس الخيمة",
        areas: [
          { en: "Al Nakheel", ar: "النخيل" },
          { en: "Al Hamra", ar: "الحمراء" },
          { en: "Al Marjan Island", ar: "جزيرة المرجان" },
          { en: "Khuzam", ar: "خزام" },
          { en: "Julphar", ar: "جلفار" },
          { en: "Mina Al Arab", ar: "ميناء العرب" },
        ],
      },
      {
        en: "Umm Al Quwain",
        ar: "أم القيوين",
        areas: [
          { en: "Old Town", ar: "المدينة القديمة" },
          { en: "Al Salamah", ar: "السلامة" },
          { en: "Al Raas", ar: "الراس" },
          { en: "Al Maidan", ar: "الميدان" },
        ],
      },
      {
        en: "Fujairah",
        ar: "الفجيرة",
        areas: [
          { en: "Fujairah City", ar: "مدينة الفجيرة" },
          { en: "Dibba", ar: "دبا" },
          { en: "Al Aqah", ar: "العقة" },
          { en: "Masafi", ar: "مسافي" },
          { en: "Al Bidya", ar: "البدية" },
        ],
      },
    ],
  },

  // ===================== SAUDI ARABIA =====================
  {
    code: "SA",
    dialCode: "+966",
    en: "Saudi Arabia",
    ar: "المملكة العربية السعودية",
    governorates: [
      {
        en: "Riyadh Province",
        ar: "منطقة الرياض",
        areas: [
          { en: "Riyadh", ar: "الرياض" },
          { en: "Diriyah", ar: "الدرعية" },
          { en: "Al Kharj", ar: "الخرج" },
          { en: "Al Majma'ah", ar: "المجمعة" },
          { en: "Al Dawadmi", ar: "الدوادمي" },
          { en: "Al Zulfi", ar: "الزلفي" },
          { en: "Wadi Al-Dawasir", ar: "وادي الدواسر" },
          { en: "Shaqra", ar: "شقراء" },
        ],
      },
      {
        en: "Makkah Province",
        ar: "منطقة مكة المكرمة",
        areas: [
          { en: "Mecca", ar: "مكة المكرمة" },
          { en: "Jeddah", ar: "جدة" },
          { en: "Taif", ar: "الطائف" },
          { en: "Rabigh", ar: "رابغ" },
          { en: "Al Qunfudhah", ar: "القنفذة" },
          { en: "Al Lith", ar: "الليث" },
          { en: "Khulais", ar: "خليص" },
          { en: "Al Jumum", ar: "الجموم" },
        ],
      },
      {
        en: "Madinah Province",
        ar: "منطقة المدينة المنورة",
        areas: [
          { en: "Medina", ar: "المدينة المنورة" },
          { en: "Yanbu", ar: "ينبع" },
          { en: "Al-Ula", ar: "العلا" },
          { en: "Badr", ar: "بدر" },
          { en: "Khaybar", ar: "خيبر" },
          { en: "Mahd Al Dhahab", ar: "مهد الذهب" },
        ],
      },
      {
        en: "Eastern Province",
        ar: "المنطقة الشرقية",
        areas: [
          { en: "Dammam", ar: "الدمام" },
          { en: "Al Khobar", ar: "الخبر" },
          { en: "Dhahran", ar: "الظهران" },
          { en: "Al-Ahsa (Hofuf)", ar: "الأحساء (الهفوف)" },
          { en: "Jubail", ar: "الجبيل" },
          { en: "Qatif", ar: "القطيف" },
          { en: "Ras Tanura", ar: "رأس تنورة" },
          { en: "Hafr Al-Batin", ar: "حفر الباطن" },
        ],
      },
      {
        en: "Qassim Province",
        ar: "منطقة القصيم",
        areas: [
          { en: "Buraidah", ar: "بريدة" },
          { en: "Unaizah", ar: "عنيزة" },
          { en: "Al Rass", ar: "الرس" },
          { en: "Al Mithnab", ar: "المذنب" },
          { en: "Al Bukayriyah", ar: "البكيرية" },
        ],
      },
      {
        en: "Asir Province",
        ar: "منطقة عسير",
        areas: [
          { en: "Abha", ar: "أبها" },
          { en: "Khamis Mushait", ar: "خميس مشيط" },
          { en: "Bisha", ar: "بيشة" },
          { en: "Muhayil", ar: "محايل" },
          { en: "Sarat Abidah", ar: "سراة عبيدة" },
        ],
      },
      {
        en: "Tabuk Province",
        ar: "منطقة تبوك",
        areas: [
          { en: "Tabuk", ar: "تبوك" },
          { en: "Duba", ar: "ضباء" },
          { en: "Umluj", ar: "أملج" },
          { en: "Haql", ar: "حقل" },
          { en: "NEOM", ar: "نيوم" },
        ],
      },
      {
        en: "Hail Province",
        ar: "منطقة حائل",
        areas: [
          { en: "Hail", ar: "حائل" },
          { en: "Baqaa", ar: "بقعاء" },
          { en: "Al Ghazalah", ar: "الغزالة" },
        ],
      },
      {
        en: "Northern Borders",
        ar: "الحدود الشمالية",
        areas: [
          { en: "Arar", ar: "عرعر" },
          { en: "Rafha", ar: "رفحاء" },
          { en: "Turaif", ar: "طريف" },
        ],
      },
      {
        en: "Jazan Province",
        ar: "منطقة جازان",
        areas: [
          { en: "Jazan", ar: "جازان" },
          { en: "Sabya", ar: "صبيا" },
          { en: "Abu Arish", ar: "أبو عريش" },
          { en: "Farasan", ar: "فرسان" },
        ],
      },
      {
        en: "Najran Province",
        ar: "منطقة نجران",
        areas: [
          { en: "Najran", ar: "نجران" },
          { en: "Sharurah", ar: "شرورة" },
          { en: "Habuna", ar: "حبونا" },
        ],
      },
      {
        en: "Al Bahah Province",
        ar: "منطقة الباحة",
        areas: [
          { en: "Al Bahah", ar: "الباحة" },
          { en: "Baljurashi", ar: "بلجرشي" },
          { en: "Al Mandaq", ar: "المندق" },
        ],
      },
      {
        en: "Al Jouf Province",
        ar: "منطقة الجوف",
        areas: [
          { en: "Sakaka", ar: "سكاكا" },
          { en: "Qurayyat", ar: "القريات" },
          { en: "Dumat Al-Jandal", ar: "دومة الجندل" },
        ],
      },
    ],
  },

  // ===================== QATAR =====================
  {
    code: "QA",
    dialCode: "+974",
    en: "Qatar",
    ar: "قطر",
    governorates: [
      {
        en: "Doha",
        ar: "الدوحة",
        areas: [
          { en: "West Bay", ar: "الخليج الغربي" },
          { en: "The Pearl", ar: "اللؤلؤة" },
          { en: "Msheireb", ar: "مشيرب" },
          { en: "Al Sadd", ar: "السد" },
          { en: "Bin Mahmoud", ar: "بن محمود" },
          { en: "Al Waab", ar: "الوعب" },
          { en: "Aspire Zone", ar: "منطقة أسباير" },
          { en: "Old Airport", ar: "المطار القديم" },
          { en: "Najma", ar: "نجمة" },
          { en: "Mansoura", ar: "المنصورة" },
          { en: "Al Mamoura", ar: "المعمورة" },
          { en: "Al Dafna", ar: "الدفنة" },
        ],
      },
      {
        en: "Al Rayyan",
        ar: "الريان",
        areas: [
          { en: "Al Rayyan", ar: "الريان" },
          { en: "Education City", ar: "المدينة التعليمية" },
          { en: "Al Gharrafa", ar: "الغرافة" },
          { en: "Muaither", ar: "معيذر" },
          { en: "Bani Hajer", ar: "بني هاجر" },
          { en: "Al Luqta", ar: "اللقطة" },
        ],
      },
      {
        en: "Al Wakrah",
        ar: "الوكرة",
        areas: [
          { en: "Al Wakrah", ar: "الوكرة" },
          { en: "Al Wukair", ar: "الوكير" },
          { en: "Mesaieed", ar: "مسيعيد" },
          { en: "Al Mashaf", ar: "المشاف" },
        ],
      },
      {
        en: "Lusail",
        ar: "لوسيل",
        areas: [
          { en: "Lusail Marina", ar: "مارينا لوسيل" },
          { en: "Fox Hills", ar: "فوكس هيلز" },
          { en: "Qetaifan Island", ar: "جزيرة قطيفان" },
        ],
      },
      {
        en: "Al Khor",
        ar: "الخور",
        areas: [
          { en: "Al Khor", ar: "الخور" },
          { en: "Al Thakhira", ar: "الذخيرة" },
        ],
      },
      {
        en: "Umm Salal",
        ar: "أم صلال",
        areas: [
          { en: "Umm Salal Mohammed", ar: "أم صلال محمد" },
          { en: "Umm Salal Ali", ar: "أم صلال علي" },
        ],
      },
      {
        en: "Al Daayen",
        ar: "الضعاين",
        areas: [
          { en: "Al Daayen", ar: "الضعاين" },
          { en: "Leabaib", ar: "لعبيب" },
        ],
      },
      {
        en: "Al Shamal",
        ar: "الشمال",
        areas: [
          { en: "Madinat Al Shamal", ar: "مدينة الشمال" },
          { en: "Ar Ru'ays", ar: "الرويس" },
        ],
      },
    ],
  },

  // ===================== BAHRAIN =====================
  {
    code: "BH",
    dialCode: "+973",
    en: "Bahrain",
    ar: "البحرين",
    governorates: [
      {
        en: "Capital",
        ar: "العاصمة",
        areas: [
          { en: "Manama", ar: "المنامة" },
          { en: "Juffair", ar: "الجفير" },
          { en: "Adliya", ar: "العدلية" },
          { en: "Seef", ar: "السيف" },
          { en: "Hoora", ar: "الحورة" },
          { en: "Gudaibiya", ar: "القضيبية" },
          { en: "Salmaniya", ar: "السلمانية" },
          { en: "Diplomatic Area", ar: "المنطقة الدبلوماسية" },
        ],
      },
      {
        en: "Muharraq",
        ar: "المحرق",
        areas: [
          { en: "Muharraq City", ar: "مدينة المحرق" },
          { en: "Hidd", ar: "الحد" },
          { en: "Arad", ar: "عراد" },
          { en: "Galali", ar: "قلالي" },
          { en: "Busaiteen", ar: "البسيتين" },
          { en: "Amwaj Islands", ar: "جزر أمواج" },
          { en: "Dair", ar: "الدير" },
        ],
      },
      {
        en: "Northern",
        ar: "الشمالية",
        areas: [
          { en: "Hamad Town", ar: "مدينة حمد" },
          { en: "Budaiya", ar: "البديع" },
          { en: "Saar", ar: "سار" },
          { en: "Janabiya", ar: "الجنبية" },
          { en: "Jasra", ar: "الجسرة" },
          { en: "Diraz", ar: "الدراز" },
          { en: "Bani Jamra", ar: "بني جمرة" },
        ],
      },
      {
        en: "Southern",
        ar: "الجنوبية",
        areas: [
          { en: "Riffa", ar: "الرفاع" },
          { en: "Isa Town", ar: "مدينة عيسى" },
          { en: "Sitra", ar: "سترة" },
          { en: "Awali", ar: "عوالي" },
          { en: "Zallaq", ar: "الزلاق" },
          { en: "Sakhir", ar: "الصخير" },
          { en: "Nuwaidrat", ar: "النويدرات" },
        ],
      },
    ],
  },

  // ===================== OMAN =====================
  {
    code: "OM",
    dialCode: "+968",
    en: "Oman",
    ar: "عُمان",
    governorates: [
      {
        en: "Muscat",
        ar: "مسقط",
        areas: [
          { en: "Muttrah", ar: "مطرح" },
          { en: "Bawshar", ar: "بوشر" },
          { en: "Seeb", ar: "السيب" },
          { en: "Al Amerat", ar: "العامرات" },
          { en: "Qurum", ar: "القرم" },
          { en: "Madinat Sultan Qaboos", ar: "مدينة السلطان قابوس" },
          { en: "Al Khuwair", ar: "الخوير" },
          { en: "Ruwi", ar: "روي" },
          { en: "Ghala", ar: "غلا" },
          { en: "Al Mouj", ar: "الموج" },
        ],
      },
      {
        en: "Dhofar",
        ar: "ظفار",
        areas: [
          { en: "Salalah", ar: "صلالة" },
          { en: "Mirbat", ar: "مرباط" },
          { en: "Taqah", ar: "طاقة" },
          { en: "Thumrait", ar: "ثمريت" },
        ],
      },
      {
        en: "Musandam",
        ar: "مسندم",
        areas: [
          { en: "Khasab", ar: "خصب" },
          { en: "Bukha", ar: "بخا" },
          { en: "Dibba", ar: "دبا" },
        ],
      },
      {
        en: "Al Buraimi",
        ar: "البريمي",
        areas: [
          { en: "Al Buraimi", ar: "البريمي" },
          { en: "Mahdah", ar: "محضة" },
        ],
      },
      {
        en: "Ad Dakhiliyah",
        ar: "الداخلية",
        areas: [
          { en: "Nizwa", ar: "نزوى" },
          { en: "Bahla", ar: "بهلاء" },
          { en: "Izki", ar: "إزكي" },
          { en: "Samail", ar: "سمائل" },
          { en: "Adam", ar: "أدم" },
        ],
      },
      {
        en: "Al Batinah North",
        ar: "شمال الباطنة",
        areas: [
          { en: "Sohar", ar: "صحار" },
          { en: "Shinas", ar: "شناص" },
          { en: "Liwa", ar: "لوى" },
          { en: "Saham", ar: "صحم" },
        ],
      },
      {
        en: "Al Batinah South",
        ar: "جنوب الباطنة",
        areas: [
          { en: "Rustaq", ar: "الرستاق" },
          { en: "Barka", ar: "بركاء" },
          { en: "Nakhl", ar: "نخل" },
          { en: "Al Awabi", ar: "العوابي" },
        ],
      },
      {
        en: "Ash Sharqiyah North",
        ar: "شمال الشرقية",
        areas: [
          { en: "Ibra", ar: "إبراء" },
          { en: "Bidiya", ar: "بدية" },
          { en: "Al Mudhaibi", ar: "المضيبي" },
          { en: "Al Qabil", ar: "القابل" },
        ],
      },
      {
        en: "Ash Sharqiyah South",
        ar: "جنوب الشرقية",
        areas: [
          { en: "Sur", ar: "صور" },
          { en: "Al Kamil Wal Wafi", ar: "الكامل والوافي" },
          { en: "Jalan Bani Bu Ali", ar: "جعلان بني بو علي" },
          { en: "Masirah", ar: "مصيرة" },
        ],
      },
      {
        en: "Adh Dhahirah",
        ar: "الظاهرة",
        areas: [
          { en: "Ibri", ar: "عبري" },
          { en: "Yanqul", ar: "ينقل" },
          { en: "Dhank", ar: "ضنك" },
        ],
      },
      {
        en: "Al Wusta",
        ar: "الوسطى",
        areas: [
          { en: "Haima", ar: "هيما" },
          { en: "Duqm", ar: "الدقم" },
          { en: "Mahout", ar: "محوت" },
        ],
      },
    ],
  },

  // ===================== LEBANON =====================
  {
    code: "LB",
    dialCode: "+961",
    en: "Lebanon",
    ar: "لبنان",
    governorates: [
      {
        en: "Beirut",
        ar: "بيروت",
        areas: [
          { en: "Achrafieh", ar: "الأشرفية" },
          { en: "Hamra", ar: "الحمراء" },
          { en: "Verdun", ar: "فردان" },
          { en: "Gemmayzeh", ar: "الجميزة" },
          { en: "Mar Mikhael", ar: "مار مخايل" },
          { en: "Badaro", ar: "بدارو" },
          { en: "Ras Beirut", ar: "رأس بيروت" },
          { en: "Downtown", ar: "وسط المدينة" },
          { en: "Sodeco", ar: "السوديكو" },
          { en: "Mazraa", ar: "المزرعة" },
          { en: "Tariq el Jdideh", ar: "طريق الجديدة" },
        ],
      },
      {
        en: "Mount Lebanon",
        ar: "جبل لبنان",
        areas: [
          { en: "Jounieh", ar: "جونية" },
          { en: "Byblos (Jbeil)", ar: "جبيل" },
          { en: "Baabda", ar: "بعبدا" },
          { en: "Aley", ar: "عاليه" },
          { en: "Broummana", ar: "برمانا" },
          { en: "Beit Mery", ar: "بيت مري" },
          { en: "Dbayeh", ar: "ضبية" },
          { en: "Antelias", ar: "أنطلياس" },
          { en: "Zalka", ar: "الزلقا" },
          { en: "Jal el Dib", ar: "جل الديب" },
          { en: "Hazmieh", ar: "الحازمية" },
          { en: "Mansourieh", ar: "المنصورية" },
        ],
      },
      {
        en: "North",
        ar: "الشمال",
        areas: [
          { en: "Tripoli", ar: "طرابلس" },
          { en: "Batroun", ar: "البترون" },
          { en: "Koura", ar: "الكورة" },
          { en: "Zgharta", ar: "زغرتا" },
          { en: "Bcharre", ar: "بشري" },
          { en: "Ehden", ar: "إهدن" },
        ],
      },
      {
        en: "Akkar",
        ar: "عكار",
        areas: [
          { en: "Halba", ar: "حلبا" },
          { en: "Bebnine", ar: "ببنين" },
          { en: "Qoubaiyat", ar: "القبيات" },
        ],
      },
      {
        en: "Bekaa",
        ar: "البقاع" ,
        areas: [
          { en: "Zahlé", ar: "زحلة" },
          { en: "Chtaura", ar: "شتورا" },
          { en: "Anjar", ar: "عنجر" },
          { en: "Rashaya", ar: "راشيا" },
          { en: "West Bekaa", ar: "البقاع الغربي" },
        ],
      },
      {
        en: "Baalbek-Hermel",
        ar: "بعلبك الهرمل",
        areas: [
          { en: "Baalbek", ar: "بعلبك" },
          { en: "Hermel", ar: "الهرمل" },
        ],
      },
      {
        en: "South",
        ar: "الجنوب",
        areas: [
          { en: "Sidon (Saida)", ar: "صيدا" },
          { en: "Tyre (Sour)", ar: "صور" },
          { en: "Jezzine", ar: "جزين" },
        ],
      },
      {
        en: "Nabatieh",
        ar: "النبطية",
        areas: [
          { en: "Nabatieh", ar: "النبطية" },
          { en: "Hasbaya", ar: "حاصبيا" },
          { en: "Marjayoun", ar: "مرجعيون" },
          { en: "Bint Jbeil", ar: "بنت جبيل" },
        ],
      },
    ],
  },

  // ===================== JORDAN =====================
  {
    code: "JO",
    dialCode: "+962",
    en: "Jordan",
    ar: "الأردن",
    governorates: [
      {
        en: "Amman",
        ar: "عمّان",
        areas: [
          { en: "Abdoun", ar: "عبدون" },
          { en: "Sweifieh", ar: "الصويفية" },
          { en: "Jabal Amman", ar: "جبل عمان" },
          { en: "Shmeisani", ar: "الشميساني" },
          { en: "Khalda", ar: "خلدا" },
          { en: "Dabouq", ar: "دابوق" },
          { en: "Tla Al-Ali", ar: "تلاع العلي" },
          { en: "Marj Al-Hamam", ar: "مرج الحمام" },
          { en: "Jubeiha", ar: "الجبيهة" },
          { en: "Deir Ghbar", ar: "دير غبار" },
          { en: "Um Uthaina", ar: "أم أذينة" },
          { en: "Mecca Street", ar: "شارع مكة" },
          { en: "Wadi Saqra", ar: "وادي صقرة" },
          { en: "Rabieh", ar: "الرابية" },
        ],
      },
      {
        en: "Zarqa",
        ar: "الزرقاء",
        areas: [
          { en: "Zarqa", ar: "الزرقاء" },
          { en: "Russeifa", ar: "الرصيفة" },
          { en: "Hashemiyah", ar: "الهاشمية" },
        ],
      },
      {
        en: "Irbid",
        ar: "إربد",
        areas: [
          { en: "Irbid", ar: "إربد" },
          { en: "Ramtha", ar: "الرمثا" },
          { en: "Kura", ar: "الكورة" },
          { en: "Bani Kinanah", ar: "بني كنانة" },
        ],
      },
      {
        en: "Aqaba",
        ar: "العقبة",
        areas: [
          { en: "Aqaba City", ar: "مدينة العقبة" },
          { en: "Quwayrah", ar: "القويرة" },
        ],
      },
      {
        en: "Balqa",
        ar: "البلقاء",
        areas: [
          { en: "Salt", ar: "السلط" },
          { en: "Fuheis", ar: "الفحيص" },
          { en: "Mahis", ar: "ماحص" },
          { en: "Deir Alla", ar: "دير علا" },
        ],
      },
      {
        en: "Madaba",
        ar: "مادبا",
        areas: [
          { en: "Madaba", ar: "مادبا" },
          { en: "Dhiban", ar: "ذيبان" },
        ],
      },
      {
        en: "Karak",
        ar: "الكرك",
        areas: [
          { en: "Karak", ar: "الكرك" },
          { en: "Mu'tah", ar: "مؤتة" },
          { en: "Al Qasr", ar: "القصر" },
        ],
      },
      {
        en: "Tafilah",
        ar: "الطفيلة",
        areas: [
          { en: "Tafilah", ar: "الطفيلة" },
          { en: "Bseira", ar: "بصيرا" },
        ],
      },
      {
        en: "Ma'an",
        ar: "معان",
        areas: [
          { en: "Ma'an", ar: "معان" },
          { en: "Petra (Wadi Musa)", ar: "البتراء (وادي موسى)" },
          { en: "Shoubak", ar: "الشوبك" },
        ],
      },
      {
        en: "Mafraq",
        ar: "المفرق",
        areas: [
          { en: "Mafraq", ar: "المفرق" },
          { en: "Northern Badia", ar: "البادية الشمالية" },
        ],
      },
      {
        en: "Jerash",
        ar: "جرش",
        areas: [
          { en: "Jerash", ar: "جرش" },
          { en: "Souf", ar: "سوف" },
        ],
      },
      {
        en: "Ajloun",
        ar: "عجلون",
        areas: [
          { en: "Ajloun", ar: "عجلون" },
          { en: "Kufranja", ar: "كفرنجة" },
        ],
      },
    ],
  },
];

export const findCountry = (en: string) => COUNTRIES.find((c) => c.en === en);
export const findGovernorate = (countryEn: string, govEn: string) =>
  findCountry(countryEn)?.governorates.find((g) => g.en === govEn);