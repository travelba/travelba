import Link from "next/link";
import { redirect } from "next/navigation";
import { RestaurantCatalog } from "@/components/admin/RestaurantCatalog";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { listRestaurants } from "@/lib/crm/restaurants-db";

export const metadata = { title: "Restaurants" };

export default async function AdminRestaurantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, staff } = await requireStaffPage();
  if (staff.role === "partner") redirect("/admin/little-emperors");
  const { q } = await searchParams;
  const query = (q || "").slice(0, 40);
  const catalog = await listRestaurants(supabase, query);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Restaurants"
          subtitle="Catalogue des tables. Les étoilés, le gastronomique et le prépaiement obligatoire restent hors sélection."
          actions={
            <Link href="/admin/restaurants/aujourdhui" className="admin-tap inline-flex min-h-11 items-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C]">
              Ce soir
            </Link>
          }
        />
      </div>
      {catalog.ready ? null : (
        <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-[#0B192C]">
          {"error" in catalog && catalog.error ? catalog.error : "Le module restaurants n’est pas encore en place."}
        </p>
      )}
      <RestaurantCatalog rows={catalog.rows} query={query} />
    </div>
  );
}
