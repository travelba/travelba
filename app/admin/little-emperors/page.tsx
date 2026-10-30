import { redirect } from "next/navigation";
import { LittleEmperorsInbox } from "@/components/admin/LittleEmperorsInbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { boiteHref } from "@/lib/crm/boite-tabs";
import { mylerSheet } from "@/lib/crm/myler-sheet";
import { leListMadeAt } from "@/lib/crm/le-confirmation-mail";
import { sortByLeMadeAt } from "@/lib/crm/le-made-at";
import {
  littleEmperorsConfigured,
  littleEmperorsProductionBlocked,
  littleEmperorsWebhookConfigured,
} from "@/lib/crm/little-emperors";
import type { CrmLeBooking } from "@/lib/crm/types";

type LeListRow = CrmLeBooking & { raw?: unknown; booked_at?: string | null };

export const metadata = { title: "Little Emperors" };

/** Page des partenaires MyLER. L’agence trouve ces réservations dans la Boîte de réception › Fournisseurs. */
export default async function AdminLittleEmperorsPage() {
  const { supabase, staff } = await requireStaffPage();
  if (staff.role !== "partner") redirect(boiteHref("fournisseurs", { source: "little-emperors" }));
  const copy = mylerSheet(true);
  const [{ data: rows, error: rowsError }, { data: probe }] = await Promise.all([
    supabase.from("crm_le_bookings_partner").select("*"),
    supabase.from("crm_le_sync_partner").select("last_status, last_error, last_ok_at").eq("provider", "little_emperors").maybeSingle(),
  ]);
  const listed = sortByLeMadeAt(
    (rowsError ? [] : ((rows || []) as LeListRow[])).map((row) => {
      const booked_on = leListMadeAt(row, []);
      const { raw: _raw, ...rest } = row;
      return { ...rest, booked_on };
    })
  );

  return (
    <div>
      <PageEyebrow>MyLER partner</PageEyebrow>
      <PageTitle title="Little Emperors" subtitle={copy.keyNote} />
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
      <div className="mt-6">
        <LittleEmperorsInbox
          rows={listed}
          customers={[]}
          storageReady={!rowsError}
          configured={littleEmperorsConfigured()}
          productionBlocked={littleEmperorsProductionBlocked()}
          webhookConfigured={littleEmperorsWebhookConfigured()}
          agency={false}
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
