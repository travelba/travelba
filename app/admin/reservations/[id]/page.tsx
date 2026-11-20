import { after } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { DossierPliantBalance } from "@/components/admin/DossierPliantBalance";
import { loadAdminBookingGate } from "@/lib/crm/admin-booking-gate";
import { listCustomerTwins } from "@/lib/crm/customer-twins";
import { createServiceClient } from "@/lib/supabase/admin";
import { enrichedBookingHotels, loadAdminBookingCritical, reconciledBookingLedger } from "@/lib/crm/admin-booking-load";
import { shellAdminBooking } from "@/lib/crm/admin-booking-shell";
import { loadDiscountLines } from "@/lib/crm/booking-discounts-db";
import type { DiscountLine } from "@/lib/crm/commercial-discount";
import { repairCustomerDownloads } from "@/lib/crm/download-journal";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hotel?: string | string[]; relance?: string | string[]; repondre?: string | string[] }>;
};

function queryId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const { booking } = await loadAdminBookingGate(id);
    return { title: booking?.reference ? `Dossier ${booking.reference}` : "Dossier" };
  } catch {
    return { title: "Dossier" };
  }
}

export default async function AdminBookingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const gate = await loadAdminBookingGate(id);
  if (!gate.booking) notFound();
  const booking = gate.booking;
  const shell = await shellAdminBooking({
    critical: () =>
      loadAdminBookingCritical({
        supabase: gate.supabase,
        staff: gate.staff,
        booking,
        openHotelItemId: queryId(query.hotel),
        openRelanceId: queryId(query.relance),
        openReplyId: queryId(query.repondre),
      }),
    reconcile: () => reconciledBookingLedger(gate.supabase, booking),
    enrich: () => enrichedBookingHotels(booking.id),
    repair: () => repairCustomerDownloads([booking.customer_id]),
    schedule: (task) => after(task),
  });

  const panels = shell.value.panels
    ? {
        ...shell.value.panels,
        money: shell.value.panels.money.then((value) =>
          value ? { ...value, revision: shell.argentStamp, layer: 0 } : null
        ),
      }
    : null;

  let twinNames: string[] = [];
  let discounts: DiscountLine[] | null = null;
  try {
    twinNames = (await listCustomerTwins(createServiceClient(), booking.customer_id)).map((twin) => twin.nom);
  } catch {
    twinNames = [];
  }
  try {
    const loaded = await loadDiscountLines([booking.id]);
    discounts = loaded ? loaded.get(booking.id) || [] : null;
  } catch {
    discounts = null;
  }

  return (
    <BookingEditor
      {...shell.value}
      twinNames={twinNames}
      discounts={discounts}
      panels={panels}
      deferredLedger={shell.reconcile.then((value) =>
        value ? { ...value, revision: shell.argentStamp, layer: 1 } : null
      )}
      pliantBalance={
        <Suspense fallback={<p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Solde Pliant…</p>}>
          <DossierPliantBalance />
        </Suspense>
      }
      deferredItems={shell.enrich}
    />
  );
}
