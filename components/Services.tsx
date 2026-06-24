"use client";

import Image from "next/image";
import { motion } from "framer-motion";
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
              <motion.article
                key={key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{
                  duration: 0.5,
                  delay: (i % 3) * 0.08,
                  ease: [0.21, 0.47, 0.32, 0.98],
                }}
                whileHover={{ y: -4 }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/40 transition-colors hover:border-accent/40 hover:bg-surface ${
                  isLast ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={SERVICE_IMAGES[key]}
                    alt={t(`${key}.title`)}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                  <h3 className="absolute bottom-3 left-4 right-4 font-display text-lg font-semibold drop-shadow-sm">
                    {t(`${key}.title`)}
                  </h3>
                </div>
                <p className="p-5 pt-4 text-sm leading-relaxed text-muted">
                  {t(`${key}.description`)}
                </p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
