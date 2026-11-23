import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { VoyageNav } from "@/components/voyages/VoyageNav";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { CONTINENTS, copy, destinationsIn } from "@/lib/voyages/content";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "DestinationsHub" });
  return publicPageMeta(locale, "/voyages/destinations", t("metaTitle"), t("metaDescription"));
}

export default async function DestinationsHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("DestinationsHub");

  return (
    <>
      <Header />
      <VoyageNav />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <header className="px-5 pb-12 pt-16 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker">{t("eyebrow")}</p>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.6rem,5vw,4.6rem)] leading-[0.98]">{t("title")}</h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{t("lede")}</p>
          </div>
        </header>
        {CONTINENTS.map((continent) => {
          const items = destinationsIn(continent.id);
          if (!items.length) return null;
          return (
            <section key={continent.id} id={continent.id} className="scroll-mt-36 border-t border-[#1A1714]/10 px-5 py-14 sm:px-8">
              <div className="mx-auto max-w-7xl">
                <h2 className="font-display text-[2.2rem] leading-none">{copy(locale, continent.name)}</h2>
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.slug}>
                      <Link href={`/voyages/destinations/${item.slug}`} className="group block">
                        <div className="relative aspect-[16/10] overflow-hidden">
                          <Image src={item.image} alt={copy(locale, item.imageAlt)} fill sizes="(min-width: 1024px) 30vw, 100vw" className="lux-photo object-cover" />
                        </div>
                        <h3 className="mt-4 font-display text-[1.7rem] leading-none group-hover:text-[#5C4824]">
                          {copy(locale, item.name)}
                        </h3>
                        <p className="mt-2 text-sm leading-[1.6] text-muted">{copy(locale, item.tagline)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
