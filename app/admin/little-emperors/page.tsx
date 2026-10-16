import { LittleEmperorsDesk } from "@/components/admin/LittleEmperorsDesk";
import { LittleEmperorsInbox } from "@/components/admin/LittleEmperorsInbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { mylerSheet } from "@/lib/crm/myler-sheet";
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
  const copy = mylerSheet(!agency);
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
        subtitle={copy.keyNote}
      />
      <section className="mt-6 rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{copy.introTitle}</p>
        <div className="mt-2 space-y-2">
          {copy.intro.map((paragraph) => (
            <p key={paragraph} className="text-sm text-[var(--admin-navy)]">
              {paragraph}
            </p>
          ))}
        </div>
      </section>
      {agency ? (
        <div className="mt-6">
          <LittleEmperorsDesk customers={(customersResult.data || []) as PickableCustomer[]} />
        </div>
      ) : null}
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
