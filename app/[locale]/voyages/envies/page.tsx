import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { VoyageNav } from "@/components/voyages/VoyageNav";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { THEMES, copy, destinationsForTheme } from "@/lib/voyages/content";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ThemesPage" });
  return publicPageMeta(locale, "/voyages/envies", t("metaTitle"), t("metaDescription"));
}

export default async function ThemesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ThemesPage");

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
        <ul className="mx-auto max-w-7xl border-t border-[#1A1714]/15 px-5 sm:px-8">
          {THEMES.map((theme) => (
            <li key={theme.id} className="border-b border-[#1A1714]/15">
              <Link href={`/voyages/envies/${theme.id}`} className="grid gap-3 py-8 lg:grid-cols-[16rem_1fr_auto] lg:items-baseline">
                <h2 className="font-display text-[2rem] leading-none">{copy(locale, theme.name)}</h2>
                <p className="text-sm leading-[1.7] text-muted">{copy(locale, theme.lede)}</p>
                <span className="text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">
                  {t("count", { count: destinationsForTheme(theme.id).length })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
