import Image from "next/image";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { SERVICE_KEYS, SERVICE_IMAGES } from "@/lib/site";

export function Services() {
  const t = useTranslations("Services");

  return (
    <section id="services" className="relative px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const isLast = i === SERVICE_KEYS.length - 1;
            return (
              <article
                key={key}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/40 transition-colors hover:-translate-y-1 hover:border-accent/40 hover:bg-surface ${
                  isLast ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={SERVICE_IMAGES[key]}
                    alt={t(`${key}.title`)}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                  <h3 className="absolute bottom-3 left-4 right-4 font-display text-lg font-semibold drop-shadow-sm">
                    {t(`${key}.title`)}
                  </h3>
                </div>
                <p className="p-5 pt-4 text-sm leading-relaxed text-muted">
                  {t(`${key}.description`)}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
