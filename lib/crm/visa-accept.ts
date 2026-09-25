import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findVisaExtra } from "./extras";
import { clearServiceRefusal, createBookingExtra } from "./extras-write";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "./types";
import { hasEstaAnswers, type ClientVisaStep, type EstaAnswers } from "./visa-flow";
import type { VisaCorridor } from "./visa-fees";

/** Enregistre la validation, le service, puis le palier. N’envoie pas de WhatsApp. */
export async function openAcceptedVisa(
  supabase: SupabaseClient,
  input: {
    booking: CrmBooking;
    country: VisaCorridor;
    step: ClientVisaStep;
    status: string;
    travelerIds: string[];
    travelers: CrmBookingTraveler[];
    items: CrmBookingItem[];
    holder: CrmCustomer;
    companions: CrmCompanion[];
    answers?: Partial<EstaAnswers> | null;
    enforceWindow: boolean;
  }
) {
  const chosen = input.travelerIds.length
    ? input.travelers.filter((row) => input.travelerIds.includes(row.id))
    : input.travelers;
  await clearServiceRefusal(supabase, input.booking.id, "visa", null, null);
  if (!findVisaExtra(input.items)) {
    await createBookingExtra(supabase, {
      booking: input.booking,
      items: input.items,
      travelers: chosen,
      holder: input.holder,
      companions: input.companions,
      kind: "visa",
      leg: null,
      enforceWindow: input.enforceWindow,
    });
  }
  const row: Record<string, unknown> = {
    booking_id: input.booking.id,
    country: input.country,
    status: input.status,
    step: input.step,
    accepted_at: new Date().toISOString(),
    traveler_ids: input.travelerIds,
  };
  if (input.answers && hasEstaAnswers(input.answers)) row.answers = input.answers;
  const { error } = await supabase.from("crm_visa_requests").upsert(row, { onConflict: "booking_id,country" });
  if (error) throw new Error(error.message);
}
