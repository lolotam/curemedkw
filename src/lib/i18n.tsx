import * as React from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

// HMR cache buster
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

  "price.contactUs": { en: "Contact us", ar: "تواصل معنا" },
  "price.contactForPrice": { en: "Contact us for price", ar: "تواصل معنا للسعر" },

  "cart.addToCart": { en: "Add to cart", ar: "أضف للسلة" },
  "cart.added": { en: "Added!", ar: "تمت الإضافة!" },
  "cart.title": { en: "Your cart", ar: "سلتك" },
  "cart.itemSingular": { en: "item", ar: "منتج" },
  "cart.itemPlural": { en: "items", ar: "منتجات" },
  "cart.summary": { en: "Order summary", ar: "ملخص الطلب" },
  "cart.subtotal": { en: "Subtotal", ar: "المجموع الفرعي" },
  "cart.shipping": { en: "Shipping", ar: "الشحن" },
  "cart.shippingNote": { en: "Calculated at delivery", ar: "يُحسب عند التوصيل" },
  "cart.total": { en: "Total", ar: "الإجمالي" },
  "cart.checkout": { en: "Proceed to checkout", ar: "إتمام الشراء" },
  "cart.clear": { en: "Clear cart", ar: "إفراغ السلة" },
  "cart.empty.title": { en: "Your cart is empty", ar: "سلتك فارغة" },
  "cart.empty.body": { en: "Browse our products and add items to your cart.", ar: "تصفح منتجاتنا وأضف العناصر إلى سلتك." },
  "cart.empty.cta": { en: "Browse products", ar: "تصفح المنتجات" },

  "checkout.title": { en: "Checkout", ar: "إتمام الشراء" },
  "checkout.contact": { en: "Contact information", ar: "معلومات التواصل" },
  "checkout.fullName": { en: "Full name", ar: "الاسم الكامل" },
  "checkout.email": { en: "Email", ar: "البريد الإلكتروني" },
  "checkout.phone": { en: "Phone", ar: "رقم الهاتف" },
  "checkout.address": { en: "Delivery address", ar: "عنوان التوصيل" },
  "checkout.country": { en: "Country", ar: "الدولة" },
  "checkout.countrySelect": { en: "Select country", ar: "اختر الدولة" },
  "checkout.governorate": { en: "Governorate", ar: "المحافظة" },
  "checkout.governorateSelect": { en: "Select governorate", ar: "اختر المحافظة" },
  "checkout.city": { en: "City", ar: "المدينة" },
  "checkout.area": { en: "Area", ar: "المنطقة" },
  "checkout.areaSelect": { en: "Select area", ar: "اختر المنطقة" },
  "checkout.block": { en: "Block", ar: "قطعة" },
  "checkout.street": { en: "Street", ar: "شارع" },
  "checkout.building": { en: "Building / House", ar: "مبنى / منزل" },
  "checkout.addressLine": { en: "Additional details", ar: "تفاصيل إضافية" },
  "checkout.addressLinePh": { en: "Floor, apartment, landmark…", ar: "الدور، الشقة، علامة مميزة…" },
  "checkout.notes": { en: "Order notes (optional)", ar: "ملاحظات الطلب (اختياري)" },
  "checkout.payment": { en: "Payment method", ar: "طريقة الدفع" },
  "checkout.cod": { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  "checkout.codDesc": { en: "Pay in cash when your order arrives.", ar: "ادفع نقداً عند استلام طلبك." },
  "checkout.payByLink": { en: "Pay by link", ar: "الدفع برابط" },
  "checkout.payByLinkDesc": { en: "We'll send you a secure payment link.", ar: "سنرسل لك رابط دفع آمن." },
  "checkout.placeOrder": { en: "Place order", ar: "تأكيد الطلب" },
  "checkout.success": { en: "Order placed successfully!", ar: "تم تقديم الطلب بنجاح!" },
  "checkout.error.required": { en: "Please fill in all required fields.", ar: "يرجى تعبئة الحقول المطلوبة." },
  "checkout.error.address": { en: "Please complete your delivery address.", ar: "يرجى إكمال عنوان التوصيل." },
  "checkout.error.country": { en: "Please select country and governorate.", ar: "يرجى اختيار الدولة والمحافظة." },
  "checkout.editCart": { en: "Edit your cart", ar: "تعديل سلتك" },
  "cart.decrease": { en: "Decrease", ar: "إنقاص" },
  "cart.increase": { en: "Increase", ar: "زيادة" },
  "cart.remove": { en: "Remove", ar: "إزالة" },
  "checkout.error.generic": { en: "Something went wrong. Please try again.", ar: "حدث خطأ. يرجى المحاولة مرة أخرى." },

  "order.thanks": { en: "Thank you for your order!", ar: "شكراً لطلبك!" },
  "order.received": { en: "We've received your order and will contact you soon.", ar: "لقد استلمنا طلبك وسنتواصل معك قريباً." },
  "order.number": { en: "Order number", ar: "رقم الطلب" },
  "order.continueShopping": { en: "Continue shopping", ar: "متابعة التسوق" },

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
 "pillars.eyebrow": { en: "Our Expertise", ar: "خبراتنا" },
 "pillars.subtitle": {
   en: "Four pillars that define how we care for every Kuwaiti home.",
   ar: "أربع ركائز تحدد كيف نعتني بكل بيت كويتي.",
 },
  "pillars.pharma.title": { en: "Pharmaceuticals", ar: "الأدوية" },
  "pillars.pharma.body": { en: "Trusted medicines and OTC solutions.", ar: "أدوية موثوقة وحلول صحية متاحة دون وصفة." },
  "pillars.skincare.title": { en: "Skincare", ar: "العناية بالبشرة" },
  "pillars.skincare.body": { en: "Dermatologically tested daily care.", ar: "عناية يومية مختبرة جلدياً." },
  "pillars.wellness.title": { en: "Food Supplement", ar: "المكملات الغذائية" },
  "pillars.wellness.body": { en: "Natural supplements for daily nutrition and vitality.", ar: "مكملات طبيعية للتغذية اليومية والحيوية." },
  "pillars.medical.title": { en: "Medical supplies", ar: "المستلزمات الطبية" },
  "pillars.medical.body": { en: "Equipment for clinics and homes.", ar: "معدات للعيادات والمنازل." },

  "testimonials.title": { en: "What people say", ar: "آراء عملائنا" },
  "testimonials.verifiedReview": { en: "Verified review", ar: "مراجعة موثقة" },
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
  "product.description": { en: "Description", ar: "الوصف" },
  "product.inquire": { en: "Inquire about this product", ar: "استفسر عن هذا المنتج" },
  "product.brand": { en: "Brand", ar: "العلامة" },
  "product.category": { en: "Category", ar: "الفئة" },

  "admin.login.title": { en: "Admin sign in", ar: "تسجيل دخول الإدارة" },
  "admin.login.password": { en: "Password", ar: "كلمة المرور" },
  "admin.login.submit": { en: "Sign in", ar: "تسجيل الدخول" },
  "admin.login.invalid": { en: "Incorrect password.", ar: "كلمة المرور غير صحيحة." },

  "categories.title": { en: "Shop by category", ar: "تسوّق حسب الفئة" },
  "categories.subtitle": { en: "Find what you need, by area of care.", ar: "اعثر على ما تحتاجه حسب مجال العناية." },
  "categories.product": { en: "product", ar: "منتج" },
  "categories.products": { en: "products", ar: "منتجات" },
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

  // About Us page
  "about.hero.eyebrow": { en: "About Curemed", ar: "عن كيورميد" },
  "about.hero.title": {
    en: "Your trusted healthcare partner in Kuwait",
    ar: "شريكك الموثوق في الرعاية الصحية في الكويت",
  },
  "about.hero.subtitle": {
    en: "Curemed is a Kuwait-based pharmaceutical and medical supplies distribution company, bringing the world's most trusted health, wellness and beauty brands to the Kuwaiti market — backed by a highly trained medical and sales team.",
    ar: "كيورميد شركة كويتية متخصصة في توزيع المستحضرات الصيدلانية والمستلزمات الطبية، تقدم أفضل العلامات العالمية في الصحة والعافية والجمال للسوق الكويتي — بدعم من فريق طبي ومبيعات مؤهل تأهيلاً عالياً.",
  },

  "about.story.title": { en: "Our Story", ar: "قصتنا" },
  "about.story.body": {
    en: "Curemed was built on a simple but powerful belief: that people in Kuwait deserve access to the same world-class health, skincare, and wellness innovations that are changing lives globally.\n\nWe started by identifying a gap in the Kuwaiti market — a lack of specialized, trustworthy distributors who could not only supply premium international brands but also educate, support, and serve the healthcare professionals and consumers who rely on them every day.\n\nFrom that foundation, Curemed has grown into a multi-brand distribution partner spanning dermatology, skincare, natural personal care, Ayurvedic nutrition, ENT and respiratory care, immune health supplements, and modern lifestyle wellness — all under one trusted Kuwaiti company.",
    ar: "تأسست كيورميد على قناعة بسيطة وقوية: أن أهل الكويت يستحقون الوصول إلى نفس ابتكارات الصحة والعناية بالبشرة والعافية العالمية التي تغيّر حياة الناس حول العالم.\n\nبدأنا برصد فجوة في السوق الكويتي — نقص الموزعين المتخصصين الموثوقين القادرين ليس فقط على توفير العلامات العالمية المتميزة، بل أيضاً على تثقيف ودعم وخدمة المهنيين الصحيين والمستهلكين الذين يعتمدون عليها يومياً.\n\nمن هذا الأساس، نمت كيورميد لتصبح شريك توزيع متعدد العلامات يشمل الأمراض الجلدية والعناية بالبشرة والعناية الشخصية الطبيعية والتغذية الأيورفيدية وعناية الأنف والأذن والتنفس ومكملات المناعة وعافية نمط الحياة الحديث — كل ذلك تحت مظلة شركة كويتية موثوقة واحدة.",
  },

  "about.mission.title": { en: "Our Mission", ar: "مهمتنا" },
  "about.mission.body": {
    en: "To improve the quality of life of people in Kuwait by connecting them with the world's most trusted and effective health, wellness, and personal care solutions — supported by a professional, knowledgeable, and caring team.",
    ar: "تحسين جودة حياة الناس في الكويت من خلال ربطهم بأكثر حلول الصحة والعافية والعناية الشخصية موثوقية وفعالية في العالم — بدعم من فريق محترف وعلى دراية ومهتم.",
  },

  "about.vision.title": { en: "Our Vision", ar: "رؤيتنا" },
  "about.vision.body": {
    en: "To be Kuwait's most trusted multi-specialty health and wellness distribution company — recognized for the quality of our portfolio, the depth of our expertise, and the lasting impact we make on the health of the communities we serve.",
    ar: "أن نكون أكثر شركات توزيع الصحة والعافية متعددة التخصصات موثوقية في الكويت — معترفاً بنا لجودة محفظتنا وعمق خبرتنا والأثر الدائم الذي نُحدثه في صحة المجتمعات التي نخدمها.",
  },

  "about.pillars.title": { en: "Our Three Pillars", ar: "ركائزنا الثلاث" },
  "about.pillars.subtitle": {
    en: "How we deliver on our promise — every day.",
    ar: "كيف نلتزم بوعدنا — كل يوم.",
  },
  "about.pillars.quality.title": { en: "Quality", ar: "الجودة" },
  "about.pillars.quality.body": {
    en: "Every brand and product we carry is held to the highest standards of efficacy, safety, and scientific credibility — products we'd recommend to our own families.",
    ar: "كل علامة ومنتج نقدمه يخضع لأعلى معايير الفعالية والسلامة والمصداقية العلمية — منتجات نوصي بها لعائلاتنا أنفسنا.",
  },
  "about.pillars.partnership.title": { en: "Partnership", ar: "الشراكة" },
  "about.pillars.partnership.body": {
    en: "Great distribution is built on genuine relationships — with our brand principals, healthcare partners, and customers. We offer expertise, responsiveness, and a team that stands behind every product.",
    ar: "يُبنى التوزيع الناجح على علاقات حقيقية — مع شركائنا في العلامات والصحة وعملائنا. نقدم الخبرة وسرعة الاستجابة وفريقاً يقف خلف كل منتج.",
  },
  "about.pillars.accessibility.title": { en: "Accessibility", ar: "إتاحة الوصول" },
  "about.pillars.accessibility.body": {
    en: "World-class health innovation should not be out of reach. We make our portfolio available to pharmacies, clinics, and consumers across Kuwait with fair pricing and reliable supply.",
    ar: "يجب ألا تكون ابتكارات الصحة العالمية بعيدة المنال. نتيح محفظتنا للصيدليات والعيادات والمستهلكين في الكويت بأسعار عادلة وإمداد موثوق.",
  },

  "about.why.title": { en: "Why Choose Curemed", ar: "لماذا كيورميد" },
  "about.why.subtitle": {
    en: "What we offer, and what it means for you.",
    ar: "ما نقدمه وما يعنيه لك.",
  },
  "about.why.portfolio.title": { en: "Curated international portfolio", ar: "محفظة عالمية منتقاة" },
  "about.why.portfolio.body": {
    en: "Access to proven, globally recognized brands selected with care.",
    ar: "وصول إلى علامات عالمية مُثبتة ومعروفة، مُختارة بعناية.",
  },
  "about.why.team.title": { en: "Highly trained team", ar: "فريق مُدرّب باحترافية" },
  "about.why.team.body": {
    en: "Expert medical and sales representatives who guide and educate at every step.",
    ar: "مندوبون طبيون ومبيعات خبراء يرشدونك ويوعّون في كل خطوة.",
  },
  "about.why.logistics.title": { en: "Reliable supply", ar: "إمداد موثوق" },
  "about.why.logistics.body": {
    en: "Consistent product availability — no disruption to your service.",
    ar: "توفر دائم للمنتجات — دون انقطاع في خدمتك.",
  },
  "about.why.expertise.title": { en: "Multi-category expertise", ar: "خبرة متعددة الفئات" },
  "about.why.expertise.body": {
    en: "One trusted partner for skincare, supplements, ENT, nutrition and more.",
    ar: "شريك موثوق واحد للعناية بالبشرة والمكملات والأنف والأذن والتغذية والمزيد.",
  },
  "about.why.presence.title": { en: "Local presence, global standards", ar: "حضور محلي بمعايير عالمية" },
  "about.why.presence.body": {
    en: "Fast, responsive service backed by international brand credibility.",
    ar: "خدمة سريعة ومتجاوبة مدعومة بمصداقية العلامات العالمية.",
  },
  "about.why.support.title": { en: "Full distributor support", ar: "دعم توزيع كامل" },
  "about.why.support.body": {
    en: "Training, marketing materials and after-sales service included.",
    ar: "يشمل التدريب والمواد التسويقية وخدمة ما بعد البيع.",
  },

  "about.values.title": { en: "Our Values", ar: "قيمنا" },
  "about.values.integrity.title": { en: "Integrity", ar: "النزاهة" },
  "about.values.integrity.body": {
    en: "Transparent about what products can and cannot do.",
    ar: "شفافية تامة بشأن ما تستطيع المنتجات وما لا تستطيع تقديمه.",
  },
  "about.values.excellence.title": { en: "Excellence", ar: "التميّز" },
  "about.values.excellence.body": {
    en: "High standards for ourselves and our brand partners.",
    ar: "معايير عالية لأنفسنا ولشركائنا في العلامات.",
  },
  "about.values.care.title": { en: "Care", ar: "الاهتمام" },
  "about.values.care.body": {
    en: "Behind every product is a person who needs help.",
    ar: "وراء كل منتج إنسان يحتاج إلى المساعدة.",
  },
  "about.values.innovation.title": { en: "Innovation", ar: "الابتكار" },
  "about.values.innovation.body": {
    en: "Seeking out brands offering genuine solutions to unmet needs.",
    ar: "البحث عن علامات تقدم حلولاً حقيقية لاحتياجات لم تُلبَّ.",
  },
  "about.values.partnership.title": { en: "Partnership", ar: "الشراكة" },
  "about.values.partnership.body": {
    en: "We succeed when our clients and partners succeed.",
    ar: "ننجح عندما ينجح عملاؤنا وشركاؤنا.",
  },

  // Contact page additions
  "contact.address.title": { en: "Address", ar: "العنوان" },
  "contact.address.body": {
    en: "Kuwait – Hawally – Tunis St – Gulf Mart Complex, Floor 2, Office 2",
    ar: "الكويت – حولي – شارع تونس – مجمع جلف مارت، الدور الثاني، مكتب 2",
  },
  "contact.phone.title": { en: "Phone", ar: "الهاتف" },
  "contact.email.title": { en: "Email", ar: "البريد الإلكتروني" },
  "contact.hours.title": { en: "Working Hours", ar: "ساعات العمل" },
  "contact.hours.weekdays": {
    en: "Sunday – Thursday: 8:00 AM – 4:00 PM",
    ar: "الأحد – الخميس: 8:00 صباحاً – 4:00 مساءً",
  },
  "contact.hours.weekend": {
    en: "Friday & Saturday: Closed",
    ar: "الجمعة والسبت: مغلق",
  },
  "contact.location.title": { en: "Find us on the map", ar: "موقعنا على الخريطة" },
};

// Account / auth keys
TRANSLATIONS["nav.account"] = { en: "Account", ar: "حسابي" };
TRANSLATIONS["nav.signin"] = { en: "Sign in", ar: "تسجيل الدخول" };
TRANSLATIONS["nav.signup"] = { en: "Sign up", ar: "إنشاء حساب" };
TRANSLATIONS["nav.signout"] = { en: "Sign out", ar: "تسجيل الخروج" };
TRANSLATIONS["nav.myOrders"] = { en: "My orders", ar: "طلباتي" };
TRANSLATIONS["nav.notifications"] = { en: "Notifications", ar: "الإشعارات" };

TRANSLATIONS["auth.email"] = { en: "Email", ar: "البريد الإلكتروني" };
TRANSLATIONS["auth.password"] = { en: "Password", ar: "كلمة المرور" };
TRANSLATIONS["auth.fullName"] = { en: "Full name", ar: "الاسم الكامل" };
TRANSLATIONS["auth.phone"] = { en: "Phone", ar: "رقم الهاتف" };
TRANSLATIONS["auth.signin.title"] = { en: "Welcome back", ar: "مرحباً بعودتك" };
TRANSLATIONS["auth.signup.title"] = { en: "Create your account", ar: "إنشاء حسابك" };
TRANSLATIONS["auth.signin.cta"] = { en: "Sign in", ar: "تسجيل الدخول" };
TRANSLATIONS["auth.signup.cta"] = { en: "Create account", ar: "إنشاء الحساب" };
TRANSLATIONS["auth.forgot"] = { en: "Forgot password?", ar: "نسيت كلمة المرور؟" };
TRANSLATIONS["auth.haveAccount"] = { en: "Have an account?", ar: "لديك حساب؟" };
TRANSLATIONS["auth.noAccount"] = { en: "Need an account?", ar: "ليس لديك حساب؟" };
TRANSLATIONS["auth.continueGoogle"] = { en: "Continue with Google", ar: "المتابعة مع جوجل" };
TRANSLATIONS["auth.or"] = { en: "or", ar: "أو" };
TRANSLATIONS["auth.reset.title"] = { en: "Reset your password", ar: "إعادة تعيين كلمة المرور" };
TRANSLATIONS["auth.reset.cta"] = { en: "Send reset link", ar: "إرسال رابط الاستعادة" };
TRANSLATIONS["auth.reset.body"] = { en: "Enter your email and we'll send you a link to reset your password.", ar: "أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور." };
TRANSLATIONS["auth.newPassword"] = { en: "New password", ar: "كلمة المرور الجديدة" };
TRANSLATIONS["auth.updatePassword"] = { en: "Update password", ar: "تحديث كلمة المرور" };
TRANSLATIONS["auth.checkEmail"] = { en: "Check your inbox for a confirmation link.", ar: "تحقق من بريدك للحصول على رابط التأكيد." };

TRANSLATIONS["account.title"] = { en: "My account", ar: "حسابي" };
TRANSLATIONS["account.tabs.profile"] = { en: "Profile", ar: "الملف الشخصي" };
TRANSLATIONS["account.tabs.orders"] = { en: "Orders", ar: "الطلبات" };
TRANSLATIONS["account.tabs.notifications"] = { en: "Notifications", ar: "الإشعارات" };
TRANSLATIONS["account.tabs.security"] = { en: "Security", ar: "الأمان" };
TRANSLATIONS["account.save"] = { en: "Save changes", ar: "حفظ التغييرات" };
TRANSLATIONS["account.uploadAvatar"] = { en: "Upload photo", ar: "رفع صورة" };
TRANSLATIONS["account.changePassword"] = { en: "Change password", ar: "تغيير كلمة المرور" };
TRANSLATIONS["account.noOrders"] = { en: "You haven't placed any orders yet.", ar: "لم تقم بأي طلب بعد." };
TRANSLATIONS["account.noNotifications"] = { en: "No notifications yet.", ar: "لا توجد إشعارات." };
TRANSLATIONS["account.markAllRead"] = { en: "Mark all as read", ar: "تعيين الكل كمقروء" };

TRANSLATIONS["coupon.label"] = { en: "Promo code", ar: "كود الخصم" };
TRANSLATIONS["coupon.apply"] = { en: "Apply", ar: "تطبيق" };
TRANSLATIONS["coupon.applied"] = { en: "Coupon applied", ar: "تم تطبيق الكوبون" };
TRANSLATIONS["coupon.remove"] = { en: "Remove", ar: "إزالة" };
TRANSLATIONS["coupon.discount"] = { en: "Discount", ar: "الخصم" };

// ============= Reviews =============
TRANSLATIONS["reviews.title"] = { en: "Customer reviews", ar: "آراء العملاء" };
TRANSLATIONS["reviews.empty"] = { en: "No reviews yet. Be the first to share your experience!", ar: "لا توجد مراجعات بعد. كن أول من يشارك تجربته!" };
TRANSLATIONS["reviews.write"] = { en: "Write a review", ar: "اكتب مراجعة" };
TRANSLATIONS["reviews.disclaimer"] = { en: "Reviews are visible after approval. Email is optional and never shown publicly.", ar: "تظهر المراجعات بعد الموافقة عليها. البريد الإلكتروني اختياري ولن يُعرض علنياً." };
TRANSLATIONS["reviews.name"] = { en: "Your name *", ar: "الاسم *" };
TRANSLATIONS["reviews.email"] = { en: "Email (optional)", ar: "البريد الإلكتروني (اختياري)" };
TRANSLATIONS["reviews.rating"] = { en: "Rating *", ar: "التقييم *" };
TRANSLATIONS["reviews.comment"] = { en: "Your review *", ar: "مراجعتك *" };
TRANSLATIONS["reviews.commentPh"] = { en: "What did you like? How did it work for you?", ar: "ما الذي أعجبك؟ كيف كانت تجربتك معه؟" };
TRANSLATIONS["reviews.submit"] = { en: "Submit review", ar: "إرسال المراجعة" };
TRANSLATIONS["reviews.error.name"] = { en: "Please enter your name", ar: "يرجى إدخال اسمك" };
TRANSLATIONS["reviews.error.rating"] = { en: "Please pick a rating", ar: "يرجى اختيار تقييم" };
TRANSLATIONS["reviews.error.comment"] = { en: "Please write a short review", ar: "يرجى كتابة مراجعة قصيرة" };
TRANSLATIONS["reviews.success"] = { en: "Thanks! Your review will appear once approved.", ar: "شكراً! ستظهر مراجعتك بعد الموافقة عليها." };
TRANSLATIONS["reviews.submitFail"] = { en: "Failed to submit", ar: "تعذر الإرسال" };
TRANSLATIONS["reviews.starsAria"] = { en: "stars", ar: "نجوم" };

// ============= Cart aria labels =============
TRANSLATIONS["cart.decrease"] = { en: "Decrease quantity", ar: "إنقاص الكمية" };
TRANSLATIONS["cart.increase"] = { en: "Increase quantity", ar: "زيادة الكمية" };
TRANSLATIONS["cart.remove"] = { en: "Remove item", ar: "إزالة المنتج" };

// ============= Brand "Why" badges =============
TRANSLATIONS["brand.why.title"] = { en: "Why {brand}", ar: "لماذا {brand}" };
TRANSLATIONS["brand.why.clinical"] = { en: "Clinically tested", ar: "مختبر سريرياً" };
TRANSLATIONS["brand.why.trusted"] = { en: "Trusted quality", ar: "جودة موثوقة" };
TRANSLATIONS["brand.why.skinFriendly"] = { en: "Skin-friendly", ar: "لطيف على البشرة" };
TRANSLATIONS["brand.why.awardWinning"] = { en: "Award-winning", ar: "حائز على جوائز" };

// ============= 404 page =============
TRANSLATIONS["notfound.title"] = { en: "Page not found", ar: "الصفحة غير موجودة" };
TRANSLATIONS["notfound.subtitle"] = { en: "The page you're looking for doesn't exist or has been moved.", ar: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها." };
TRANSLATIONS["notfound.cta"] = { en: "Return to Home", ar: "العودة إلى الرئيسية" };

// ============= Account extras =============
TRANSLATIONS["account.viewOrder"] = { en: "View", ar: "عرض" };
TRANSLATIONS["account.uploadOk"] = { en: "Photo updated", ar: "تم تحديث الصورة" };
TRANSLATIONS["account.uploadFail"] = { en: "Upload failed", ar: "فشل الرفع" };
TRANSLATIONS["account.profileSaved"] = { en: "Profile saved", ar: "تم حفظ الملف الشخصي" };
TRANSLATIONS["account.saveFail"] = { en: "Save failed", ar: "فشل الحفظ" };
TRANSLATIONS["account.passwordOk"] = { en: "Password updated", ar: "تم تحديث كلمة المرور" };
TRANSLATIONS["account.passwordFail"] = { en: "Failed to update password", ar: "تعذر تحديث كلمة المرور" };
TRANSLATIONS["account.passwordMin"] = { en: "Password must be at least 6 characters", ar: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل" };

// ============= Header / nav extras =============
TRANSLATIONS["header.toggleLang"] = { en: "Toggle language", ar: "تغيير اللغة" };
TRANSLATIONS["header.toggleTheme"] = { en: "Toggle theme", ar: "تغيير السمة" };
TRANSLATIONS["header.menu"] = { en: "Menu", ar: "القائمة" };
TRANSLATIONS["header.notifications"] = { en: "Notifications", ar: "الإشعارات" };
TRANSLATIONS["header.account"] = { en: "Account", ar: "الحساب" };
TRANSLATIONS["header.viewLink"] = { en: "View", ar: "عرض" };

// ============= WhatsApp =============
TRANSLATIONS["whatsapp.label"] = { en: "Chat on WhatsApp", ar: "تواصل عبر واتساب" };

// ============= Category page extras =============
TRANSLATIONS["category.productSingular"] = { en: "product", ar: "منتج" };
TRANSLATIONS["category.productPlural"] = { en: "products", ar: "منتجات" };

// ============= Product detail =============
TRANSLATIONS["product.viewArrow"] = { en: "View →", ar: "عرض ←" };

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
  if (!ctx) {
    // Fallback prevents a blank screen if a stale HMR module copy is loaded
    // before the provider re-mounts. Returns identity translations.
    return {
      lang: "en" as Lang,
      setLang: () => {},
      t: (key: string) => TRANSLATIONS[key]?.en ?? key,
      dir: "ltr" as const,
    };
  }
  return ctx;
}