import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { VoyageNav } from "@/components/voyages/VoyageNav";
import { JsonLd } from "@/components/voyages/JsonLd";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { siteConfig } from "@/lib/site";
import { CONTINENTS, DESTINATIONS, THEMES, copy } from "@/lib/voyages/content";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SurMesure" });
  return publicPageMeta(locale, "/voyages", t("metaTitle"), t("metaDescription"));
}

export default async function SurMesurePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("SurMesure");
  const tProcess = await getTranslations("Process");
  const tServices = await getTranslations("Services");
  const featured = DESTINATIONS.filter((item) => item.featured);
  const steps = ["brief", "proposal", "organization", "experience"] as const;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: t("metaTitle"),
          description: t("metaDescription"),
          url: `${siteConfig.url}/${locale}/voyages`,
          isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
        }}
      />
      <Header />
      <VoyageNav />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <header className="px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker">{t("eyebrow")}</p>
            <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.7rem,6vw,5.2rem)] leading-[0.96] text-[#1A1714]">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{t("lede")}</p>
          </div>
        </header>

        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12">
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] lg:col-span-4">{t("howTitle")}</h2>
            <ol className="grid gap-8 sm:grid-cols-2 lg:col-span-8">
              {steps.map((step, index) => (
                <li key={step} className="border-t border-[#C5A880] pt-4">
                  <p className="font-display text-3xl text-[#5C4824]">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 font-display text-[1.6rem] leading-none">{tProcess(`steps.${step}.title`)}</h3>
                  <p className="mt-3 text-sm leading-[1.7] text-muted">{tProcess(`steps.${step}.description`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-[#1A1714]/10 bg-[#0B192C] px-5 py-16 text-[#F7F3EB] sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker lux-kicker-inverse">{t("whyEyebrow")}</p>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4vw,3.2rem)] leading-[1.05]">{t("whyTitle")}</h2>
            <ul className="mt-10 grid gap-8 sm:grid-cols-3">
              {(["one", "two", "three"] as const).map((key) => (
                <li key={key} className="border-t border-[#F7F3EB]/25 pt-5">
                  <h3 className="font-display text-[1.6rem] leading-none">{t(`why.${key}.title`)}</h3>
                  <p className="mt-3 text-sm leading-[1.7] text-[#F7F3EB]/78">{t(`why.${key}.text`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-end justify-between gap-6">
              <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[1.05]">{t("featuredTitle")}</h2>
              <Link href="/voyages/destinations" className="lux-line shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
                {t("allDestinations")}
              </Link>
            </div>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((item) => (
                <li key={item.slug}>
                  <Link href={`/voyages/destinations/${item.slug}`} className="group block">
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <Image src={item.image} alt={copy(locale, item.imageAlt)} fill sizes="(min-width: 1024px) 30vw, 100vw" className="lux-photo object-cover" />
                    </div>
                    <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">
                      {copy(locale, CONTINENTS.find((c) => c.id === item.continent)!.name)}
                    </p>
                    <h3 className="mt-2 font-display text-[1.8rem] leading-none group-hover:text-[#5C4824]">
                      {copy(locale, item.name)}
                    </h3>
                    <p className="mt-2 text-sm leading-[1.6] text-muted">{copy(locale, item.tagline)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05]">{t("themesTitle")}</h2>
            <ul className="mt-10 grid gap-px border border-[#1A1714]/10 bg-[#1A1714]/10 sm:grid-cols-2 lg:grid-cols-3">
              {THEMES.map((theme) => (
                <li key={theme.id} className="bg-[#F4EFE6]">
                  <Link href={`/voyages/envies/${theme.id}`} className="block px-6 py-8 hover:bg-[#FBF8F3]">
                    <h3 className="font-display text-[1.8rem] leading-none">{copy(locale, theme.name)}</h3>
                    <p className="mt-3 text-sm leading-[1.7] text-muted">{copy(locale, theme.lede)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-[#1A1714]/10 px-5 py-14 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-[2rem] leading-none">{t("signatureTitle")}</h2>
              <p className="mt-3 max-w-xl text-sm leading-[1.7] text-muted">{t("signatureText")}</p>
            </div>
            <Link href="/voyages/signature" className="lux-line text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
              {t("signatureLink")}
            </Link>
          </div>
        </section>

        <QuoteBlock defaultService={tServices("bespoke.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
