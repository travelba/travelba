import { after, NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { continueEtaIlRequest } from "@/lib/crm/eta-il-continue";
import { createServiceClient } from "@/lib/supabase/admin";
import { openAcceptedVisa } from "@/lib/crm/visa-accept";
import {
  acceptVisaDecision,
  astraFillsCountry,
  confirmAllowed,
  mergeEstaAnswers,
  readEstaAnswers,
  visibilityOnRequest,
  type ClientVisaStep,
  type EstaAnswers,
} from "@/lib/crm/visa-flow";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function corridor(value: unknown): VisaCorridor | null {
  return value === "IL" || value === "US" || value === "GB" ? value : null;
}

function idList(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    country?: string;
    answers?: Partial<EstaAnswers>;
    confirm?: boolean;
    travelerIds?: string[];
  };
  const country = corridor(body.country);
  if (!country) return jsonError("Pays non pris en charge.");

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;
  const [{ data: items }, { data: documents }, { data: existing }, { data: travelers }, { data: companions }] =
    await Promise.all([
      auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
      auth.supabase.from("crm_travel_documents").select("doc_type, issuing_country, number").eq("customer_id", auth.customer.id),
      auth.supabase
        .from("crm_visa_requests")
        .select("country, step, status, answers, accepted_at")
        .eq("booking_id", b.id)
        .eq("country", country)
        .maybeSingle(),
      auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      auth.supabase.from("crm_travel_companions").select("*").eq("customer_id", auth.customer.id),
    ]);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);

  const current = existing as {
    step?: ClientVisaStep;
    status?: string;
    answers?: unknown;
    accepted_at?: string | null;
  } | null;
  const party = (travelers || []) as CrmBookingTraveler[];
  const partyIds = party.map((row) => row.id);
  const picked = idList(body.travelerIds);
  const decision = acceptVisaDecision({
    confirm: body.confirm === true,
    travelerIds: picked ?? partyIds,
    partyIds,
    alreadyAccepted: Boolean(current?.accepted_at),
    step: current?.step || null,
    status: current?.status || null,
  });
  if (!decision.start) {
    if (current?.accepted_at && current.step) return NextResponse.json({ country, step: current.step, accepted: true });
    return jsonError(decision.error);
  }

  const answers = mergeEstaAnswers(readEstaAnswers(current?.answers), body.answers);
  const french = ((documents || []) as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]).filter(
    (row) => row.doc_type === "passport" && row.issuing_country === "FR" && row.number
  ).length;
  const block = confirmAllowed({
    already: [],
    country,
    frenchPassports: french,
    esta: answers,
    resumable: Boolean(current?.step),
  });
  if (block) return jsonError(block);

  const service = createServiceClient();
  const opened = visibilityOnRequest({
    visible: b.visible_to_client,
    prices: b.prices_visible !== false && b.visible_to_client,
  });
  b.visible_to_client = opened.visible;
  b.prices_visible = opened.prices;
  await service
    .from("crm_bookings")
    .update({ visible_to_client: opened.visible, prices_visible: opened.prices })
    .eq("id", b.id);
  await openAcceptedVisa(service, {
    booking: b,
    country,
    step: decision.step,
    status: decision.status,
    travelerIds: decision.travelerIds,
    travelers: party,
    items: list,
    holder: auth.customer as CrmCustomer,
    companions: (companions || []) as CrmCompanion[],
    answers,
    enforceWindow: true,
  });
  if (astraFillsCountry(country) && decision.step === "preparation") after(() => continueEtaIlRequest(b.id));
  return NextResponse.json({ country, step: decision.step, accepted: true });
}
