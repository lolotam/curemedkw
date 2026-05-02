import { SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";

export default function TermsOfService() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <SiteLayout>
      <section className="container py-12 md:py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          {isAr ? "الشروط والأحكام" : "Terms of Service"}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {isAr ? "آخر تحديث: مايو 2026" : "Last updated: May 2026"}
        </p>

        <div className="space-y-6 text-foreground">
          {isAr ? (
            <>
              <section>
                <h2 className="text-xl font-semibold">قبول الشروط</h2>
                <p>
                  باستخدامك لموقع Curemed، فإنك توافق على هذه الشروط. إذا لم توافق، يرجى عدم
                  استخدام الموقع.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">المنتجات والأسعار</h2>
                <p>
                  جميع الأسعار بالدينار الكويتي (KWD) وقد تتغير دون إشعار. نبذل جهدنا لعرض
                  معلومات دقيقة عن المنتجات وتوفرها.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">الطلبات والدفع</h2>
                <p>
                  تخضع جميع الطلبات للقبول. تشمل خيارات الدفع الدفع عند الاستلام والدفع برابط
                  آمن.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">التوصيل</h2>
                <p>
                  نوصّل داخل دولة الكويت. قد تختلف أوقات التوصيل حسب المنطقة وتوفر المنتج.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">الإرجاع والاستبدال</h2>
                <p>
                  لطلب الإرجاع، تواصل معنا خلال 7 أيام من الاستلام. يجب أن يكون المنتج بحالته
                  الأصلية. لا تُرجع المنتجات المفتوحة لأسباب صحية.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">المسؤولية</h2>
                <p>
                  لا تتحمل Curemed المسؤولية عن أي أضرار غير مباشرة ناتجة عن استخدام الموقع أو
                  المنتجات بشكل مخالف للتعليمات.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">القانون الحاكم</h2>
                <p>
                  تخضع هذه الشروط لقوانين دولة الكويت ومحاكمها المختصة.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">التواصل</h2>
                <p>info@curemed.com — هاتف: +965 6000 3759.</p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-semibold">Acceptance of terms</h2>
                <p>
                  By using the Curemed website, you agree to these terms. If you do not agree,
                  please do not use the site.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Products and pricing</h2>
                <p>
                  All prices are in Kuwaiti Dinar (KWD) and may change without notice. We make
                  reasonable efforts to display accurate product information and availability.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Orders and payment</h2>
                <p>
                  All orders are subject to acceptance. Payment options include cash on
                  delivery and pay-by-link.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Delivery</h2>
                <p>
                  We deliver within the State of Kuwait. Delivery times may vary by area and
                  product availability.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Returns and exchanges</h2>
                <p>
                  To request a return, contact us within 7 days of delivery. The product must
                  be in its original condition. Opened products cannot be returned for
                  health-and-safety reasons.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Liability</h2>
                <p>
                  Curemed is not liable for any indirect damages arising from use of the site
                  or misuse of products contrary to instructions.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Governing law</h2>
                <p>
                  These terms are governed by the laws of the State of Kuwait and its competent
                  courts.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Contact</h2>
                <p>info@curemed.com — phone: +965 6000 3759.</p>
              </section>
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
