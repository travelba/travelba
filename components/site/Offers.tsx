import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const OFFERS = [
  { key: "voyages", href: "/voyages" },
  { key: "app", href: "/application" },
  { key: "events", href: "/evenements" },
  { key: "family", href: "/famille" },
] as const;

export function Offers() {
  const t = useTranslations("Offers");

  return (
    <section id="offres" className="border-b border-[#1A1714]/10 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <p className="lux-kicker">{t("eyebrow")}</p>
        <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.15rem,4vw,3.5rem)] leading-[1.05] text-[#1A1714]">
          {t("title")}
        </h2>
        <ol className="mt-14 border-t border-[#1A1714]/15">
          {OFFERS.map((offer, index) => (
            <li key={offer.key} className="border-b border-[#1A1714]/15">
              <Link
                href={offer.href}
                className="group grid gap-4 py-8 sm:grid-cols-[4rem_1fr] sm:items-baseline sm:gap-8 lg:grid-cols-[4rem_minmax(0,16rem)_1fr_auto] lg:py-10"
              >
                <span className="font-display text-3xl leading-none text-[#5C4824]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-[2rem] leading-none text-[#1A1714] group-hover:text-[#5C4824]">
                  {t(`${offer.key}.title`)}
                </h3>
                <p className="max-w-xl text-sm leading-[1.7] text-muted">{t(`${offer.key}.text`)}</p>
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#5C4824]">
                  {t("open")}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
