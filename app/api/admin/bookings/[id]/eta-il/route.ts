import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { buildEtaIlDraft, publicEtaIlDraft, tripGoesToIsrael } from "@/lib/crm/eta-il-draft";
import { readPortalEvents } from "@/lib/crm/eta-il-log-store";
import { portalMonitorNote, portalRunLive } from "@/lib/crm/eta-il-log";
import { executeEtaIlFill } from "@/lib/crm/eta-il-run";
import { pliantConfigured } from "@/lib/crm/pliant";
import { ensureIlPliantCard } from "@/lib/crm/visa-card";
import { euroRates } from "@/lib/crm/visa-ecb";
import { openaiApiKey } from "@/lib/crm/ingest-types";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCustomer,
  CrmTravelDocument,
} from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const [{ data: row }, events] = await Promise.all([
    auth.supabase.from("crm_visa_requests").select("step").eq("booking_id", id).eq("country", "IL").maybeSingle(),
    readPortalEvents(auth.supabase, id),
  ]);
  const step = (row as { step?: string } | null)?.step ?? null;
  return NextResponse.json({
    step,
    events,
    live: portalRunLive(step, events),
    note: portalMonitorNote(step, events),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "fill" || body.action === "card" ? body.action : "prepare";

  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const b = booking as CrmBooking;
  const [{ data: items }, { data: travelers }, { data: documents }, { data: customer }, { data: visa }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    auth.supabase.from("crm_customers").select("first_name, last_name, usage_name").eq("id", b.customer_id).maybeSingle(),
    auth.supabase.from("crm_visa_requests").select("accepted_at, traveler_ids").eq("booking_id", b.id).eq("country", "IL").maybeSingle(),
  ]);
  const holder = customer as Pick<CrmCustomer, "first_name" | "last_name" | "usage_name"> | null;
  const requestRow = visa as { accepted_at?: string | null; traveler_ids?: string[] | null } | null;
  const draft = buildEtaIlDraft({
    items: (items || []) as CrmBookingItem[],
    travelers: (travelers || []) as CrmBookingTraveler[],
    documents: (documents || []) as CrmTravelDocument[],
    holder,
    startDate: b.start_date,
    endDate: b.end_date,
    travelerIds: requestRow?.traveler_ids || [],
  });
  if (action === "card") {
    if (!tripGoesToIsrael((items || []) as CrmBookingItem[])) {
      return jsonError("Ce dossier n’a pas de vol vers Israël.");
    }
    if (!pliantConfigured()) return jsonError("Pliant n’est pas configuré.");
    const party = (travelers || []) as CrmBookingTraveler[];
    const fx = await euroRates();
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { pliantLimitIsManual, rememberPliantCard } = await import("@/lib/crm/pliant-card-run");
    const service = createServiceClient();
    const { data: visaCard } = await auth.supabase
      .from("crm_visa_cards")
      .select("pliant_card_id")
      .eq("booking_id", b.id)
      .maybeSingle();
    const existingId = (visaCard as { pliant_card_id?: string } | null)?.pliant_card_id || "";
    const manual = existingId ? await pliantLimitIsManual(service, existingId) : false;
    const card = await ensureIlPliantCard({
      db: auth.supabase,
      bookingId: b.id,
      customerId: b.customer_id,
      firstName: holder?.first_name || party[0]?.first_name || "Client",
      lastName: holder?.last_name || party[0]?.last_name || "Travelba",
      travelerCount: Math.max(1, draft.applicants.length || party.length),
      bookingReference: b.reference,
      startDate: b.start_date,
      endDate: b.end_date,
      rates: fx.rates,
      preserveLimit: manual,
    });
    if (!card.issued) return jsonError(card.journal);
    if (card.cardId) {
      await rememberPliantCard(service, {
        pliant_card_id: card.cardId,
        booking_id: b.id,
        customer_id: b.billing_customer_id || b.customer_id,
        label: card.label,
        ...(manual ? {} : { limit_cents: Math.round(card.ceilingEur * 100), currency: "EUR" }),
      });
    }
    return NextResponse.json({
      holderName: card.label,
      feeIls: card.feeIls,
      ceilingEur: card.ceilingEur,
      label: card.label,
      cardId: card.cardId,
      status: "issued",
    });
  }

  if (action === "prepare" || draft.phase !== "prêt") {
    return NextResponse.json(publicEtaIlDraft(draft));
  }

  if (!requestRow?.accepted_at) {
    return jsonError("Confirmez la demande avant de lancer le parcours.");
  }

  const session = await executeEtaIlFill({
    db: auth.supabase,
    bookingId: b.id,
    apiKey: openaiApiKey(),
    draft,
    fromSteps: ["preparation", "remplissage"],
  });
  return NextResponse.json({
    ...publicEtaIlDraft(draft),
    phase: session.phase,
    reason: session.message,
    summary: session.summary,
    ceilingEur: session.ceilingEur,
    fee: session.fee,
  });
}
