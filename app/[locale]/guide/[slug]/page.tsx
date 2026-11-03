import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CatalogueBlocks, CatalogueHero, CatalogueShell } from "@/components/site/CatalogueReading";
import { loadGuide, loadGuideCards } from "@/lib/crm/public-catalogue-load";
import { contentSlug, pickLocale } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const rows = await loadGuideCards();
  return rows.map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!contentSlug(slug)) return { title: siteConfig.name };
  const page = await loadGuide(slug);
  const title = page ? pickLocale(locale, page.name_fr, page.name_en) : locale === "en" ? "Guide" : "Guide";
  return {
    title: `${title} — ${siteConfig.name}`,
    description: page ? pickLocale(locale, page.summary_fr, page.summary_en) || title : title,
  };
}

export default async function GuidePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!contentSlug(slug)) notFound();
  const page = await loadGuide(slug);
  if (!page) notFound();
  const title = pickLocale(locale, page.name_fr, page.name_en);
  return (
    <CatalogueShell
      locale={locale}
      kicker={locale === "en" ? "Guide" : "Guide"}
      title={title}
      intro={pickLocale(locale, page.summary_fr, page.summary_en)}
    >
      <CatalogueHero src={page.hero_image} alt={title} />
      {page.summary_long_fr && locale !== "en" ? <p className="mt-8 leading-relaxed text-[#0B192C]">{page.summary_long_fr}</p> : null}
      <CatalogueBlocks value={page.highlights} />
      <CatalogueBlocks value={page.sections} />
      <CatalogueBlocks value={page.practical_info} />
      <CatalogueBlocks value={page.faq} />
      {page.author_name ? <p className="mt-6 text-sm text-muted">{page.author_name}</p> : null}
    </CatalogueShell>
  );
}
