import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CatalogueEmpty, CatalogueHero, CatalogueShell } from "@/components/site/CatalogueReading";
import { loadRankingCards } from "@/lib/crm/public-catalogue-load";
import { pickLocale } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "en" ? "Rankings" : "Classements";
  return {
    title: `${title} — ${siteConfig.name}`,
    description:
      locale === "en"
        ? "The agency’s hotel rankings."
        : "Les classements d’hôtels de l’agence.",
    alternates: { languages: { fr: "/fr/classement", en: "/en/classement" } },
  };
}

export default async function RankingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const rows = await loadRankingCards();
  return (
    <CatalogueShell
      locale={locale}
      kicker={locale === "en" ? "The agency" : "L’agence"}
      title={locale === "en" ? "Rankings" : "Classements"}
      intro={
        locale === "en"
          ? "A selection of hotels, written by the agency."
          : "Une sélection d’hôtels, écrite par l’agence."
      }
    >
      {rows.length === 0 ? <CatalogueEmpty locale={locale} /> : null}
      <ul className="mt-10 space-y-8">
        {rows.map((row) => {
          const title = pickLocale(locale, row.title_fr, row.title_en);
          return (
            <li key={row.slug} className="overflow-hidden rounded-2xl border border-border bg-surface/40">
              <Link href={`/classement/${row.slug}`} className="block p-5 transition-colors hover:bg-surface">
                <CatalogueHero src={row.hero_image} alt={title} />
                <h2 className="mt-4 font-display text-2xl font-semibold text-[#0B192C]">{title}</h2>
                {row.kind ? <p className="mt-1 text-sm text-muted">{row.kind}</p> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </CatalogueShell>
  );
}
