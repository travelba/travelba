import { LittleEmperorsInbox } from "@/components/admin/LittleEmperorsInbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { CUSTOMER_PICK_LIMIT, CUSTOMER_PICK_SELECT, type PickableCustomer } from "@/lib/crm/customer-search";
import { littleEmperorsConfigured, littleEmperorsProductionBlocked } from "@/lib/crm/little-emperors";
import type { CrmLeBooking } from "@/lib/crm/types";

export default async function AdminLittleEmperorsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: rows, error: rowsError }, { data: customers }, { data: probe }] = await Promise.all([
    supabase.from("crm_le_bookings").select("*").order("check_in", { ascending: false, nullsFirst: false }),
    supabase
      .from("crm_customers")
      .select(CUSTOMER_PICK_SELECT)
      .order("last_name")
      .limit(CUSTOMER_PICK_LIMIT),
    supabase.from("crm_le_sync").select("last_status, last_error, last_ok_at").eq("provider", "little_emperors").maybeSingle(),
  ]);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Little Emperors"
        subtitle="Réservations hôtel lues sur l’environnement de test. Le carnet reste fermé tant qu’il n’est pas publié."
      />
      <div className="mt-6">
        <LittleEmperorsInbox
          rows={rowsError ? [] : ((rows || []) as CrmLeBooking[])}
          customers={(customers || []) as PickableCustomer[]}
          storageReady={!rowsError}
          configured={littleEmperorsConfigured()}
          productionBlocked={littleEmperorsProductionBlocked()}
          probe={{
            last_status: probe?.last_status ?? null,
            last_error: probe?.last_error ?? null,
            last_ok_at: probe?.last_ok_at ?? null,
          }}
        />
      </div>
    </div>
  );
}
