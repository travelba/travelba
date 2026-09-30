import type { SupabaseClient } from "@supabase/supabase-js";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
import { isLedgerExpenseKind } from "@/lib/crm/types";

type StayRow = {
  id: string;
  status: string;
  total_amount: number | string | null;
  agency_commission?: boolean | null;
};

/** Même montant que le dossier, la liste et le règlement quand les frais suivent le séjour. */
export async function loadDisplayedStayAmounts(supabase: SupabaseClient, bookings: StayRow[]) {
  const expenses = new Map<string, { amount: number | null }[]>();
  const flights = new Set<string>();
  const travelers = new Map<string, number>();
  if (bookings.length) {
    const ids = bookings.map((booking) => booking.id);
    const [{ data }, { data: travelerRows }] = await Promise.all([
      supabase.from("crm_booking_items").select("booking_id, kind, amount").in("booking_id", ids).in("kind", ["expense", "flight"]),
      supabase.from("crm_booking_travelers").select("booking_id").in("booking_id", ids),
    ]);
    for (const row of (data || []) as { booking_id: string; kind: string; amount: number | null }[]) {
      if (row.kind === "flight") flights.add(row.booking_id);
      if (!isLedgerExpenseKind(row.kind)) continue;
      const list = expenses.get(row.booking_id) || [];
      list.push({ amount: row.amount == null ? null : Number(row.amount) });
      expenses.set(row.booking_id, list);
    }
    for (const row of (travelerRows || []) as { booking_id: string }[]) {
      travelers.set(row.booking_id, (travelers.get(row.booking_id) || 0) + 1);
    }
  }
  const amounts = new Map<string, number>();
  for (const booking of bookings) {
    amounts.set(
      booking.id,
      stayPriceWithExpenses({
        stayTotal: Number(booking.total_amount),
        agencyCommission: booking.agency_commission === true,
        expenses: expenses.get(booking.id) || [],
        ticketingFee: collectableTicketingFee({
          status: booking.status,
          hasFlight: flights.has(booking.id),
          travelerCount: travelers.get(booking.id) || 0,
        }),
      })
    );
  }
  return amounts;
}
