import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { buildEtaIlDraft, publicEtaIlDraft } from "@/lib/crm/eta-il-draft";
import { etaIlPliantCard, pliantCardName } from "@/lib/crm/eta-il-fee";
import { issuePliantCard, pliantConfigured, raisePliantLimit } from "@/lib/crm/pliant";
import { postVisaCharge } from "@/lib/crm/visa-post";
import { euroRates } from "@/lib/crm/visa-ecb";
import {
  confirmAllowed,
  hasEstaAnswers,
  launchWouldRewind,
  mergeEstaAnswers,
  paymentHold,
  phaseForSavedStep,
  readEstaAnswers,
  stepAfterPrepare,
  visibilityOnRequest,
  type ClientVisaStep,
  type EstaAnswers,
} from "@/lib/crm/visa-flow";
import {
  centsToEur,
  combinedCeilingCents,
  VISA_OFFICIAL,
  type VisaCorridor,
} from "@/lib/crm/visa-fees";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCustomer,
  CrmTravelDocument,
} from "@/lib/crm/types";
import { officialVisaApplyUrl } from "@/lib/crm/visa-fr";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function corridor(value: unknown): VisaCorridor | null {
  return value === "IL" || value === "US" || value === "GB" ? value : null;
}

async function publishTrip(
  supabase: { from: (table: string) => any },
  booking: CrmBooking
) {
  const opened = visibilityOnRequest({
    visible: booking.visible_to_client,
    prices: booking.prices_visible !== false && booking.visible_to_client,
  });
  await supabase
    .from("crm_bookings")
    .update({ visible_to_client: opened.visible, prices_visible: opened.prices })
    .eq("id", booking.id);
  await supabase.from("crm_booking_items").update({ visible_to_client: true }).eq("booking_id", booking.id);
}

async function saveVisaStep(
  supabase: { from: (table: string) => any },
  bookingId: string,
  country: VisaCorridor,
  step: ClientVisaStep,
  answers?: Partial<EstaAnswers>
) {
  const row: Record<string, unknown> = {
    booking_id: bookingId,
    country,
    status: step === "piece" ? "piece" : "en_cours",
    step,
  };
  if (answers && hasEstaAnswers(answers)) row.answers = answers;
  await supabase.from("crm_visa_requests").upsert(row, { onConflict: "booking_id,country" });
}

function resumePayload(country: VisaCorridor, step: ClientVisaStep) {
  const phase = phaseForSavedStep(step);
  const hold = phase === "paiement" ? paymentHold(pliantConfigured()) : null;
  return {
    country,
    phase,
    step,
    portal: officialVisaApplyUrl(country),
    reason: hold,
    hold,
    travelers: [] as [],
  };
}

function frenchPassportCount(documents: Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[] | null) {
  return (documents || []).filter((row) => row.doc_type === "passport" && row.issuing_country === "FR" && row.number)
    .length;
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    country?: string;
    answers?: Partial<EstaAnswers>;
    pliantTransactionId?: string;
    paidCents?: number;
    refusedTravelerIds?: string[];
  };
  const country = corridor(body.country);
  if (!country) return jsonError("Pays non pris en charge.");

  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const b = booking as CrmBooking;

  if (body.action === "run" || body.action === "fill") {
    const { data: prior } = await auth.supabase
      .from("crm_visa_requests")
      .select("step, answers")
      .eq("booking_id", b.id)
      .eq("country", country)
      .maybeSingle();
    const priorRow = prior as { step?: ClientVisaStep; answers?: unknown } | null;
    const priorStep = priorRow?.step || null;
    if (
      priorStep &&
      (priorStep === "paiement" || priorStep === "piece" || (body.action === "run" && launchWouldRewind(priorStep)))
    ) {
      return NextResponse.json(resumePayload(country, priorStep));
    }

    if (body.action === "fill" && country !== "IL") {
      const merged = mergeEstaAnswers(readEstaAnswers(priorRow?.answers), body.answers);
      const { data: documents } = await auth.supabase
        .from("crm_travel_documents")
        .select("doc_type, issuing_country, number")
        .eq("customer_id", b.customer_id);
      const block = confirmAllowed({
        already: [],
        country,
        frenchPassports: frenchPassportCount(documents as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]),
        esta: merged,
        resumable: true,
      });
      if (block) return jsonError(block);
      await publishTrip(auth.supabase, b);
      await saveVisaStep(auth.supabase, b.id, country, stepAfterPrepare(country), merged);
      return NextResponse.json({
        country,
        phase: "à confirmer",
        portal: officialVisaApplyUrl(country),
        reason: "Récapitulatif prêt. Confirmez avant l’envoi.",
        travelers: [],
        step: "validation",
      });
    }

    if (body.action === "fill") return jsonError("Le remplissage ETA-IL passe par le portail.");
  }

  if (body.action === "run" && country === "IL") {
    const [{ data: items }, { data: travelers }, { data: documents }, { data: customer }] = await Promise.all([
      auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
      auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      auth.supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
      auth.supabase.from("crm_customers").select("first_name, last_name, usage_name").eq("id", b.customer_id).maybeSingle(),
    ]);
    const draft = buildEtaIlDraft({
      items: (items || []) as CrmBookingItem[],
      travelers: (travelers || []) as CrmBookingTraveler[],
      documents: (documents || []) as CrmTravelDocument[],
      holder: customer as Pick<CrmCustomer, "first_name" | "last_name" | "usage_name"> | null,
      startDate: b.start_date,
      endDate: b.end_date,
    });
    await publishTrip(auth.supabase, b);
    await saveVisaStep(auth.supabase, b.id, "IL", "preparation");
    return NextResponse.json({ ...publicEtaIlDraft(draft), country, portal: officialVisaApplyUrl("IL"), step: "preparation" });
  }

  if (body.action === "run") {
    await publishTrip(auth.supabase, b);
    await saveVisaStep(auth.supabase, b.id, country, "preparation", body.answers);
    return NextResponse.json({
      country,
      phase: "prêt",
      portal: officialVisaApplyUrl(country),
      reason: "Préparation ouverte. Le séjour est visible, sans les prix.",
      travelers: [],
      step: "preparation",
    });
  }

  if (body.action === "charge") {
    const tx = (body.pliantTransactionId || "").trim();
    const paid = Math.floor(Number(body.paidCents) || 0);
    if (!tx || paid <= 0) return jsonError("Paiement Pliant incomplet.");
    const { data: travelers } = await auth.supabase
      .from("crm_booking_travelers")
      .select("id")
      .eq("booking_id", b.id);
    const ids = ((travelers || []) as { id: string }[]).map((row) => row.id);
    const posted = await postVisaCharge(auth.supabase, b, {
      country,
      pliantTransactionId: tx,
      paidCents: paid,
      travelerIds: ids.length ? ids : ["titulaire"],
      refusedTravelerIds: body.refusedTravelerIds || [],
    });
    await auth.supabase
      .from("crm_visa_requests")
      .update({ status: "paye", pliant_transaction_id: tx, paid_cents: paid })
      .eq("booking_id", b.id)
      .eq("country", country);
    return NextResponse.json({
      posted,
      label: VISA_OFFICIAL[country].taxLabel,
      amountEur: centsToEur(paid),
    });
  }

  const [{ data: existing }, { data: travelers }, { data: documents }, { data: customer }, { data: card }] =
    await Promise.all([
      auth.supabase.from("crm_visa_requests").select("country, step, answers").eq("booking_id", b.id),
      auth.supabase.from("crm_booking_travelers").select("id").eq("booking_id", b.id),
      auth.supabase
        .from("crm_travel_documents")
        .select("doc_type, issuing_country, number")
        .eq("customer_id", b.customer_id),
      auth.supabase.from("crm_customers").select("first_name, last_name").eq("id", b.customer_id).maybeSingle(),
      auth.supabase.from("crm_visa_cards").select("pliant_card_id, ceiling_cents, countries").eq("booking_id", b.id).maybeSingle(),
    ]);
  const rows = (existing || []) as { country: VisaCorridor; step?: ClientVisaStep; answers?: unknown }[];
  const already = rows.map((row) => row.country);
  const current = rows.find((row) => row.country === country);
  const french = frenchPassportCount(documents as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]);
  const party = (travelers || []) as Pick<CrmBookingTraveler, "id">[];
  const esta = mergeEstaAnswers(readEstaAnswers(current?.answers), body.answers);
  const block = confirmAllowed({
    already,
    country,
    frenchPassports: french,
    esta,
    resumable: current?.step === "preparation" || current?.step === "remplissage" || current?.step === "validation",
  });
  if (block) return jsonError(block);

  const fx = await euroRates();
  const countries = already.includes(country) ? already : [...already, country];
  const count = Math.max(1, party.length);
  const cents = combinedCeilingCents(countries, count, fx.rates);
  if (cents == null) return jsonError("Cours indisponible.");

  const holder = customer as Pick<CrmCustomer, "first_name" | "last_name"> | null;
  const spec = etaIlPliantCard({
    firstName: holder?.first_name || "Client",
    lastName: holder?.last_name || "Travelba",
    travelerCount: count,
    bookingReference: b.reference,
    rates: fx.rates,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    startDate: b.start_date,
    endDate: b.end_date,
  });
  const limit = { value: cents, currency: "EUR" as const };
  spec.body.limit = limit;
  spec.body.transactionLimit = limit;
  spec.body.maxTransactionCount = Math.max(count, countries.length * count);
  spec.body.label = `Visa ${pliantCardName(holder?.last_name || b.reference)}`.slice(0, 40);

  let cardId = (card as { pliant_card_id?: string } | null)?.pliant_card_id || null;
  if (pliantConfigured()) {
    if (cardId) {
      await raisePliantLimit(cardId, limit, spec.body.maxTransactionCount);
    } else {
      const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", spec.body);
      cardId = issued.cardId;
    }
    if (cardId) {
      await auth.supabase.from("crm_visa_cards").upsert({
        booking_id: b.id,
        pliant_card_id: cardId,
        ceiling_cents: cents,
        countries,
      });
    }
  }

  await publishTrip(auth.supabase, b);
  await saveVisaStep(auth.supabase, b.id, country, "paiement", esta);

  const pliant = pliantConfigured();
  return NextResponse.json({
    country,
    phase: pliant ? "paiement" : "paiement",
    ceilingEur: centsToEur(cents),
    fee: `${VISA_OFFICIAL[country].amount} ${VISA_OFFICIAL[country].currency}`,
    rateDate: fx.date,
    liveRate: fx.live,
    cardId,
    pliant,
    hold: paymentHold(pliant),
  });
}
