import Image from "next/image";
import { notFound } from "next/navigation";
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
import {
  CONTINENTS,
  DESTINATIONS,
  THEMES,
  copy,
  destinationBySlug,
  destinationsIn,
} from "@/lib/voyages/content";

export function generateStaticParams() {
  return DESTINATIONS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const destination = destinationBySlug(slug);
  const t = await getTranslations({ locale, namespace: "DestinationPage" });
  const name = destination ? copy(locale, destination.name) : slug;
  return publicPageMeta(locale, `/voyages/destinations/${slug}`, t("metaTitle", { name }), t("metaDescription", { name }));
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const destination = destinationBySlug(slug);
  if (!destination) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("DestinationPage");
  const name = copy(locale, destination.name);
  const continent = CONTINENTS.find((item) => item.id === destination.continent)!;
  const related = destinationsIn(destination.continent).filter((item) => item.slug !== destination.slug);
  const url = `${siteConfig.url}/${locale}/voyages/destinations/${destination.slug}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TouristDestination",
          name,
          description: copy(locale, destination.intro),
          url,
          image: destination.image,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Travel Business Agency", item: `${siteConfig.url}/${locale}` },
            { "@type": "ListItem", position: 2, name: t("crumbVoyages"), item: `${siteConfig.url}/${locale}/voyages` },
            { "@type": "ListItem", position: 3, name: t("crumbDestinations"), item: `${siteConfig.url}/${locale}/voyages/destinations` },
            { "@type": "ListItem", position: 4, name, item: url },
          ],
        }}
      />
      <Header />
      <VoyageNav />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <section className="relative flex min-h-[70vh] items-end overflow-hidden">
          <Image src={destination.image} alt={copy(locale, destination.imageAlt)} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/45 to-[#0B192C]/20" />
          <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-14 pt-24 sm:px-8">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.28em] text-[#E8D7BC]">
              {copy(locale, continent.name)}
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(3rem,7vw,5.5rem)] leading-[0.95] text-[#F7F3EB]">
              {name}
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.7] text-[#F7F3EB]/88">{copy(locale, destination.tagline)}</p>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12">
            <p className="text-[17px] leading-[1.8] text-[#1A1714] lg:col-span-7">{copy(locale, destination.intro)}</p>
            <aside className="border-t border-[#C5A880] pt-5 lg:col-span-4 lg:col-start-9">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">{t("when")}</h2>
              <p className="mt-3 text-sm leading-[1.7] text-[#3C3833]">{copy(locale, destination.when)}</p>
            </aside>
          </div>
        </section>

        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-[2rem] leading-none">{t("highlights")}</h2>
              <ul className="mt-6 space-y-4">
                {destination.highlights.map((item) => (
                  <li key={item.fr} className="border-t border-[#1A1714]/10 pt-4 text-[15px] leading-[1.7]">
                    {copy(locale, item)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-display text-[2rem] leading-none">{t("stays")}</h2>
              <ul className="mt-6 space-y-4">
                {destination.stays.map((item) => (
                  <li key={item.fr} className="border-t border-[#1A1714]/10 pt-4 text-[15px] leading-[1.7]">
                    {copy(locale, item)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-[#1A1714]/10 bg-[#EBE4D6] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker">{t("ideaEyebrow")}</p>
            <h2 className="mt-4 max-w-3xl font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05]">
              {copy(locale, destination.idea.title)}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-[1.7] text-[#3C3833]">{copy(locale, destination.idea.note)}</p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {destination.idea.beats.map((beat) => (
                <li key={beat.title.fr} className="border-t border-[#1A1714]/20 pt-4">
                  <h3 className="font-display text-2xl">{copy(locale, beat.title)}</h3>
                  <p className="mt-2 text-sm leading-[1.7]">{copy(locale, beat.text)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-display text-[2rem] leading-none">{t("practical")}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-[1.7] text-muted">{t("practicalNote")}</p>
            <dl className="mt-8 grid gap-8 lg:grid-cols-3">
              {([
                ["flight", destination.flight],
                ["time", destination.time],
                ["formalities", destination.formalities],
              ] as const).map(([key, value]) => (
                <div key={key} className="border-t border-[#C5A880] pt-4">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#5C4824]">{t(key)}</dt>
                  <dd className="mt-3 text-sm leading-[1.7]">{copy(locale, value)}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-8 flex flex-wrap gap-3">
              {destination.themes.map((id) => {
                const theme = THEMES.find((item) => item.id === id)!;
                return (
                  <li key={id}>
                    <Link href={`/voyages/envies/${id}`} className="inline-flex border border-[#1A1714]/20 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">
                      {copy(locale, theme.name)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {related.length > 0 && (
          <section className="border-t border-[#1A1714]/10 px-5 py-14 sm:px-8">
            <div className="mx-auto max-w-7xl">
              <h2 className="font-display text-[1.8rem] leading-none">{t("nearby", { continent: copy(locale, continent.name) })}</h2>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/voyages/destinations/${item.slug}`} className="lux-line font-display text-2xl">
                      {copy(locale, item.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <QuoteBlock defaultService={name} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
