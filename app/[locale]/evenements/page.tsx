import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PageHero } from "@/components/site/PageHero";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { publicPageMeta } from "@/lib/site-page-meta";
import { SERVICE_IMAGES } from "@/lib/site";

const CHAPTERS = [
  { key: "seminars", image: SERVICE_IMAGES.seminars },
  { key: "private", image: SERVICE_IMAGES.events },
  { key: "birthdays", image: SERVICE_IMAGES.restaurants },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "EventsPage" });
  return publicPageMeta(locale, "/evenements", t("metaTitle"), t("metaDescription"));
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("EventsPage");
  const tServices = await getTranslations("Services");

  return (
    <>
      <Header />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <PageHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          {CHAPTERS.map((chapter, index) => (
            <article
              key={chapter.key}
              className="grid items-center gap-8 border-b border-[#1A1714]/10 py-14 lg:grid-cols-12 lg:gap-14 lg:py-20"
            >
              <div className={`relative aspect-[4/5] overflow-hidden sm:aspect-[16/10] lg:col-span-6 lg:aspect-[4/5] ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                <Image
                  src={chapter.image}
                  alt={t(`chapters.${chapter.key}.title`)}
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="lux-photo object-cover"
                />
              </div>
              <div className="lg:col-span-6">
                <p className="font-display text-4xl text-[#5C4824]">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-4 font-display text-[clamp(2rem,3vw,3rem)] leading-[1.02]">
                  {t(`chapters.${chapter.key}.title`)}
                </h2>
                <p className="mt-5 text-[15px] leading-[1.75] text-[#3C3833]">
                  {t(`chapters.${chapter.key}.text`)}
                </p>
                <p className="mt-4 text-sm leading-[1.7] text-muted">{t(`chapters.${chapter.key}.blank`)}</p>
              </div>
            </article>
          ))}
        </div>
        <QuoteBlock defaultService={tServices("events.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
