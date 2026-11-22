import { useTranslations } from "next-intl";
import { Zap, Globe2, Gem, ShieldCheck, type LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: "agile", icon: Zap },
  { key: "network", icon: Globe2 },
  { key: "tailored", icon: Gem },
  { key: "discretion", icon: ShieldCheck },
];

export function WhyUs() {
  const t = useTranslations("WhyUs");

  return (
    <section id="why" className="border-t border-[#C5A880] bg-[#0B192C] px-5 py-24 text-[#F7F3EB] sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          tone="inverse"
        />

        <ul className="mt-16 grid gap-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4 lg:gap-10">
          {ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} className="border-t border-[#F7F3EB]/20 pt-6">
              <Icon className="h-5 w-5 text-[#C5A880]" strokeWidth={1.25} aria-hidden />
              <h3 className="mt-6 font-display text-[1.75rem] leading-none text-[#F7F3EB]">
                {t(`items.${key}.title`)}
              </h3>
              <p className="mt-4 text-sm leading-[1.7] text-[#F7F3EB]/78">
                {t(`items.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
