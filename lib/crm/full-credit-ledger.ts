import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fullCreditExternalId, fullCreditLedgerLabel } from "./full-credit";
import type { CrmBooking } from "./types";

/** Écrit le montant réellement capturé. Le plafond de 500 € par nuit n’est jamais débité. */
export async function postFullCreditCapture(
  supabase: SupabaseClient,
  booking: Pick<CrmBooking, "id" | "reference" | "customer_id" | "billing_customer_id" | "billing_company_id">,
  creditId: string,
  hotelName: string,
  cents: number
) {
  const amount = Math.round(cents) / 100;
  const externalId = fullCreditExternalId(creditId);
  const label = fullCreditLedgerLabel(hotelName, booking.reference);
  const { data, error: readError } = await supabase
    .from("crm_transactions")
    .select("id")
    .eq("source", "manual")
    .eq("external_id", externalId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const existing = data as { id: string } | null;
  const row = {
    customer_id: booking.billing_customer_id || booking.customer_id,
    booking_id: booking.id,
    billing_company_id: booking.billing_company_id || null,
    amount,
    currency: "EUR",
    label,
    status: "posted" as const,
  };
  if (!existing) {
    const { error } = await supabase.from("crm_transactions").insert({
      ...row,
      direction: "debit",
      kind: "booking",
      source: "manual",
      external_id: externalId,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("crm_transactions").update(row).eq("id", existing.id);
  if (error) throw new Error(error.message);
}
