import { after } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { DossierPliantBalance } from "@/components/admin/DossierPliantBalance";
import { loadAdminBookingGate } from "@/lib/crm/admin-booking-gate";
import { enrichedBookingHotels, loadAdminBookingCritical, reconciledBookingLedger } from "@/lib/crm/admin-booking-load";
import { shellAdminBooking } from "@/lib/crm/admin-booking-shell";
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

  return (
    <BookingEditor
      {...shell.value}
      pliantBalance={
        <Suspense fallback={<p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Solde Pliant…</p>}>
          <DossierPliantBalance />
        </Suspense>
      }
      deferredLedger={shell.reconcile}
      deferredItems={shell.enrich}
    />
  );
}
