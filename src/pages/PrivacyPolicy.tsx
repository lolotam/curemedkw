import { SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";

export default function PrivacyPolicy() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <SiteLayout>
      <section className="container py-12 md:py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {isAr ? "آخر تحديث: مايو 2026" : "Last updated: May 2026"}
        </p>

        <div className="prose prose-sm md:prose-base max-w-none space-y-6 text-foreground">
          {isAr ? (
            <>
              <section>
                <h2 className="text-xl font-semibold">المقدمة</h2>
                <p>
                  تحترم Curemed خصوصيتك. توضح هذه السياسة كيفية جمع واستخدام وحماية معلوماتك
                  عند استخدامك لموقعنا وخدماتنا في الكويت.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">المعلومات التي نجمعها</h2>
                <ul className="list-disc pr-6 space-y-1">
                  <li>الاسم الكامل ورقم الهاتف والبريد الإلكتروني</li>
                  <li>عنوان التوصيل (المحافظة، المنطقة، القطعة، الشارع، المبنى)</li>
                  <li>تفاصيل الطلبات والمدفوعات</li>
                  <li>بيانات تقنية مثل عنوان IP ونوع المتصفح وملفات تعريف الارتباط</li>
                </ul>
              </section>
              <section>
                <h2 className="text-xl font-semibold">كيفية استخدام معلوماتك</h2>
                <ul className="list-disc pr-6 space-y-1">
                  <li>معالجة الطلبات وتوصيلها</li>
                  <li>التواصل بشأن الطلبات أو الاستفسارات</li>
                  <li>تحسين خدماتنا وتجربة المستخدم</li>
                  <li>إرسال العروض الترويجية (يمكنك إلغاء الاشتراك في أي وقت)</li>
                </ul>
              </section>
              <section>
                <h2 className="text-xl font-semibold">مشاركة المعلومات</h2>
                <p>
                  لا نبيع بياناتك. قد نشاركها مع شركات التوصيل ومعالجي الدفع فقط بالقدر اللازم
                  لإتمام طلبك.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">حقوقك</h2>
                <p>
                  يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها بمراسلتنا على
                  info@curemed.com.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">التواصل معنا</h2>
                <p>
                  لأي استفسار حول الخصوصية: info@curemed.com — هاتف: +965 6000 3759.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-semibold">Introduction</h2>
                <p>
                  Curemed respects your privacy. This policy explains how we collect, use, and
                  protect your information when you use our website and services in Kuwait.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Information we collect</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Full name, phone number, and email address</li>
                  <li>Delivery address (governorate, area, block, street, building)</li>
                  <li>Order and payment details</li>
                  <li>Technical data such as IP address, browser type, and cookies</li>
                </ul>
              </section>
              <section>
                <h2 className="text-xl font-semibold">How we use your information</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Process and deliver your orders</li>
                  <li>Communicate about orders or inquiries</li>
                  <li>Improve our services and user experience</li>
                  <li>Send promotional offers (you can unsubscribe at any time)</li>
                </ul>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Sharing of information</h2>
                <p>
                  We do not sell your data. We may share it with delivery partners and payment
                  processors only to the extent necessary to fulfill your order.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Your rights</h2>
                <p>
                  You may request access to, correction of, or deletion of your personal data
                  by emailing us at info@curemed.com.
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold">Contact us</h2>
                <p>
                  For any privacy-related inquiry: info@curemed.com — phone: +965 6000 3759.
                </p>
              </section>
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
