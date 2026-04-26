-- ============================================================
-- 0. Categories: parent + visible pages
-- ============================================================
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visible_pages text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: all existing categories visible on the Curemed main page
UPDATE public.categories SET visible_pages = ARRAY['curemed']::text[]
WHERE visible_pages = '{}'::text[];

-- ============================================================
-- 1. Products: original price + source url
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price numeric,
  ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '';

-- ============================================================
-- 2. Tags master table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "Admins can insert tags" ON public.tags FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tags" ON public.tags FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tags" ON public.tags FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 3. Testimonials table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  role_en text NOT NULL DEFAULT '',
  role_ar text NOT NULL DEFAULT '',
  quote_en text NOT NULL DEFAULT '',
  quote_ar text NOT NULL DEFAULT '',
  gender text NOT NULL DEFAULT 'm',
  location text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active testimonials" ON public.testimonials FOR SELECT USING (true);
CREATE POLICY "Admins can insert testimonials" ON public.testimonials FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update testimonials" ON public.testimonials FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete testimonials" ON public.testimonials FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 30 Kuwaiti testimonials (only if table is empty)
INSERT INTO public.testimonials (name_en, name_ar, role_en, role_ar, quote_en, quote_ar, gender, location, sort_order)
SELECT * FROM (VALUES
  ('Abdullah Al-Sabah','عبدالله الصباح','Customer','عميل','Honestly the product is excellent, used it for a week and felt the difference straight away.','والله المنتج عجيب، استخدمته أسبوع وحسيت بالفرق صراحة.','m','Salmiya',1),
  ('Noura Al-Ali','نورة العلي','Mom','أم','I tried it for the kids and it really worked, may God reward you.','جربته للعيال وطلع زين والله، الله يعطيكم العافية.','f','Hawally',2),
  ('Yousef Al-Otaibi','يوسف العتيبي','Pharmacy owner','صاحب صيدلية','Curemed brands are trusted, the customers are very happy.','علامات كيورميد مضمونة، الزباين مرتاحين عليها وايد.','m','Jahra',3),
  ('Sara Al-Mutairi','سارة المطيري','Customer','عميلة','Honestly, the service is fast and the prices are reasonable.','صراحة الخدمة سريعة والأسعار معقولة ما تشكي.','f','Farwaniya',4),
  ('Bader Al-Rashidi','بدر الرشيدي','Father','أب','I tried Flexitol for the cracks in my heels, the result is amazing wallah.','جربت فلكستول لتشققات الكعب، النتيجة قوية والله.','m','Ahmadi',5),
  ('Maryam Al-Sayegh','مريم الصايغ','Customer','عميلة','I love the new products, they reach you fast.','أحب المنتجات الجديدة عندهم، وتوصل بسرعة.','f','Mubarak Al-Kabeer',6),
  ('Faisal Al-Enezi','فيصل العنزي','Customer','عميل','My wife and I use the brand and we are very satisfied.','أنا والزوجة نستخدم العلامة ومرتاحين عليها وايد.','m','Capital',7),
  ('Latifa Al-Khalifa','لطيفة الخليفة','Pharmacist','صيدلانية','I recommend it to all my customers, the quality is real.','أنصح فيه كل زباينّي، الجودة مالها كلام.','f','Salmiya',8),
  ('Mohammad Al-Ajmi','محمد العجمي','Customer','عميل','I ordered, it arrived the next day, mashallah on the speed.','طلبت ووصل في ثاني يوم، ما شاء الله على السرعة.','m','Hawally',9),
  ('Dalal Al-Saleh','دلال الصالح','Customer','عميلة','The skincare products are wonderful, I noticed a clear difference.','منتجات العناية بالبشرة وايد روعة، حسيت بفرق واضح.','f','Jahra',10),
  ('Khalid Al-Dosari','خالد الدوسري','Customer','عميل','First time I order online, the experience was great honestly.','أول مرة أطلب أونلاين، التجربة كانت زينة صراحة.','m','Farwaniya',11),
  ('Shaikha Al-Hashemi','شيخة الهاشمي','Customer','عميلة','The brand quality is high, I always order from them.','جودة العلامة عالية، دايما أطلب منهم.','f','Ahmadi',12),
  ('Ahmad Al-Subaie','أحمد السبيعي','Customer','عميل','The team responds fast on WhatsApp, may God bless you.','الفريق يرد بسرعة على الواتساب، الله يبارك فيكم.','m','Mubarak Al-Kabeer',13),
  ('Hessa Al-Failakawi','حصة الفيلكاوي','Mom','أم','I tried it for my daughter, it really helped her, thank God.','جربته لبنتي وفادها وايد الحمدلله.','f','Capital',14),
  ('Saud Al-Mansour','سعود المنصور','Customer','عميل','The Kapiva supplements are great, I felt a difference in energy.','مكملات كابيفا حلوة، حسيت بفرق في الطاقة.','m','Salmiya',15),
  ('Fatima Al-Kandari','فاطمة الكندري','Customer','عميلة','Honest products and trusted prices, may God keep them.','منتجات صادقة وأسعار مضمونة، الله يخليهم.','f','Hawally',16),
  ('Nasser Al-Hajri','ناصر الهاجري','Customer','عميل','The Australian Bodycare line is wonderful for sensitive skin wallah.','منتجات أستراليان بودي كير وايد روعة للبشرة الحساسة والله.','m','Jahra',17),
  ('Reem Al-Bader','ريم البدر','Customer','عميلة','Delivery was on time, the box arrived neat and clean.','التوصيل في الوقت، والكرتون وصل مرتب ونظيف.','f','Farwaniya',18),
  ('Hamad Al-Ghanim','حمد الغانم','Customer','عميل','I recommend the brand to my friends, no problems at all.','أنصح أصحابي بالعلامة، ما تطنش أبد.','m','Ahmadi',19),
  ('Aisha Al-Sane','عائشة الصانع','Customer','عميلة','The customer service is respectful and quick to respond.','خدمة العملاء محترمة وسريعة في الرد.','f','Mubarak Al-Kabeer',20),
  ('Salem Al-Azmi','سالم العازمي','Customer','عميل','I have been ordering for two years and never disappointed.','صار لي سنتين أطلب منهم وما خذلوني أبد.','m','Capital',21),
  ('Bibi Al-Roumi','بيبي الرومي','Customer','عميلة','The cosmetics are original 100%, no fakes at all.','مستحضرات التجميل أصلية ١٠٠٪، ما فيه تقليد أبدا.','f','Salmiya',22),
  ('Talal Al-Shammari','طلال الشمري','Customer','عميل','My favorite store for healthcare products honestly.','محلي المفضل للمنتجات الصحية صراحة.','m','Hawally',23),
  ('Mona Al-Hamdan','منى الحمدان','Customer','عميلة','I love the variety, you find everything you need in one place.','أحب التنوع، تلقى كل شي تحتاجه في مكان واحد.','f','Jahra',24),
  ('Meshal Al-Qattan','مشعل القطان','Customer','عميل','Online ordering is easy and fast, mashallah.','الطلب أونلاين سهل وسريع، ما شاء الله.','m','Farwaniya',25),
  ('Ghadeer Al-Yousef','غدير اليوسف','Customer','عميلة','My skin became much better with their products wallah.','بشرتي صارت أحسن وايد مع منتجاتهم والله.','f','Ahmadi',26),
  ('Fahad Al-Zayed','فهد الزياد','Customer','عميل','The packaging is professional and the products are sealed perfectly.','التغليف احترافي والمنتجات مقفلة عدل.','m','Mubarak Al-Kabeer',27),
  ('Munira Al-Khaldi','منيرة الخالدي','Customer','عميلة','The promotions are great, I always benefit from them.','العروض حلوة دايما أستفيد منها.','f','Capital',28),
  ('Jassem Al-Failakawi','جاسم الفيلكاوي','Customer','عميل','A trusted brand with high quality, I am 100% satisfied.','علامة موثوقة وجودة عالية، أنا راضي ١٠٠٪.','m','Salmiya',29),
  ('Rania Al-Mutawa','رانيا المطوع','Customer','عميلة','I recommend Curemed to every Kuwaiti family for sure.','أنصح كل عائلة كويتية بكيورميد بكل تأكيد.','f','Hawally',30)
) AS v(name_en, name_ar, role_en, role_ar, quote_en, quote_ar, gender, location, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials);

-- ============================================================
-- 4. Realtime for messages so admin Messages updates live
-- ============================================================
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;