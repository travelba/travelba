import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { VoyageNav } from "@/components/voyages/VoyageNav";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { THEMES, copy, destinationsForTheme, themeById } from "@/lib/voyages/content";

export function generateStaticParams() {
  return THEMES.map((theme) => ({ slug: theme.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const theme = themeById(slug);
  const t = await getTranslations({ locale, namespace: "ThemePage" });
  const name = theme ? copy(locale, theme.name) : slug;
  return publicPageMeta(locale, `/voyages/envies/${slug}`, t("metaTitle", { name }), t("metaDescription", { name }));
}

export default async function ThemePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const theme = themeById(slug);
  if (!theme) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("ThemePage");
  const tServices = await getTranslations("Services");
  const destinations = destinationsForTheme(theme.id);

  return (
    <>
      <Header />
      <VoyageNav />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <header className="px-5 pb-12 pt-16 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-7xl">
            <Link href="/voyages/envies" className="lux-line text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
              {t("back")}
            </Link>
            <h1 className="mt-6 max-w-3xl font-display text-[clamp(2.8rem,6vw,5rem)] leading-[0.96]">
              {copy(locale, theme.name)}
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{copy(locale, theme.lede)}</p>
          </div>
        </header>
        <section className="px-5 pb-8 sm:px-8">
          <ul className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((item) => (
              <li key={item.slug}>
                <Link href={`/voyages/destinations/${item.slug}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Image src={item.image} alt={copy(locale, item.imageAlt)} fill sizes="(min-width: 1024px) 30vw, 100vw" className="lux-photo object-cover" />
                  </div>
                  <h2 className="mt-4 font-display text-[1.8rem] leading-none group-hover:text-[#5C4824]">
                    {copy(locale, item.name)}
                  </h2>
                  <p className="mt-2 text-sm leading-[1.6] text-muted">{copy(locale, item.tagline)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <QuoteBlock defaultService={tServices("bespoke.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
