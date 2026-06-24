"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  PlaneTakeoff,
  Presentation,
  PartyPopper,
  Hotel,
  Car,
  BadgeCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { SERVICE_KEYS, type ServiceKey } from "@/lib/site";

const ICONS: Record<ServiceKey, LucideIcon> = {
  jet: PlaneTakeoff,
  seminars: Presentation,
  events: PartyPopper,
  hotels: Hotel,
  chauffeur: Car,
  vip: BadgeCheck,
  bespoke: Sparkles,
};

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

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = ICONS[key];
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
                className={`group relative overflow-hidden rounded-2xl border border-border bg-surface/40 p-6 transition-colors hover:border-accent/40 hover:bg-surface ${
                  isLast ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-gradient-to-br from-surface-2 to-surface text-accent-2 transition-colors group-hover:text-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">
                  {t(`${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
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
