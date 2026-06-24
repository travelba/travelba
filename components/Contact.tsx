import { useTranslations } from "next-intl";
import { Mail, Phone, Clock, MessageCircle, MapPin } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";
import { ContactForm } from "./ContactForm";
import { siteConfig } from "@/lib/site";

export function Contact() {
  const t = useTranslations("Contact");

  return (
    <section id="contact" className="relative px-5 py-24 sm:px-8">
      <div className="pointer-events-none absolute right-0 top-1/4 h-72 w-72 rounded-full bg-accent/15 blur-[120px]" />
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <div className="flex h-full flex-col justify-between gap-8 rounded-2xl border border-border bg-surface/40 p-7">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {t("infoTitle")}
                </h3>
                <ul className="mt-5 space-y-4 text-sm">
                  <li>
                    <a
                      href={`mailto:${siteConfig.contactEmail}`}
                      className="flex items-center gap-3 text-foreground/90 transition-colors hover:text-accent"
                    >
                      <Mail className="h-4 w-4 text-accent-2" />
                      {siteConfig.contactEmail}
                    </a>
                  </li>
                  <li className="flex items-center gap-3 text-foreground/90">
                    <Phone className="h-4 w-4 text-accent-2" />
                    {siteConfig.phoneDisplay}
                  </li>
                  <li>
                    <a
                      href={`https://wa.me/${siteConfig.whatsappNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-foreground/90 transition-colors hover:text-accent"
                    >
                      <MessageCircle className="h-4 w-4 text-accent-2" />
                      {siteConfig.whatsappDisplay}
                    </a>
                  </li>
                  <li className="flex items-start gap-3 text-foreground/90">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
                    <span>
                      {siteConfig.address.line1}, {siteConfig.address.postalCode}{" "}
                      {siteConfig.address.city}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-4 py-3 text-sm text-muted">
                <Clock className="h-4 w-4 shrink-0 text-accent-2" />
                {t("responseTime")}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-3">
            <div className="rounded-2xl border border-border bg-surface/40 p-7">
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
