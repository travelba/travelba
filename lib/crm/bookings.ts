import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBooking, CrmTransaction } from "@/lib/crm/types";

export async function nextBookingReference(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("crm_next_booking_reference");
  if (error || !data) {
    throw new Error(error?.message || "Référence indisponible");
  }
  return String(data);
}

export async function syncBookingDebit(
  supabase: SupabaseClient,
  booking: CrmBooking
) {
  const amount = Number(booking.total_amount || 0);
  const shouldDebit =
    amount > 0 &&
    (booking.status === "confirmed" ||
      booking.status === "travelling" ||
      booking.status === "completed");

  const { data: existing, error: lookupError } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("kind", "booking")
    .eq("direction", "debit")
    .neq("status", "void")
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const debit = existing as CrmTransaction | null;

  if (!shouldDebit) {
    if (debit) {
      const { error } = await supabase
        .from("crm_transactions")
        .update({ status: "void" })
        .eq("id", debit.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const label = `Réservation ${booking.reference} — ${booking.title}`;

  if (!debit) {
    const { error } = await supabase.from("crm_transactions").insert({
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
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("crm_transactions")
    .update({
      customer_id: booking.customer_id,
      amount,
      currency: booking.currency || "EUR",
      label,
      status: "posted",
    })
    .eq("id", debit.id);
  if (error) throw new Error(error.message);
}
