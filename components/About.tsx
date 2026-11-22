import { useTranslations } from "next-intl";

export function About() {
  const t = useTranslations("About");

  const facts = [
    { label: t("fact1Label"), value: t("fact1Value") },
    { label: t("fact2Label"), value: t("fact2Value") },
    { label: t("fact3Label"), value: t("fact3Value") },
  ];

  return (
    <section id="about" className="px-5 py-24 sm:px-8 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <span className="lux-kicker">{t("eyebrow")}</span>
            <h2 className="mt-5 font-display text-[clamp(2.15rem,4vw,3.5rem)] leading-[1.05] text-[#1A1714]">
              {t("title")}
            </h2>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-14">
            <p className="text-[16px] leading-[1.8] text-[#3C3833]">{t("p1")}</p>
            <p className="mt-5 text-[16px] leading-[1.8] text-[#3C3833]">{t("p2")}</p>
          </div>
        </div>

        <div className="mt-16 border-t border-[#1A1714]/12 pt-8 lg:mt-24">
          <h3 className="lux-kicker">{t("factsTitle")}</h3>
          <dl className="mt-8 grid gap-8 sm:grid-cols-3">
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#5C4824]">
                  {label}
                </dt>
                <dd className="mt-3 font-display text-[1.65rem] leading-tight text-[#1A1714]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
