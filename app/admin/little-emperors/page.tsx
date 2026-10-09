import { LittleEmperorsInbox } from "@/components/admin/LittleEmperorsInbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { CUSTOMER_PICK_LIMIT, CUSTOMER_PICK_SELECT, type PickableCustomer } from "@/lib/crm/customer-search";
import {
  littleEmperorsConfigured,
  littleEmperorsProductionBlocked,
  littleEmperorsWebhookConfigured,
} from "@/lib/crm/little-emperors";
import type { CrmLeBooking } from "@/lib/crm/types";

export const metadata = { title: "Little Emperors" };

export default async function AdminLittleEmperorsPage() {
  const { supabase, staff } = await requireStaffPage();
  const agency = staff.role !== "partner";
  const bookingsTable = agency ? "crm_le_bookings" : "crm_le_bookings_partner";
  const syncTable = agency ? "crm_le_sync" : "crm_le_sync_partner";
  const [{ data: rows, error: rowsError }, customersResult, { data: probe }] = await Promise.all([
    supabase.from(bookingsTable).select("*").order("check_in", { ascending: false, nullsFirst: false }),
    agency
      ? supabase.from("crm_customers").select(CUSTOMER_PICK_SELECT).order("last_name").limit(CUSTOMER_PICK_LIMIT)
      : Promise.resolve({ data: [] as PickableCustomer[] }),
    supabase.from(syncTable).select("last_status, last_error, last_ok_at").eq("provider", "little_emperors").maybeSingle(),
  ]);

  return (
    <div>
      <PageEyebrow>{agency ? "Espace agence" : "MyLER partner"}</PageEyebrow>
      <PageTitle
        title="Little Emperors"
        subtitle={
          agency
            ? "Réservations hôtel du compte de production. Le carnet reste fermé tant qu’il n’est pas publié."
            : "Test key, Refresh, v2 routes, and the webhook. Nothing else is open."
        }
      />
      <div className="mt-6">
        <LittleEmperorsInbox
          rows={rowsError ? [] : ((rows || []) as CrmLeBooking[])}
          customers={(customersResult.data || []) as PickableCustomer[]}
          storageReady={!rowsError}
          configured={littleEmperorsConfigured()}
          productionBlocked={littleEmperorsProductionBlocked()}
          webhookConfigured={littleEmperorsWebhookConfigured()}
          agency={agency}
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
