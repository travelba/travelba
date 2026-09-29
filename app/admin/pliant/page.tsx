import { requireStaffPage } from "@/lib/crm/auth";
import { pliantConfigured } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";
import { PliantSpendInbox, type PliantSpendRow } from "@/components/admin/PliantSpendInbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import type { CrmPliantTransaction } from "@/lib/crm/types";

export default async function AdminPliantPage() {
  await requireStaffPage();
  const admin = createServiceClient();
  let rows: PliantSpendRow[] = [];
  try {
    const { data } = await admin
      .from("crm_pliant_transactions")
      .select("*")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    const spends = (data || []) as CrmPliantTransaction[];
    const bookingIds = [...new Set(spends.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
    const customerIds = [...new Set(spends.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
    const [{ data: bookings }, { data: customers }] = await Promise.all([
      bookingIds.length
        ? admin.from("crm_bookings").select("id, reference").in("id", bookingIds)
        : Promise.resolve({ data: [] }),
      customerIds.length
        ? admin.from("crm_customers").select("id, first_name, last_name").in("id", customerIds)
        : Promise.resolve({ data: [] }),
    ]);
    const references = new Map(
      ((bookings || []) as { id: string; reference: string }[]).map((row) => [row.id, row.reference])
    );
    const names = new Map(
      ((customers || []) as { id: string; first_name: string | null; last_name: string | null }[]).map((row) => [
        row.id,
        `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      ])
    );
    rows = spends.map((row) => ({
      ...row,
      reference: row.booking_id ? references.get(row.booking_id) || null : null,
      clientName: row.customer_id ? names.get(row.customer_id) || null : null,
    }));
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Dépenses Pliant" subtitle="Toutes les cartes. Le dossier s’affiche quand la carte lui est liée." />
      <div className="mt-6">
        <PliantSpendInbox rows={rows} configured={pliantConfigured()} />
      </div>
    </div>
  );
}
