import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PageHero } from "@/components/site/PageHero";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { publicPageMeta } from "@/lib/site-page-meta";
import { FAMILY_RESORTS } from "@/lib/site-offers";
import { SERVICE_IMAGES } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "FamilyPage" });
  return publicPageMeta(locale, "/famille", t("metaTitle"), t("metaDescription"));
}

export default async function FamilyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("FamilyPage");
  const tServices = await getTranslations("Services");

  return (
    <>
      <Header />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <PageHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-end gap-10 lg:grid-cols-12">
            <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10] lg:col-span-7 lg:aspect-[4/3]">
              <Image
                src={SERVICE_IMAGES.hotels}
                alt={t("imageAlt")}
                fill
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="lg:col-span-5">
              <h2 className="font-display text-[2rem] leading-[1.05]">{t("composeTitle")}</h2>
              <p className="mt-4 text-[15px] leading-[1.75] text-[#3C3833]">{t("composeText")}</p>
            </div>
          </div>
        </section>
        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl font-display text-[clamp(2rem,4vw,3.2rem)] leading-[1.05]">
              {t("inspirationTitle")}
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.7] text-muted">{t("inspirationText")}</p>
            <ul className="mt-12 grid gap-8 lg:grid-cols-3">
              {FAMILY_RESORTS.map((resort) => (
                <li key={resort.id} className="flex flex-col border-t border-[#C5A880] pt-5">
                  <h3 className="font-display text-[1.7rem] leading-none">{t(`resorts.${resort.id}.name`)}</h3>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">
                    {t(`resorts.${resort.id}.place`)}
                  </p>
                  <p className="mt-4 flex-1 text-sm leading-[1.7] text-[#3C3833]">
                    {t(`resorts.${resort.id}.fact`)}
                  </p>
                  <a
                    href={resort.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lux-line mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#5C4824]"
                  >
                    {t("source")}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-display text-[2rem] leading-none">{t("selectionTitle")}</h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.7] text-muted">{t("selectionText")}</p>
            <p className="mt-8 font-display text-4xl text-[#5C4824]">{t("blank")}</p>
          </div>
        </section>
        <QuoteBlock defaultService={tServices("bespoke.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
