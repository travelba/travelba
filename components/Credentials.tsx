import { useTranslations } from "next-intl";

export function Credentials() {
  const t = useTranslations("Credentials");

  const badges = [
    { title: t("iataTitle"), desc: t("iataDesc") },
    { title: t("apstTitle"), desc: t("apstDesc") },
  ];

  return (
    <section id="accreditations" className="border-b border-[#1A1714]/10 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <span className="lux-kicker">{t("eyebrow")}</span>
          <p className="mt-5 max-w-sm text-[15px] leading-[1.7] text-muted">{t("reassurance")}</p>
        </div>
        <ul className="grid gap-8 sm:grid-cols-2 lg:col-span-8">
          {badges.map(({ title, desc }) => (
            <li key={title} className="border-t border-[#C5A880] pt-5">
              <h2 className="font-display text-[1.7rem] leading-none text-[#1A1714]">{title}</h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
