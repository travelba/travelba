import "server-only";
import { openEtaIlPortal } from "@/lib/crm/eta-il-browser";
import { buildEtaIlDraft } from "@/lib/crm/eta-il-draft";
import { runEtaIlSession } from "@/lib/crm/eta-il-session";
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
    .select("step")
    .eq("booking_id", b.id)
    .eq("country", "IL")
    .maybeSingle();
  const step = (current as { step?: ClientVisaStep } | null)?.step;
  if (step !== "preparation") return;

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
  });
  if (draft.phase !== "prêt") return;

  const apiKey = openaiApiKey();
  if (!apiKey) return;

  const { data: marked } = await service
    .from("crm_visa_requests")
    .update({ step: "remplissage" })
    .eq("booking_id", b.id)
    .eq("country", "IL")
    .eq("step", "preparation")
    .select("step");
  if (!marked?.length) return;

  const portal = await openEtaIlPortal();
  if (!portal) {
    console.error("[eta-il] le portail n’a pas pu s’ouvrir");
    return;
  }
  try {
    const session = await runEtaIlSession({ apiKey, draft, page: portal });
    const next: ClientVisaStep = session.phase === "à confirmer" ? "validation" : "remplissage";
    await service
      .from("crm_visa_requests")
      .update({ step: next })
      .eq("booking_id", b.id)
      .eq("country", "IL")
      .eq("step", "remplissage");
  } catch (err) {
    console.error("[eta-il]", err instanceof Error ? err.message : "échec");
  } finally {
    await portal.close();
  }
}
