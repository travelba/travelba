import Image from "next/image";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { SERVICE_KEYS, SERVICE_IMAGES } from "@/lib/site";

function indexLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function Services() {
  const t = useTranslations("Services");
  const [lead, ...rest] = SERVICE_KEYS;

  return (
    <section id="services" className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

        <article className="group mt-14 grid items-end gap-8 lg:mt-20 lg:grid-cols-12 lg:gap-14">
          <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10] lg:col-span-7 lg:aspect-[4/5]">
            <Image
              src={SERVICE_IMAGES[lead]}
              alt={t(`${lead}.title`)}
              fill
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="lux-photo object-cover"
            />
          </div>
          <div className="lg:col-span-5 lg:pb-4">
            <p className="font-display text-4xl leading-none text-[#5C4824]">{indexLabel(0)}</p>
            <h3 className="mt-4 font-display text-[clamp(2rem,3vw,3.25rem)] leading-[1.02] text-[#1A1714]">
              {t(`${lead}.title`)}
            </h3>
            <p className="mt-5 max-w-md text-[15px] leading-[1.75] text-muted">
              {t(`${lead}.description`)}
            </p>
          </div>
        </article>

        <div className="mt-16 grid gap-x-7 gap-y-14 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16">
          {rest.map((key, i) => (
            <article key={key} className="group">
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={SERVICE_IMAGES[key]}
                  alt={t(`${key}.title`)}
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                  className="lux-photo object-cover"
                />
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-4">
                <h3 className="font-display text-[1.7rem] leading-none text-[#1A1714]">
                  {t(`${key}.title`)}
                </h3>
                <span className="font-display text-xl leading-none text-[#5C4824]">
                  {indexLabel(i + 1)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-[1.7] text-muted">{t(`${key}.description`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
