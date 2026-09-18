import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingStatus, CrmBooking, CrmTransaction } from "@/lib/crm/types";

export function bookingDebitIntent(input: {
  status: BookingStatus;
  amount: number;
  hasOpenDebit: boolean;
}): "insert" | "update" | "void" | "noop" {
  if (input.status === "cancelled") return input.hasOpenDebit ? "void" : "noop";
  const shouldDebit =
    input.status === "confirmed" ||
    input.status === "travelling" ||
    input.status === "completed";
  if (!shouldDebit) return "noop";
  if (!input.hasOpenDebit) return input.amount > 0 ? "insert" : "noop";
  if (input.amount <= 0) return "void";
  return "update";
}

export async function nextBookingReference(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("crm_next_booking_reference");
  if (error || !data) {
    throw new Error(error?.message || "Référence indisponible");
  }
  return String(data);
}

export async function syncBookingDebit(
  supabase: SupabaseClient,
  booking: CrmBooking,
  previousStatus?: BookingStatus
) {
  const { data: existing } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("kind", "booking")
    .eq("direction", "debit")
    .neq("status", "void")
    .maybeSingle();

  const debit = existing as CrmTransaction | null;
  const amount = Number(booking.total_amount || 0);
  const intent = bookingDebitIntent({
    status: booking.status,
    amount,
    hasOpenDebit: Boolean(debit),
  });
  const label = `Réservation ${booking.reference} — ${booking.title}`;

  if (intent === "void" && debit) {
    await supabase
      .from("crm_transactions")
      .update({ status: "void" })
      .eq("id", debit.id);
    return;
  }

  if (intent === "insert") {
    await supabase.from("crm_transactions").insert({
      customer_id: booking.customer_id,
      booking_id: booking.id,
      direction: "debit",
      kind: "booking",
      amount,
      currency: booking.currency || "EUR",
      label,
      source: "manual",
      status: "posted",
    });
    return;
  }

  if (intent !== "update" || !debit) return;

  const amountChanged = Number(debit.amount) !== amount;
  const statusChanged = Boolean(previousStatus && previousStatus !== booking.status);
  if (amountChanged || statusChanged || debit.status !== "posted") {
    await supabase
      .from("crm_transactions")
      .update({
        amount,
        currency: booking.currency || "EUR",
        label,
        status: "posted",
      })
      .eq("id", debit.id);
  }
}

export function canPublishCarnet(items: { kind: string }[]) {
  return items.some((item) => item.kind !== "fee");
}

export async function setCarnetPublished(
  supabase: SupabaseClient,
  bookingId: string,
  visible: boolean
) {
  if (visible) {
    const { data: items, error: itemsLookupError } = await supabase
      .from("crm_booking_items")
      .select("kind")
      .eq("booking_id", bookingId);
    if (itemsLookupError) throw new Error(itemsLookupError.message);
    if (!canPublishCarnet(items || [])) {
      throw new Error("Ajoutez au moins une carte avant de publier le carnet.");
    }
  }
  const { error: bookingError } = await supabase
    .from("crm_bookings")
    .update({ visible_to_client: visible })
    .eq("id", bookingId);
  if (bookingError) throw new Error(bookingError.message);
  if (!visible) return;
  const { error: itemsError } = await supabase
    .from("crm_booking_items")
    .update({ visible_to_client: true })
    .eq("booking_id", bookingId);
  if (itemsError) throw new Error(itemsError.message);
  const { error: docsError } = await supabase
    .from("crm_booking_documents")
    .update({ visible_to_client: true })
    .eq("booking_id", bookingId);
  if (docsError) throw new Error(docsError.message);
}

