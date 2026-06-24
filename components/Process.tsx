"use client";

import { useTranslations } from "next-intl";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

const STEPS = ["brief", "proposal", "organization", "experience"] as const;

export function Process() {
  const t = useTranslations("Process");

  return (
    <section
      id="process"
      className="relative overflow-hidden px-5 py-24 sm:px-8"
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent-3/10 blur-[120px]" />
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="relative mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal
              key={step}
              delay={i * 0.1}
              className="relative rounded-2xl border border-border bg-surface/40 p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-display text-sm font-bold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="hidden h-px flex-1 bg-gradient-to-r from-border to-transparent lg:block" />
                )}
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(`steps.${step}.description`)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
