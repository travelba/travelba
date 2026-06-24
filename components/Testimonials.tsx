"use client";

import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "./Reveal";

const ITEMS = ["one", "two", "three"] as const;

export function Testimonials() {
  const t = useTranslations("Testimonials");

  return (
    <section id="testimonials" className="relative px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {ITEMS.map((key, i) => (
            <Reveal
              key={key}
              delay={i * 0.1}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface/40 p-7"
            >
              <Quote className="h-8 w-8 text-accent/50" />
              <p className="mt-4 flex-1 text-base leading-relaxed text-foreground/90">
                &ldquo;{t(`items.${key}.quote`)}&rdquo;
              </p>
              <div className="mt-6 border-t border-border pt-4">
                <div className="text-sm font-semibold">
                  {t(`items.${key}.author`)}
                </div>
                <div className="text-sm text-muted">
                  {t(`items.${key}.role`)}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
