"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, MessageCircle } from "lucide-react";
import { siteConfig } from "@/lib/site";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] as const },
  },
};

export function Hero() {
  const t = useTranslations("Hero");

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
  ];

  return (
    <section
      id="top"
      className="relative flex min-h-[92vh] items-center overflow-hidden px-5 pb-20 pt-28 sm:px-8"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="/videos/hero-jet.jpg"
        aria-hidden="true"
      >
        <source src="/videos/hero-jet.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-background/72" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/35 to-background" />
      <div className="bg-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-accent-2/15 blur-[120px]" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-4xl text-center"
      >
        <motion.div variants={item} className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-2" />
            {t("badge")}
          </span>
        </motion.div>

        <motion.h1
          variants={item}
          className="mt-7 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
        >
          {t("title")}{" "}
          <span className="text-gradient">{t("titleAccent")}</span>
        </motion.h1>

        <motion.p
          variants={item}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
        >
          {t("subtitle")}
        </motion.p>

        <motion.div
          variants={item}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#contact"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-[1.03] sm:w-auto"
          >
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface/40 px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface sm:w-auto"
          >
            <MessageCircle className="h-4 w-4" />
            {t("ctaSecondary")}
          </a>
        </motion.div>

        <motion.div
          variants={item}
          className="mx-auto mt-14 grid max-w-lg grid-cols-3 gap-4"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-2xl font-bold sm:text-3xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted sm:text-sm">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
