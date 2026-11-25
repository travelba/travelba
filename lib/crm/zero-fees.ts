import type { SupabaseClient } from "@supabase/supabase-js";
import { TICKETING_FEE_OFF } from "@/lib/crm/ticketing-fee";
import type { CrmBooking } from "@/lib/crm/types";

export type FeePiece = {
  printed_at?: string | null;
  piece_number?: string | null;
  attempt_status?: string | null;
};

/** Facture imprimée, pièce MB3M déjà numérotée, ou préparation en cours. */
export function feesLockedByPieces(pieces: FeePiece[]) {
  return pieces.some(
    (piece) => Boolean(piece.printed_at) || Boolean((piece.piece_number || "").trim()) || piece.attempt_status === "preparing"
  );
}

export function customerZeroFees(row: { zero_fees?: boolean | null } | null | undefined) {
  return row?.zero_fees === true;
}

function missingColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204" || error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }
  return /zero_fees|does not exist|schema cache/i.test(error.message || "");
}

/** La fiche propriétaire du dossier. Un jumeau qui consulte ne change rien. */
export async function ownerHasZeroFees(supabase: SupabaseClient, customerId: string | null | undefined) {
  if (!customerId) return false;
  try {
    const { data, error } = await supabase.from("crm_customers").select("zero_fees").eq("id", customerId).maybeSingle();
    if (error || missingColumn(error)) return false;
    return customerZeroFees(data as { zero_fees?: boolean | null } | null);
  } catch {
    return false;
  }
}

export async function bookingFeesAreLocked(supabase: SupabaseClient, bookingId: string) {
  const locked = await lockedBookingIds(supabase, [bookingId]);
  return locked.has(bookingId);
}

async function lockedBookingIds(supabase: SupabaseClient, ids: string[]) {
  const locked = new Set<string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return locked;
  const pieces = await supabase
    .from("crm_mb3m_pieces")
    .select("booking_id, printed_at, piece_number, attempt_status")
    .in("booking_id", unique);
  if (pieces.error) {
    if (!missingColumn(pieces.error)) {
      for (const id of unique) locked.add(id);
    }
  } else {
    for (const row of (pieces.data || []) as (FeePiece & { booking_id?: string | null })[]) {
      if (row.booking_id && feesLockedByPieces([row])) locked.add(row.booking_id);
    }
  }
  const links = await supabase
    .from("crm_grouped_invoice_bookings")
    .select("booking_id, grouped_invoice_id")
    .in("booking_id", unique);
  if (links.error) {
    if (!missingColumn(links.error)) {
      for (const id of unique) locked.add(id);
    }
    return locked;
  }
  const invoiceIds = [
    ...new Set(
      ((links.data || []) as { grouped_invoice_id?: string | null }[])
        .map((row) => row.grouped_invoice_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (!invoiceIds.length) return locked;
  const invoices = await supabase.from("crm_grouped_invoices").select("id, removed_at").in("id", invoiceIds);
  if (invoices.error) {
    if (!missingColumn(invoices.error)) {
      for (const id of unique) locked.add(id);
    }
    return locked;
  }
  const open = new Set(
    ((invoices.data || []) as { id: string; removed_at?: string | null }[])
      .filter((row) => !row.removed_at)
      .map((row) => row.id)
  );
  for (const row of (links.data || []) as { booking_id?: string | null; grouped_invoice_id?: string | null }[]) {
    if (row.booking_id && row.grouped_invoice_id && open.has(row.grouped_invoice_id)) locked.add(row.booking_id);
  }
  return locked;
}

/**
 * Coche Zéro frais : retire billeterie et commission d’agence des dossiers
 * de cette fiche qui ne sont pas facturés. Les autres fiches jumelées ne sont pas balayées.
 */
export async function applyCustomerZeroFees(supabase: SupabaseClient, customerId: string) {
  const { data, error } = await supabase.from("crm_bookings").select("*").eq("customer_id", customerId);
  if (error || !data) return { retires: 0, laisses: 0 };
  const bookings = data as CrmBooking[];
  const locked = await lockedBookingIds(
    supabase,
    bookings.map((booking) => booking.id)
  );
  const { syncBookingLedger } = await import("@/lib/crm/bookings");
  let retires = 0;
  let laisses = 0;
  for (const booking of bookings) {
    if (locked.has(booking.id)) {
      laisses += 1;
      continue;
    }
    const { error: updateError } = await supabase
      .from("crm_bookings")
      .update({ fee_mode: TICKETING_FEE_OFF, agency_commission: false })
      .eq("id", booking.id);
    if (updateError) {
      laisses += 1;
      continue;
    }
    await syncBookingLedger(supabase, { ...booking, fee_mode: TICKETING_FEE_OFF, agency_commission: false });
    retires += 1;
  }
  return { retires, laisses };
}
