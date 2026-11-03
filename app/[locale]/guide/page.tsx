import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CatalogueEmpty, CatalogueHero, CatalogueShell } from "@/components/site/CatalogueReading";
import { loadGuideCards } from "@/lib/crm/public-catalogue-load";
import { pickLocale } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "en" ? "Guides" : "Guides";
  return {
    title: `${title} — ${siteConfig.name}`,
    description: locale === "en" ? "Destination guides from the agency." : "Les guides de destination de l’agence.",
    alternates: { languages: { fr: "/fr/guide", en: "/en/guide" } },
  };
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const rows = await loadGuideCards();
  return (
    <CatalogueShell
      locale={locale}
      kicker={locale === "en" ? "The agency" : "L’agence"}
      title={locale === "en" ? "Guides" : "Guides"}
      intro={
        locale === "en"
          ? "Where to go, written by the agency."
          : "Où aller, écrit par l’agence."
      }
    >
      {rows.length === 0 ? <CatalogueEmpty locale={locale} /> : null}
      <ul className="mt-10 space-y-8">
        {rows.map((row) => {
          const title = pickLocale(locale, row.name_fr, row.name_en);
          return (
            <li key={row.slug} className="overflow-hidden rounded-2xl border border-border bg-surface/40">
              <Link href={`/guide/${row.slug}`} className="block p-5 transition-colors hover:bg-surface">
                <CatalogueHero src={row.hero_image} alt={title} />
                <h2 className="mt-4 font-display text-2xl font-semibold text-[#0B192C]">{title}</h2>
                <p className="mt-2 leading-relaxed text-muted">{pickLocale(locale, row.summary_fr, row.summary_en)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </CatalogueShell>
  );
}
