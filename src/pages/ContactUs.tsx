import { SiteLayout } from "@/components/site/SiteLayout";
import { ContactSection } from "@/components/site/ContactSection";
import { Card } from "@/components/ui/card";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const MAP_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d217.37361994183146!2d48.01954202433483!3d29.341642883971396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3fcf9d5d6f4578d5%3A0x62965d2b9c4a932c!2sGrand%20Hyper%20Hawally%202!5e0!3m2!1sen!2skw!4v1777236711436!5m2!1sen!2skw";
const MAP_LINK = "https://maps.app.goo.gl/Jef93YXeUzmncKpr7";

export default function ContactUs() {
  const { t } = useI18n();

  return (
    <SiteLayout brand="curemed">
      <section className="container py-16 md:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold">{t("contact.title")}</h1>
          <p className="mt-4 text-muted-foreground">{t("contact.subtitle")}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={MapPin}
            title={t("contact.address.title")}
            body={t("contact.address.body")}
          />
          <InfoCard
            icon={Phone}
            title={t("contact.phone.title")}
            body="+965 6000 3759"
            href="tel:+96560003759"
          />
          <InfoCard
            icon={Mail}
            title={t("contact.email.title")}
            body="info@curemed.com"
            href="mailto:info@curemed.com"
          />
          <InfoCard
            icon={Clock}
            title={t("contact.hours.title")}
            body={`${t("contact.hours.weekdays")}\n${t("contact.hours.weekend")}`}
          />
        </div>
      </section>

      <ContactSection brand="curemed" />

      <section className="container pb-20">
        <div className="max-w-2xl mx-auto text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold">{t("contact.location.title")}</h2>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
          <iframe
            src={MAP_EMBED_SRC}
            title="Curemed location"
            className="w-full h-[450px] border-0"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="mt-4 text-center">
          <a
            href={MAP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-brand hover:underline inline-flex items-center gap-1.5"
          >
            <MapPin className="h-4 w-4" /> Open in Google Maps
          </a>
        </div>
      </section>
    </SiteLayout>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href?: string;
}) {
  const content = (
    <Card className="h-full p-6 flex flex-col items-center text-center gap-3 transition-all hover:-translate-y-1 hover:shadow-lg">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground whitespace-pre-line">{body}</p>
    </Card>
  );
  return href ? (
    <a href={href} className="block">
      {content}
    </a>
  ) : (
    content
  );
}