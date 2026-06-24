"use client";

import { useTranslations } from "next-intl";
import { Zap, Globe2, Gem, ShieldCheck, type LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: "agile", icon: Zap },
  { key: "network", icon: Globe2 },
  { key: "tailored", icon: Gem },
  { key: "discretion", icon: ShieldCheck },
];

export function WhyUs() {
  const t = useTranslations("WhyUs");

  return (
    <section id="why" className="relative px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ key, icon: Icon }, i) => (
            <Reveal
              key={key}
              delay={i * 0.08}
              className="bg-surface/60 p-7 transition-colors hover:bg-surface"
            >
              <Icon className="h-7 w-7 text-accent" />
              <h3 className="mt-5 font-display text-lg font-semibold">
                {t(`items.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(`items.${key}.description`)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
