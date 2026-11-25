import { TicketingFeeList, type TicketingFeeRow } from "@/components/admin/TicketingFeeList";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { inheritedTicketingFees, ticketingFeeKept } from "@/lib/crm/ticketing-review";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Frais de billeterie" };

type ItemRow = {
  id: string;
  booking_id: string;
  title: string | null;
  amount: number | null;
  details: Record<string, unknown> | null;
  lifecycle: string | null;
  kind: string | null;
};

export default async function BilleterieReglagesPage() {
  await requireStaffPage();
  let rows: TicketingFeeRow[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_booking_items")
      .select("id, booking_id, title, amount, details, lifecycle, kind")
      .eq("kind", "expense")
      .contains("details", { auto_fee: "ticketing" });
    const items = inheritedTicketingFees((data || []) as ItemRow[]);
    const bookingIds = [...new Set(items.map((item) => item.booking_id))];
    const { data: bookings } = bookingIds.length
      ? await admin.from("crm_bookings").select("id, reference, customer_id, currency").in("id", bookingIds)
      : { data: [] };
    const bookingRows = (bookings || []) as { id: string; reference: string; customer_id: string; currency: string | null }[];
    const customerIds = [...new Set(bookingRows.map((booking) => booking.customer_id))];
    const { data: customers } = customerIds.length
      ? await admin.from("crm_customers").select("id, first_name, last_name").in("id", customerIds)
      : { data: [] };
    const names = new Map(
      ((customers || []) as { id: string; first_name: string; last_name: string }[]).map((customer) => [
        customer.id,
        customerFullName(customer),
      ])
    );
    const byBooking = new Map(bookingRows.map((booking) => [booking.id, booking]));
    rows = items
      .map((item) => {
        const booking = byBooking.get(item.booking_id);
        if (!booking) return null;
        return {
          id: item.id,
          bookingId: item.booking_id,
          reference: booking.reference,
          title: item.title || "Frais de billeterie",
          client: names.get(booking.customer_id) || "Client",
          amount: item.amount == null ? null : Number(item.amount),
          currency: booking.currency || "EUR",
          kept: ticketingFeeKept(item.details),
        };
      })
      .filter((row): row is TicketingFeeRow => Boolean(row))
      .sort((a, b) => a.reference.localeCompare(b.reference));
  } catch {
    rows = [];
  }

  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Frais de billeterie</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Lignes automatiques déjà posées sur les dossiers. Chacune se garde ou se supprime. Rien n’est retiré en masse.
      </p>
      <TicketingFeeList rows={rows} />
    </div>
  );
}
