import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { ContactForm } from "./ContactForm";
import { siteConfig } from "@/lib/site";

export function Contact() {
  const t = useTranslations("Contact");

  return (
    <section id="contact" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        <div className="mt-14 grid grid-cols-1 gap-14 lg:mt-20 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-4">
            <h3 className="font-display text-[2rem] leading-none text-[#1A1714]">{t("infoTitle")}</h3>
            <ul className="mt-8 space-y-5 text-sm text-[#1A1714]">
              <li>
                <a href={`mailto:${siteConfig.contactEmail}`} className="lux-line">
                  {siteConfig.contactEmail}
                </a>
              </li>
              <li>
                <a href={`tel:+${siteConfig.whatsappNumber}`} className="lux-line">
                  {siteConfig.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lux-line"
                >
                  {siteConfig.whatsappDisplay}
                </a>
              </li>
              <li className="leading-relaxed text-[#3C3833]">
                {siteConfig.address.line1}
                <br />
                {siteConfig.address.postalCode} {siteConfig.address.city}
              </li>
            </ul>
            <p className="mt-8 border-t border-[#1A1714]/12 pt-5 text-sm leading-relaxed text-muted">
              {t("responseTime")}
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
