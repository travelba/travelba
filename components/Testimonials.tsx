import { useLocale, useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const ITEMS = ["one", "two", "three"] as const;

export function Testimonials() {
  const t = useTranslations("Testimonials");
  const locale = useLocale();
  const openQuote = locale === "fr" ? "«\u00a0" : "\u201C";
  const closeQuote = locale === "fr" ? "\u00a0»" : "\u201D";

  return (
    <section id="testimonials" className="bg-[#EBE4D6] px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:mt-20 lg:grid-cols-3 lg:gap-12">
          {ITEMS.map((key) => (
            <figure key={key} className="flex h-full flex-col border-t border-[#1A1714]/15 pt-7">
              <blockquote className="flex-1 font-display text-[1.55rem] italic leading-[1.3] text-[#1A1714] sm:text-[1.7rem]">
                {openQuote}
                {t(`items.${key}.quote`)}
                {closeQuote}
              </blockquote>
              <figcaption className="mt-8 text-[11px] font-medium uppercase tracking-[0.2em] text-[#5C4824]">
                {t(`items.${key}.author`)}
                <span className="mx-2 text-[#1A1714]/35" aria-hidden>
                  /
                </span>
                <span className="text-[#4E4942]">{t(`items.${key}.role`)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
