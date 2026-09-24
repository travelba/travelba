import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBooking } from "./types";
import { ledgerAfterCharge, type VisaLedgerLine } from "./visa-ledger";
import type { VisaCorridor } from "./visa-fees";

async function upsertLine(
  supabase: SupabaseClient,
  booking: CrmBooking,
  line: VisaLedgerLine
) {
  const { data } = await supabase
    .from("crm_transactions")
    .select("id, status")
    .eq("source", "manual")
    .eq("external_id", line.externalId)
    .maybeSingle();
  const existing = data as { id: string; status: string } | null;
  const status = line.voided ? "void" : "posted";
  if (!existing) {
    if (line.voided) return;
    const { error } = await supabase.from("crm_transactions").insert({
      customer_id: booking.billing_customer_id || booking.customer_id,
      booking_id: booking.id,
      direction: "debit",
      kind: "booking",
      amount: line.amount,
      currency: "EUR",
      label: line.label,
      source: "manual",
      external_id: line.externalId,
      status: "posted",
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("crm_transactions")
    .update({
      customer_id: booking.billing_customer_id || booking.customer_id,
      amount: line.amount,
      label: line.label,
      status,
    })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
}

export async function postVisaCharge(
  supabase: SupabaseClient,
  booking: CrmBooking,
  input: {
    country: VisaCorridor;
    pliantTransactionId: string;
    paidCents: number;
    travelerIds: string[];
    refusedTravelerIds: string[];
  }
) {
  const lines = ledgerAfterCharge({ bookingId: booking.id, ...input });
  for (const line of lines) await upsertLine(supabase, booking, line);
  return lines.filter((line) => !line.voided).length;
}
