import "server-only";
import { buildEtaIlDraft } from "@/lib/crm/eta-il-draft";
import { executeEtaIlFill } from "@/lib/crm/eta-il-run";
import { openaiApiKey } from "@/lib/crm/ingest-types";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ClientVisaStep } from "@/lib/crm/visa-flow";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCustomer,
  CrmTravelDocument,
} from "@/lib/crm/types";

/** Reprend l’ETA-IL après la réponse au client. Ne touche pas un paiement ni une pièce déjà posés. */
export async function continueEtaIlRequest(bookingId: string) {
  const service = createServiceClient();
  const { data: booking } = await service.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) return;
  const b = booking as CrmBooking;
  const { data: current } = await service
    .from("crm_visa_requests")
    .select("step, traveler_ids")
    .eq("booking_id", b.id)
    .eq("country", "IL")
    .maybeSingle();
  const row = current as { step?: ClientVisaStep; traveler_ids?: string[] | null } | null;
  if (row?.step !== "preparation") return;

  const [{ data: items }, { data: travelers }, { data: documents }, { data: customer }] = await Promise.all([
    service.from("crm_booking_items").select("*").eq("booking_id", b.id),
    service.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    service.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    service.from("crm_customers").select("first_name, last_name, usage_name").eq("id", b.customer_id).maybeSingle(),
  ]);
  const draft = buildEtaIlDraft({
    items: (items || []) as CrmBookingItem[],
    travelers: (travelers || []) as CrmBookingTraveler[],
    documents: (documents || []) as CrmTravelDocument[],
    holder: customer as Pick<CrmCustomer, "first_name" | "last_name" | "usage_name"> | null,
    startDate: b.start_date,
    endDate: b.end_date,
    travelerIds: row?.traveler_ids || [],
  });
  if (draft.phase !== "prêt") return;

  await executeEtaIlFill({
    db: service,
    bookingId: b.id,
    apiKey: openaiApiKey(),
    draft,
    fromSteps: ["preparation"],
  });
}
