import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { etaIlPliantCard, pliantCardName } from "@/lib/crm/eta-il-fee";
import { issuePliantCard, pliantConfigured, raisePliantLimit } from "@/lib/crm/pliant";
import { postVisaCharge } from "@/lib/crm/visa-post";
import { euroRates } from "@/lib/crm/visa-ecb";
import { confirmAllowed, visibilityOnRequest, type EstaAnswers } from "@/lib/crm/visa-flow";
import {
  centsToEur,
  combinedCeilingCents,
  VISA_OFFICIAL,
  type VisaCorridor,
} from "@/lib/crm/visa-fees";
import type { CrmBooking, CrmBookingTraveler, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function corridor(value: unknown): VisaCorridor | null {
  return value === "IL" || value === "US" || value === "GB" ? value : null;
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
      auth.supabase.from("crm_visa_requests").select("country").eq("booking_id", b.id),
      auth.supabase.from("crm_booking_travelers").select("id").eq("booking_id", b.id),
      auth.supabase
        .from("crm_travel_documents")
        .select("doc_type, issuing_country, number")
        .eq("customer_id", b.customer_id),
      auth.supabase.from("crm_customers").select("first_name, last_name").eq("id", b.customer_id).maybeSingle(),
      auth.supabase.from("crm_visa_cards").select("pliant_card_id, ceiling_cents, countries").eq("booking_id", b.id).maybeSingle(),
    ]);
  const already = ((existing || []) as { country: VisaCorridor }[]).map((row) => row.country);
  const french = ((documents || []) as Pick<CrmTravelDocument, "doc_type" | "issuing_country" | "number">[]).filter(
    (row) => row.doc_type === "passport" && row.issuing_country === "FR" && row.number
  ).length;
  const party = (travelers || []) as Pick<CrmBookingTraveler, "id">[];
  const block = confirmAllowed({
    already,
    country,
    frenchPassports: french,
    esta: body.answers,
  });
  if (block) return jsonError(block);

  const fx = await euroRates();
  const countries = [...already, country];
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

  const opened = visibilityOnRequest({
    visible: b.visible_to_client,
    prices: b.prices_visible !== false && b.visible_to_client,
  });
  await auth.supabase
    .from("crm_bookings")
    .update({ visible_to_client: opened.visible, prices_visible: opened.prices })
    .eq("id", b.id);
  await auth.supabase.from("crm_booking_items").update({ visible_to_client: true }).eq("booking_id", b.id);
  await auth.supabase.from("crm_visa_requests").insert({
    booking_id: b.id,
    country,
    status: "en_cours",
    answers: body.answers || {},
  });

  return NextResponse.json({
    country,
    ceilingEur: centsToEur(cents),
    fee: `${VISA_OFFICIAL[country].amount} ${VISA_OFFICIAL[country].currency}`,
    rateDate: fx.date,
    liveRate: fx.live,
    cardId,
    pliant: pliantConfigured(),
  });
}
