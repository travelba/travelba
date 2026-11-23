import { getTranslations, setRequestLocale } from "next-intl/server";
import NextLink from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PageHero } from "@/components/site/PageHero";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { publicPageMeta } from "@/lib/site-page-meta";

const FEATURES = ["hotels", "stay", "papers", "ledger"] as const;
const LEVELS = ["silver", "gold", "platinum", "titanium"] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AppPage" });
  return publicPageMeta(locale, "/application", t("metaTitle"), t("metaDescription"));
}

export default async function ApplicationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AppPage");
  const tServices = await getTranslations("Services");

  return (
    <>
      <Header />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <PageHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
            {FEATURES.map((key) => (
              <article key={key} className="border-t border-[#C5A880] pt-6">
                <h2 className="font-display text-[2rem] leading-none">{t(`features.${key}.title`)}</h2>
                <p className="mt-4 max-w-xl text-[15px] leading-[1.75] text-[#3C3833]">
                  {t(`features.${key}.text`)}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t border-[#1A1714]/10 bg-[#0B192C] px-5 py-16 text-[#F7F3EB] sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker lux-kicker-inverse">{t("clubEyebrow")}</p>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4vw,3.2rem)] leading-[1.05]">
              {t("clubTitle")}
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.75] text-[#F7F3EB]/80">{t("clubPromise")}</p>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {LEVELS.map((level) => (
                <li key={level} className="border-t border-[#F7F3EB]/25 pt-5">
                  <h3 className="font-display text-[1.7rem] leading-none">{t(`levels.${level}.name`)}</h3>
                  <p className="mt-3 text-sm text-[#E8D7BC]">{t(`levels.${level}.price`)}</p>
                  <p className="mt-3 text-sm leading-[1.7] text-[#F7F3EB]/78">{t(`levels.${level}.line`)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-2xl text-sm leading-[1.7] text-[#F7F3EB]/70">{t("clubNote")}</p>
          </div>
        </section>
        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="font-display text-[2.2rem] leading-[1.05]">{t("accessTitle")}</h2>
              <p className="mt-4 text-[15px] leading-[1.75] text-[#3C3833]">{t("accessText")}</p>
              <p className="mt-4 text-sm leading-[1.7] text-muted">{t("stores")}</p>
              <NextLink href="/connexion" className="lux-btn mt-8">
                {t("open")}
              </NextLink>
            </div>
            <ol className="space-y-4 lg:col-span-6 lg:col-start-7">
              {(["home", "hotels", "stays", "money", "account"] as const).map((item) => (
                <li key={item} className="border-b border-[#1A1714]/10 py-3 font-display text-2xl">
                  {t(`screens.${item}`)}
                </li>
              ))}
            </ol>
          </div>
        </section>
        <QuoteBlock defaultService={tServices("hotels.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
