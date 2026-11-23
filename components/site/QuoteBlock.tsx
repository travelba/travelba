import { useTranslations } from "next-intl";
import { ContactForm } from "@/components/ContactForm";

export function QuoteBlock({ defaultService }: { defaultService?: string }) {
  const t = useTranslations("QuoteBlock");

  return (
    <section id="devis" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <p className="lux-kicker">{t("eyebrow")}</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,3vw,2.8rem)] leading-[1.05] text-[#1A1714]">
            {t("title")}
          </h2>
          <p className="mt-5 text-[15px] leading-[1.7] text-muted">{t("text")}</p>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <ContactForm defaultService={defaultService} />
        </div>
      </div>
    </section>
  );
}
