import { HotelCompareDesk } from "@/components/admin/HotelCompareDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { expediaSearchEnabled } from "@/lib/crm/expedia/config";

export const metadata = { title: "Recherche hôtels" };
export const dynamic = "force-dynamic";

export default async function AdminHotelSearchPage() {
  await requireStaffPage();
  const expediaEnabled = expediaSearchEnabled();
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Recherche hôtels"
        subtitle="Comparer les disponibilités. Une réservation Little Emperors se fait dans l’espace client. Expedia reste en lecture."
      />
      <div className="mt-6">
        <HotelCompareDesk expediaEnabled={expediaEnabled} />
      </div>
    </div>
  );
}
