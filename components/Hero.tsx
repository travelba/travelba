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

      <div className="absolute inset-0 bg-background/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-transparent to-background" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/40 to-transparent" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-4xl text-center"
      >
        <motion.div variants={item} className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C5A880]/40 bg-[#0B192C]/55 px-4 py-1.5 text-xs font-medium tracking-wide text-[#E8D7BC]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C5A880]" />
            {t("badge")}
          </span>
        </motion.div>

        <motion.h1
          variants={item}
          className="mt-6 font-display text-3xl font-semibold leading-[1.1] tracking-tight [text-shadow:_0_2px_24px_rgba(0,0,0,0.55)] sm:text-5xl"
        >
          {t("title")}{" "}
          <span className="text-gradient">{t("titleAccent")}</span>
        </motion.h1>

        <motion.p
          variants={item}
          className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-foreground/80 [text-shadow:_0_1px_16px_rgba(0,0,0,0.6)] sm:text-base"
        >
          {t("subtitle")}
        </motion.p>

        <motion.div
          variants={item}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#contact"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C5A880] px-6 py-3.5 text-sm font-semibold text-[#0B192C] transition-colors hover:bg-[#d4bc9a] sm:w-auto"
          >
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#C5A880]/50 bg-[#0B192C]/40 px-6 py-3.5 text-sm font-semibold text-[#FAF9F6] transition-colors hover:bg-[#0B192C]/70 sm:w-auto"
          >
            <MessageCircle className="h-4 w-4" />
            {t("ctaSecondary")}
          </a>
        </motion.div>

        <motion.div
          variants={item}
          className="mx-auto mt-14 flex max-w-lg divide-x divide-[#C5A880]/35"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex-1 px-3 text-center [text-shadow:_0_1px_16px_rgba(0,0,0,0.6)]"
            >
              <div className="font-display text-xl font-medium text-[#C5A880] sm:text-2xl">
                {s.value}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#E8D7BC]/80 sm:text-xs">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
