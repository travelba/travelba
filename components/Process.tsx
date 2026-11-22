import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";

const STEPS = ["brief", "proposal", "organization", "experience"] as const;

export function Process() {
  const t = useTranslations("Process");

  return (
    <section id="process" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        <ol className="relative mt-14 grid grid-cols-1 lg:mt-20 lg:grid-cols-4 lg:gap-10">
          <span
            className="pointer-events-none absolute left-0 right-0 top-0 hidden h-px bg-[#1A1714]/15 lg:block"
            aria-hidden
          />
          {STEPS.map((step, i) => (
            <li key={step} className="border-t border-[#1A1714]/15 py-8 lg:border-t-0 lg:pt-10">
              <span className="font-display text-[3.25rem] leading-none text-[#5C4824]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-display text-[1.85rem] leading-none text-[#1A1714]">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="mt-3 text-sm leading-[1.7] text-muted">{t(`steps.${step}.description`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
