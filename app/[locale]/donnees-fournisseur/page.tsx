import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CatalogueEmpty, CatalogueShell } from "@/components/site/CatalogueReading";
import { loadSupplierHotels } from "@/lib/crm/public-catalogue-load";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "en" ? "Supplier rooms" : "Chambres fournisseur";
  return {
    title: `${title} — ${siteConfig.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function SupplierDataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const hotels = await loadSupplierHotels();
  return (
    <CatalogueShell
      locale={locale}
      kicker={locale === "en" ? "Suppliers" : "Fournisseurs"}
      title={locale === "en" ? "Supplier rooms" : "Chambres fournisseur"}
      intro={
        locale === "en"
          ? "Room names and amenities. Supplier photos are not shown."
          : "Noms de chambres et équipements. Les photos fournisseur ne sont pas affichées."
      }
    >
      {hotels.length === 0 ? <CatalogueEmpty locale={locale} /> : null}
      <ul className="mt-10 space-y-4">
        {hotels.map((hotel) => (
          <li key={hotel.slug}>
            <Link href={`/donnees-fournisseur/${hotel.slug}`} className="block rounded-2xl border border-border bg-surface/40 px-5 py-4 transition-colors hover:bg-surface">
              <span className="font-display text-lg font-semibold text-[#0B192C]">{hotel.name}</span>
              {hotel.city ? <span className="mt-1 block text-sm text-muted">{hotel.city}</span> : null}
              <span className="mt-1 block text-sm text-muted">
                {hotel.rooms.length} {locale === "en" ? "rooms" : "chambres"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CatalogueShell>
  );
}
