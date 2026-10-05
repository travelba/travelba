import type { SupabaseClient } from "@supabase/supabase-js";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
import { isActiveItem, isExtraItemKind, isLedgerExpenseKind } from "@/lib/crm/types";

type StayRow = {
  id: string;
  status: string;
  total_amount: number | string | null;
  agency_commission?: boolean | null;
};

type StayItemRow = { kind: string; amount: number | string | null; lifecycle?: string | null };

/**
 * Montant lu par le client : cartes + commission d’agence + billetterie + dépenses libres.
 * Les 10 % portent sur les étapes et les dépenses. Une seule formule pour la liste, le détail et l’aperçu.
 */
export function displayedStayAmount(
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission">,
  items: StayItemRow[],
  travelerCount: number
) {
  const active = items.filter((item) => isActiveItem(item));
  const amounts = (kind: (value: string | null | undefined) => boolean) =>
    active
      .filter((item) => kind(item.kind))
      .map((item) => ({ amount: item.amount == null ? null : Number(item.amount) }));
  return stayPriceWithExpenses({
    stayTotal: Number(booking.total_amount),
    agencyCommission: booking.agency_commission === true,
    expenses: amounts(isLedgerExpenseKind),
    extras: amounts(isExtraItemKind),
    ticketingFee: collectableTicketingFee({
      status: booking.status,
      hasFlight: active.some((item) => item.kind === "flight"),
      travelerCount,
    }),
  });
}

/** Même montant que le dossier, la liste et le règlement quand les frais suivent le séjour. */
export async function loadDisplayedStayAmounts(supabase: SupabaseClient, bookings: StayRow[]) {
  const itemsByBooking = new Map<string, StayItemRow[]>();
  const travelers = new Map<string, number>();
  if (bookings.length) {
    const ids = bookings.map((booking) => booking.id);
    const [{ data }, { data: travelerRows }] = await Promise.all([
      supabase
        .from("crm_booking_items")
        .select("booking_id, kind, amount, lifecycle")
        .in("booking_id", ids)
        .in("kind", ["expense", "flight", "chauffeur", "greeter", "visa", "checkin"]),
      supabase.from("crm_booking_travelers").select("booking_id").in("booking_id", ids),
    ]);
    for (const row of (data || []) as {
      booking_id: string;
      kind: string;
      amount: number | null;
      lifecycle?: string | null;
    }[]) {
      const list = itemsByBooking.get(row.booking_id) || [];
      list.push({ kind: row.kind, amount: row.amount, lifecycle: row.lifecycle });
      itemsByBooking.set(row.booking_id, list);
    }
    for (const row of (travelerRows || []) as { booking_id: string }[]) {
      travelers.set(row.booking_id, (travelers.get(row.booking_id) || 0) + 1);
    }
  }
  const amounts = new Map<string, number>();
  for (const booking of bookings) {
    amounts.set(
      booking.id,
      displayedStayAmount(booking, itemsByBooking.get(booking.id) || [], travelers.get(booking.id) || 0)
    );
  }
  return amounts;
}
