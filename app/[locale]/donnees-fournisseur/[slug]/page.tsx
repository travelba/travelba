import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CatalogueShell } from "@/components/site/CatalogueReading";
import { loadSupplierHotels } from "@/lib/crm/public-catalogue-load";
import { contentSlug } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const hotels = await loadSupplierHotels();
  return hotels.map((hotel) => ({ slug: hotel.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!contentSlug(slug)) return { title: siteConfig.name, robots: { index: false, follow: false } };
  const hotels = await loadSupplierHotels();
  const hotel = hotels.find((item) => item.slug === slug);
  const title = hotel?.name || (locale === "en" ? "Supplier rooms" : "Chambres fournisseur");
  return { title: `${title} — ${siteConfig.name}`, robots: { index: false, follow: false } };
}

export default async function SupplierHotelPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!contentSlug(slug)) notFound();
  const hotels = await loadSupplierHotels();
  const hotel = hotels.find((item) => item.slug === slug);
  if (!hotel) notFound();
  return (
    <CatalogueShell
      locale={locale}
      kicker={hotel.city || (locale === "en" ? "Supplier" : "Fournisseur")}
      title={hotel.name}
      intro={
        locale === "en"
          ? "Room names and amenities. Supplier photos are not shown."
          : "Noms de chambres et équipements. Les photos fournisseur ne sont pas affichées."
      }
    >
      <ul className="mt-10 space-y-4">
        {hotel.rooms.map((room) => (
          <li key={`${room.supplier}-${room.roomName}`} className="rounded-2xl border border-border bg-surface/40 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-[#0B192C]">{room.roomName}</h2>
            {room.amenities.length ? <p className="mt-2 text-sm leading-relaxed text-muted">{room.amenities.join(" · ")}</p> : null}
          </li>
        ))}
      </ul>
    </CatalogueShell>
  );
}
