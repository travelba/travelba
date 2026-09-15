import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingStatus, CrmBooking, CrmTransaction } from "@/lib/crm/types";

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
  const shouldDebit =
    booking.status === "confirmed" ||
    booking.status === "travelling" ||
    booking.status === "completed";

  const { data: existing } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("kind", "booking")
    .eq("direction", "debit")
    .neq("status", "void")
    .maybeSingle();

  const debit = existing as CrmTransaction | null;

  if (booking.status === "cancelled") {
    if (debit) {
      await supabase
        .from("crm_transactions")
        .update({ status: "void" })
        .eq("id", debit.id);
    }
    return;
  }

  if (!shouldDebit) return;

  const amount = Number(booking.total_amount || 0);
  const label = `Réservation ${booking.reference} — ${booking.title}`;

  if (!debit) {
    if (amount <= 0) return;
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

  if (previousStatus && previousStatus !== booking.status) {
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
