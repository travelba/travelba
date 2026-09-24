import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { openEtaIlPortal } from "@/lib/crm/eta-il-browser";
import { buildEtaIlDraft } from "@/lib/crm/eta-il-draft";
import { runEtaIlSession } from "@/lib/crm/eta-il-session";
import { openaiApiKey } from "@/lib/crm/ingest-types";
import { createServiceClient } from "@/lib/supabase/admin";
import { confirmAllowed, visibilityOnRequest, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function corridor(value: unknown): VisaCorridor | null {
  return value === "IL" || value === "US" || value === "GB" ? value : null;
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    country?: string;
    answers?: Partial<EstaAnswers>;
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
  const [{ data: items }, { data: travelers }, { data: documents }, { data: existing }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_travel_documents").select("*").eq("customer_id", auth.customer.id),
    auth.supabase.from("crm_visa_requests").select("country, step").eq("booking_id", b.id).eq("country", country).maybeSingle(),
  ]);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);

  const current = existing as { step?: ClientVisaStep } | null;
  if (current?.step) return NextResponse.json({ country, step: current.step });

  const french = ((documents || []) as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]).filter(
    (row) => row.doc_type === "passport" && row.issuing_country === "FR" && row.number
  ).length;
  const block = confirmAllowed({
    already: [],
    country,
    frenchPassports: french,
    esta: body.answers,
  });
  if (block) return jsonError(block);

  const service = createServiceClient();
  const opened = visibilityOnRequest({
    visible: b.visible_to_client,
    prices: b.prices_visible !== false && b.visible_to_client,
  });
  await service
    .from("crm_bookings")
    .update({ visible_to_client: opened.visible, prices_visible: opened.prices })
    .eq("id", b.id);
  let step: ClientVisaStep = country === "IL" ? "remplissage" : "validation";
  if (country === "IL") {
    const draft = buildEtaIlDraft({
      items: list,
      travelers: (travelers || []) as CrmBookingTraveler[],
      documents: (documents || []) as CrmTravelDocument[],
      holder: auth.customer as Pick<CrmCustomer, "first_name" | "last_name" | "usage_name">,
      startDate: b.start_date,
      endDate: b.end_date,
    });
    if (draft.phase !== "prêt") step = "preparation";
    const apiKey = openaiApiKey();
    const portal = step === "remplissage" && apiKey ? await openEtaIlPortal() : null;
    if (portal) {
      try {
        const session = await runEtaIlSession({ apiKey, draft, page: portal });
        step = session.phase === "à confirmer" ? "validation" : "remplissage";
      } finally {
        await portal.close();
      }
    }
  }
  await service.from("crm_visa_requests").upsert(
    {
      booking_id: b.id,
      country,
      status: "en_cours",
      step,
      answers: body.answers || {},
    },
    { onConflict: "booking_id,country" }
  );
  return NextResponse.json({ country, step });
}
