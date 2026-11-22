import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { HERO_POSTER } from "@/lib/site-hero";
import { HeroVideo } from "./HeroVideo";

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
      className="relative flex min-h-[calc(100svh-4.5rem)] items-end overflow-hidden"
    >
      <Image
        src={HERO_POSTER}
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover"
      />
      <HeroVideo />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/55 to-[#0B192C]/25" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B192C]/70 via-[#0B192C]/25 to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-28 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <p className="hero-rise text-[0.68rem] font-medium uppercase tracking-[0.32em] text-[#E8D7BC]">
          {t("badge")}
        </p>

        <h1
          className="hero-rise mt-6 max-w-4xl font-display text-[clamp(2.7rem,6.2vw,5.6rem)] font-medium leading-[0.96] text-[#F7F3EB] [text-shadow:0_2px_28px_rgba(11,25,44,0.45)]"
          style={{ animationDelay: "90ms" }}
        >
          {t("title")}{" "}
          <span className="italic text-[#E4D2B4]">{t("titleAccent")}</span>
        </h1>

        <p
          className="hero-rise mt-6 max-w-xl text-[15px] leading-[1.7] text-[#F7F3EB]/88 sm:text-base [text-shadow:0_1px_16px_rgba(11,25,44,0.55)]"
          style={{ animationDelay: "180ms" }}
        >
          {t("subtitle")}
        </p>

        <div
          className="hero-rise mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          style={{ animationDelay: "270ms" }}
        >
          <a href="#contact" className="lux-btn lux-btn-gold">
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="lux-btn lux-btn-ghost"
          >
            {t("ctaSecondary")}
          </a>
        </div>

        <dl
          className="hero-rise mt-14 grid max-w-xl grid-cols-3 gap-4 border-t border-[#F7F3EB]/30 pt-6 sm:gap-8"
          style={{ animationDelay: "360ms" }}
        >
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#F7F3EB]/75 sm:text-[11px]">
                {s.label}
              </dt>
              <dd className="mt-2 font-display text-[1.8rem] leading-none text-[#F7F3EB] sm:text-4xl">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
