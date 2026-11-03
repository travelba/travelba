import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CatalogueBlocks, CatalogueHero, CatalogueShell } from "@/components/site/CatalogueReading";
import { loadRanking, loadRankingCards } from "@/lib/crm/public-catalogue-load";
import { contentSlug, pickLocale } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const rows = await loadRankingCards();
  return rows.map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!contentSlug(slug)) return { title: siteConfig.name };
  const page = await loadRanking(slug);
  const title = page ? pickLocale(locale, page.title_fr, page.title_en) : locale === "en" ? "Ranking" : "Classement";
  return {
    title: `${title} — ${siteConfig.name}`,
    description: page ? pickLocale(locale, page.factual_summary_fr, page.factual_summary_en) || title : title,
  };
}

export default async function RankingPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!contentSlug(slug)) notFound();
  const page = await loadRanking(slug);
  if (!page) notFound();
  const title = pickLocale(locale, page.title_fr, page.title_en);
  return (
    <CatalogueShell
      locale={locale}
      kicker={locale === "en" ? "Ranking" : "Classement"}
      title={title}
      intro={pickLocale(locale, page.intro_fr, page.intro_en)}
    >
      <CatalogueHero src={page.hero_image} alt={title} />
      {page.factual_summary_fr || page.factual_summary_en ? (
        <p className="mt-8 leading-relaxed text-[#0B192C]">
          {pickLocale(locale, page.factual_summary_fr, page.factual_summary_en)}
        </p>
      ) : null}
      <ol className="mt-10 space-y-6">
        {page.entries.map((entry) => (
          <li key={`${entry.rank}-${entry.hotel_name}`} className="rounded-2xl border border-border bg-surface/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C5A880]">
              {entry.rank ? `${entry.rank}. ` : ""}
              {pickLocale(locale, entry.badge_fr, entry.badge_en)}
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-[#0B192C]">{entry.hotel_name}</h2>
            {entry.hotel_city ? <p className="text-sm text-muted">{entry.hotel_city}</p> : null}
            <p className="mt-3 leading-relaxed text-muted">{pickLocale(locale, entry.justification_fr, entry.justification_en)}</p>
          </li>
        ))}
      </ol>
      <CatalogueBlocks value={page.editorial_sections} />
      <CatalogueBlocks value={page.faq} />
      {page.outro_fr || page.outro_en ? (
        <p className="mt-10 leading-relaxed text-muted">{pickLocale(locale, page.outro_fr, page.outro_en)}</p>
      ) : null}
      {page.author_name ? <p className="mt-6 text-sm text-muted">{page.author_name}</p> : null}
    </CatalogueShell>
  );
}
