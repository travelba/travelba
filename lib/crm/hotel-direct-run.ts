import "server-only";

import { createStaffBooking } from "@/lib/crm/booking-create";
import { hotelDirectLive, type HotelAccessCustomer } from "@/lib/crm/hotel-access";
import {
  applyStay,
  cancelOffer,
  clientStayLabel,
  directCardCeilingCents,
  idempotencyKeyFor,
  openStay,
  type DirectEffect,
  type DirectStay,
  type StayEvent,
} from "@/lib/crm/hotel-direct";
import { clientConfirmationDraft, hotelRequestLetter, outboundHotelRecipient, HOTEL_DIRECT_FROM } from "@/lib/crm/hotel-direct-mail";
import { portForBooking, type BookQuote } from "@/lib/crm/hotel-supplier";
import { formatDateFr } from "@/lib/crm/dates";
import { bookingCardValidity, manualStayCardBody } from "@/lib/crm/manual-stay-card";
import { centsToAmount, formatMoney } from "@/lib/crm/money";
import { issuePliantCard, lockPliantCard, pliantConfigured, readPliantCardholderName } from "@/lib/crm/pliant";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceClient>;

export type ClientStayView = {
  id: string;
  label: string;
  hotelName: string;
  city: string;
  dates: string;
  room: string;
  amount: string;
  confirmation: string | null;
  cancel: "cancel" | "ask" | "none";
  conditions: string;
  reason: string;
};

type Offer = {
  id: string;
  customer_id: string;
  hotel_name: string;
  city: string;
  room_label: string | null;
  rate_title: string | null;
  cancellation_policy: string | null;
  check_in: string;
  check_out: string;
  sell_cents: number;
  currency: string;
  benefits: unknown;
  account: string;
  expires_at: string;
  free_cancellation: boolean;
};

function db() {
  return createServiceClient();
}

function benefitsOf(value: unknown) {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === "string").slice(0, 12) : [];
}

function deadlineOf(policy: string | null, free: boolean) {
  if (!free) return null;
  return policy?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

async function hotelEmail(admin: Admin, hotelName: string) {
  const { data } = await admin
    .from("crm_hotel_contacts")
    .select("email, contact_type")
    .ilike("hotel_name", hotelName)
    .limit(30);
  const rows = (data || []) as { email: string | null; contact_type: string | null }[];
  const reservation = rows.find((row) => /reserv/i.test(row.contact_type || "") && row.email?.includes("@"));
  const any = rows.find((row) => row.email?.includes("@"));
  return (reservation || any)?.email?.trim().toLowerCase() || null;
}

async function sendMail(input: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || HOTEL_DIRECT_FROM;
  const { Resend } = await import("resend");
  const result = await new Resend(key).emails.send({ from, to: input.to, subject: input.subject, text: input.text });
  return !result.error;
}

function parisToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function issueStayCard(input: {
  stay: DirectStay;
  offer: Offer;
  live: boolean;
  reference: string;
  firstName: string;
  lastName: string;
}) {
  const ceiling = directCardCeilingCents(input.stay.hotelCents);
  if (!input.live) return "Carte d’essai, aucun numéro";
  if (!pliantConfigured() || input.stay.currency !== "EUR" || ceiling == null) return "Plafond préparé, émission en attente";
  const holderId = process.env.PLIANT_CARDHOLDER_ID || "";
  const holder = await readPliantCardholderName(holderId);
  if (!holder) return "Porteur introuvable, carte non émise";
  const window = bookingCardValidity(parisToday(), input.offer.check_out);
  const client = [input.firstName, input.lastName].filter(Boolean).join(" ") || "Client";
  try {
    const issued = await issuePliantCard(
      holderId,
      manualStayCardBody({
        firstName: holder.firstName,
        lastName: holder.lastName,
        limitCents: ceiling,
        validFrom: window.validFrom,
        validTo: window.validTo,
        organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
        client,
        place: input.offer.hotel_name,
        hotels: [input.offer.hotel_name],
        reference: input.reference,
        transactionLimitCents: ceiling,
        currency: "EUR",
      })
    );
    input.stay.pliantCardId = issued.cardId;
    return issued.cardId ? "Carte émise" : "Émission non aboutie";
  } catch {
    return "Émission non aboutie";
  }
}

async function captureStay(input: { admin: Admin; stayId: string; stay: DirectStay; offer: Offer; live: boolean; bookingId: string | null }) {
  if (!input.live || !input.stay.stripeIntent) return;
  const stripe = getStripe();
  if (!stripe) return;
  await stripe.paymentIntents.capture(input.stay.stripeIntent).catch(() => null);
  const amount = centsToAmount(input.stay.sellCents);
  await input.admin.from("crm_transactions").insert({
    customer_id: input.offer.customer_id,
    booking_id: input.bookingId,
    direction: "debit",
    kind: "booking",
    amount,
    currency: input.stay.currency,
    label: input.offer.hotel_name,
    source: "manual",
    external_id: `direct-hotel:${input.stayId}`,
    status: "posted",
  });
  await input.admin.from("crm_transactions").insert({
    customer_id: input.offer.customer_id,
    booking_id: input.bookingId,
    direction: "credit",
    kind: "payment",
    amount,
    currency: input.stay.currency,
    label: input.offer.hotel_name,
    source: "stripe",
    external_id: input.stay.stripeIntent,
    status: "posted",
  });
}

function viewOf(id: string, stay: DirectStay, offer: { hotel_name: string; city: string; room_label: string | null; check_in: string; check_out: string }, today: string): ClientStayView {
  const offerCancel = cancelOffer(stay, today);
  return {
    id,
    label: clientStayLabel(stay),
    hotelName: offer.hotel_name,
    city: offer.city,
    dates: `${formatDateFr(offer.check_in)} – ${formatDateFr(offer.check_out)}`,
    room: offer.room_label || "",
    amount: formatMoney(centsToAmount(stay.sellCents), stay.currency),
    confirmation: stay.confirmation,
    cancel: offerCancel.mode,
    conditions: offerCancel.conditions,
    reason: stay.reason,
  };
}

async function remember(admin: Admin, stayId: string, actor: string, action: string, detail: string, key: string | null) {
  await admin.from("crm_hotel_direct_events").insert({
    stay_id: stayId,
    actor,
    action,
    detail: detail.slice(0, 500),
    idempotency_key: key,
  });
}

async function runEffects(input: {
  admin: Admin;
  stayId: string;
  stay: DirectStay;
  effects: DirectEffect[];
  offer: Offer;
  reference: string;
  live: boolean;
  email: string | null;
  firstName: string;
  lastName: string;
  bookingId: string | null;
}) {
  for (const effect of input.effects) {
    if (effect.type === "mail") {
      const routed = outboundHotelRecipient({
        live: input.live,
        hotelEmail: input.email,
        testInbox: process.env.HOTEL_DIRECT_TEST_TO || null,
      });
      const letter = hotelRequestLetter({
        guestNames: input.stay.guests,
        hotelName: input.offer.hotel_name,
        city: input.offer.city,
        checkIn: input.offer.check_in,
        checkOut: input.offer.check_out,
        room: input.offer.room_label || "",
        rate: input.offer.rate_title || "",
        benefits: benefitsOf(input.offer.benefits),
        arrival: input.stay.arrival,
        sellLabel: formatMoney(centsToAmount(input.stay.sellCents), input.stay.currency),
        reference: input.reference,
        partnerRate: input.stay.partnerRate,
        kind: effect.kind,
      });
      if (!routed.to) {
        await remember(input.admin, input.stayId, "system", "e-mail", "Aucun envoi", effect.key);
        continue;
      }
      const sent = await sendMail({ to: routed.to, subject: letter.subject, text: letter.text }).catch(() => false);
      if (!sent) input.stay.keys = input.stay.keys.filter((key) => key !== effect.key);
      await remember(
        input.admin,
        input.stayId,
        "system",
        "e-mail",
        sent ? (routed.redirected ? "Envoyé vers l’adresse d’essai" : "Envoyé à l’hôtel") : "Envoi non abouti",
        sent ? effect.key : null
      );
    } else if (effect.type === "card") {
      const issued = await issueStayCard(input);
      await remember(input.admin, input.stayId, "system", "carte", issued, effect.key);
    } else if (effect.type === "lock_card") {
      if (input.live && input.stay.pliantCardId) await lockPliantCard(input.stay.pliantCardId).catch(() => false);
      await remember(input.admin, input.stayId, "system", "carte", "Gelée", effect.key);
    } else if (effect.type === "capture") {
      await captureStay(input);
      await remember(input.admin, input.stayId, "system", "encaissement", input.live ? "Capturé" : "Essai, aucun encaissement", effect.key);
    } else if (effect.type === "release") {
      if (input.live && input.stay.stripeIntent) {
        const stripe = getStripe();
        if (stripe) await stripe.paymentIntents.cancel(input.stay.stripeIntent).catch(() => null);
      }
      await remember(input.admin, input.stayId, "system", "autorisation", "Libérée", effect.key);
    } else if (effect.type === "debit") {
      if (!input.live) {
        await remember(input.admin, input.stayId, "system", "débit", "Essai, aucun débit", effect.key);
        continue;
      }
      await input.admin.from("crm_transactions").insert({
        customer_id: input.offer.customer_id,
        booking_id: input.bookingId,
        direction: "debit",
        kind: "booking",
        amount: centsToAmount(input.stay.sellCents),
        currency: input.stay.currency,
        label: input.offer.hotel_name,
        source: "manual",
        external_id: `direct-hotel:${input.stayId}`,
        status: "posted",
      });
      await remember(input.admin, input.stayId, "system", "débit", "Ajouté aux transactions", effect.key);
    } else if (effect.type === "void_debit") {
      await input.admin
        .from("crm_transactions")
        .update({ status: "void" })
        .eq("external_id", `direct-hotel:${input.stayId}`)
        .eq("source", "manual");
      await remember(input.admin, input.stayId, "system", "débit", "Annulé", effect.key);
    } else if (effect.type === "refund_client") {
      if (input.stay.payMethod === "card" && input.stay.stripeIntent && input.live) {
        const stripe = getStripe();
        if (stripe) await stripe.refunds.create({ payment_intent: input.stay.stripeIntent }).catch(() => null);
        await input.admin.from("crm_transactions").update({ status: "void" }).eq("external_id", input.stay.stripeIntent).eq("source", "stripe");
        await input.admin.from("crm_transactions").update({ status: "void" }).eq("external_id", `direct-hotel:${input.stayId}`).eq("source", "manual");
      } else if (input.stay.payMethod === "agency" && input.live) {
        await input.admin.from("crm_transactions").insert({
          customer_id: input.offer.customer_id,
          booking_id: input.bookingId,
          direction: "credit",
          kind: "refund",
          amount: centsToAmount(effect.amountCents),
          currency: input.stay.currency,
          label: `Remboursement · ${input.offer.hotel_name}`,
          source: "manual",
          external_id: `direct-hotel:${input.stayId}:refund`,
          status: "posted",
        });
      }
      await remember(input.admin, input.stayId, "system", "remboursement", "Client", effect.key);
    } else if (effect.type === "draft") {
      const draft = clientConfirmationDraft({
        firstName: input.firstName,
        hotel: input.offer.hotel_name,
        confirmation: input.stay.confirmation || "",
        dates: `${formatDateFr(input.offer.check_in)} – ${formatDateFr(input.offer.check_out)}`,
      });
      await remember(input.admin, input.stayId, "system", "message", "Prêt à valider, non envoyé", effect.key);
      input.stay.draft = draft;
    } else if (effect.type === "task") {
      await remember(input.admin, input.stayId, "system", "tâche", effect.label, effect.key);
    }
  }
}

export async function openDirectStay(input: {
  customer: HotelAccessCustomer & { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; stripe_customer_id?: string | null };
  offerId: string;
  guests: string[];
  arrival?: string | null;
  payMethod: "card" | "agency";
  stripeIntent?: string | null;
}) {
  const admin = db();
  const { data: offerRow, error } = await admin
    .from("crm_hotel_search_offers")
    .select(
      "id, customer_id, hotel_name, city, room_label, rate_title, cancellation_policy, check_in, check_out, sell_cents, currency, benefits, account, expires_at, free_cancellation"
    )
    .eq("id", input.offerId)
    .eq("customer_id", input.customer.id)
    .maybeSingle();
  if (error || !offerRow) return { ok: false as const, message: "Cette offre n’est plus disponible." };
  const offer = offerRow as Offer;
  const now = new Date().toISOString();
  const quote: BookQuote = {
    idempotencyKey: idempotencyKeyFor(input.customer.id, offer.id),
    hotelName: offer.hotel_name,
    checkIn: offer.check_in,
    checkOut: offer.check_out,
    sellCents: offer.sell_cents,
    currency: offer.currency,
    expiresAt: offer.expires_at,
    partnerRate: offer.account === "little_emperors",
  };
  const port = portForBooking({ partnerRate: quote.partnerRate, leEndpoint: false });
  const checked = port.recheck(quote, now);
  if (!checked.ok) return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  const booked = port.book(quote);
  if (booked.status === "unavailable") return { ok: false as const, message: "La réservation directe n’est pas ouverte." };

  const existing = await admin.from("crm_hotel_direct_stays").select("id, state").eq("idempotency_key", quote.idempotencyKey).maybeSingle();
  if (existing.data) {
    const row = existing.data as { id: string; state: DirectStay };
    return { ok: true as const, view: viewOf(row.id, row.state, offer, now.slice(0, 10)) };
  }

  const email = await hotelEmail(admin, offer.hotel_name);
  const live = hotelDirectLive(input.customer);
  if (input.payMethod === "card" && live) {
    const held = await cardHoldMatches(input.customer.id, offer, input.stripeIntent || "");
    if (!held) return { ok: false as const, message: "L’autorisation de la carte n’est pas confirmée." };
  }
  const opened = openStay({
    payMethod: input.payMethod,
    sellCents: offer.sell_cents,
    currency: offer.currency,
    partnerRate: quote.partnerRate,
    freeCancellation: offer.free_cancellation === true,
    cancelDeadline: deadlineOf(offer.cancellation_policy, offer.free_cancellation === true),
    conditions: offer.cancellation_policy || "",
    hotelEmail: email,
    guests: input.guests,
    arrival: input.arrival || null,
    now,
  });
  if (input.payMethod === "card" && live && input.stripeIntent) opened.stay.stripeIntent = input.stripeIntent;
  const { data: inserted, error: insertError } = await admin
    .from("crm_hotel_direct_stays")
    .insert({
      customer_id: input.customer.id,
      offer_id: offer.id,
      idempotency_key: quote.idempotencyKey,
      phase: opened.stay.phase,
      pay_method: input.payMethod,
      supplier: "direct_email",
      trial: !live,
      state: opened.stay,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      const again = await admin.from("crm_hotel_direct_stays").select("id, state").eq("idempotency_key", quote.idempotencyKey).maybeSingle();
      const row = again.data as { id: string; state: DirectStay } | null;
      if (row) return { ok: true as const, view: viewOf(row.id, row.state, offer, now.slice(0, 10)) };
    }
    return { ok: false as const, message: "La demande n’a pas pu être envoyée." };
  }
  const stayId = (inserted as { id: string }).id;
  let reference = `HS-${stayId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  let bookingId: string | null = null;
  try {
    const created = await createStaffBooking(admin, {
      customer_id: input.customer.id,
      title: offer.hotel_name,
      destination: offer.city,
      start_date: offer.check_in,
      end_date: offer.check_out,
      currency: offer.currency,
      status: "draft",
      include_in_ledger: true,
      notes_internal: live ? "Réservation directe hôtel." : "Réservation directe hôtel. Essai : mode réel éteint.",
    });
    reference = created.booking.reference;
    bookingId = created.booking.id;
    const amount = centsToAmount(offer.sell_cents);
    const { data: item } = await admin
      .from("crm_booking_items")
      .insert({
        booking_id: created.booking.id,
        kind: "hotel",
        title: offer.hotel_name,
        start_at: offer.check_in,
        end_at: offer.check_out,
        amount,
        include_in_ledger: false,
        visible_to_client: false,
        details: {
          hotel_name: offer.hotel_name,
          city: offer.city,
          room: offer.room_label,
          guests: input.guests.join(", "),
          direct_stay_id: stayId,
        },
      })
      .select("id")
      .single();
    await admin
      .from("crm_hotel_direct_stays")
      .update({ booking_id: created.booking.id, booking_item_id: (item as { id?: string } | null)?.id || null })
      .eq("id", stayId);
  } catch {
    console.error("[hotels] dossier", "refus");
    await remember(admin, stayId, "system", "tâche", "Dossier non créé", "task:dossier");
  }
  opened.stay.reference = reference;
  opened.stay.hotelName = offer.hotel_name;
  await runEffects({
    admin,
    stayId,
    stay: opened.stay,
    effects: opened.effects,
    offer,
    reference,
    live,
    email,
    firstName: input.customer.first_name || "",
    lastName: input.customer.last_name || "",
    bookingId,
  });
  for (const line of opened.audit) {
    await remember(admin, stayId, "client", line.action, line.detail, null);
  }
  await admin.from("crm_hotel_direct_stays").update({ state: opened.stay, phase: opened.stay.phase }).eq("id", stayId);
  return { ok: true as const, view: viewOf(stayId, opened.stay, offer, now.slice(0, 10)) };
}

export async function actOnDirectStay(input: { customerId: string; stayId: string; event: StayEvent; actor: "client" | "agency" }) {
  const admin = db();
  const { data } = await admin
    .from("crm_hotel_direct_stays")
    .select("id, customer_id, offer_id, booking_id, state, phase")
    .eq("id", input.stayId)
    .eq("customer_id", input.customerId)
    .maybeSingle();
  if (!data) return { ok: false as const, message: "Demande introuvable." };
  const row = data as { id: string; offer_id: string | null; booking_id: string | null; state: DirectStay };
  const now = new Date().toISOString();
  const step = applyStay(row.state, input.event, now);
  if ("error" in step) return { ok: false as const, message: step.error };
  const { data: offerRow } = await admin
    .from("crm_hotel_search_offers")
    .select("id, customer_id, hotel_name, city, room_label, rate_title, cancellation_policy, check_in, check_out, sell_cents, currency, benefits, account, expires_at, free_cancellation")
    .eq("id", row.offer_id || "")
    .maybeSingle();
  const offer = (offerRow as Offer | null) || {
    id: "",
    customer_id: input.customerId,
    hotel_name: "",
    city: "",
    room_label: null,
    rate_title: null,
    cancellation_policy: null,
    check_in: now.slice(0, 10),
    check_out: now.slice(0, 10),
    sell_cents: step.stay.sellCents,
    currency: step.stay.currency,
    benefits: [],
    account: "net",
    expires_at: now,
    free_cancellation: false,
  };
  await admin.from("crm_hotel_direct_stays").update({ state: step.stay, phase: step.stay.phase }).eq("id", row.id);
  const { data: customer } = await admin.from("crm_customers").select("first_name, last_name, hotel_booking_enabled, hotel_demo, hotel_direct_live").eq("id", input.customerId).maybeSingle();
  const person = (customer as (HotelAccessCustomer & { first_name?: string; last_name?: string }) | null) || {};
  const email = offer.hotel_name ? await hotelEmail(admin, offer.hotel_name) : null;
  await runEffects({
    admin,
    stayId: row.id,
    stay: step.stay,
    effects: step.effects,
    offer,
    reference: step.stay.reference || `HS-${row.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    live: hotelDirectLive(person),
    email,
    firstName: person.first_name || "",
    lastName: person.last_name || "",
    bookingId: row.booking_id,
  });
  for (const line of step.audit) await remember(admin, row.id, input.actor, line.action, line.detail, null);
  return { ok: true as const, view: viewOf(row.id, step.stay, offer, now.slice(0, 10)) };
}

async function cardHoldMatches(customerId: string, offer: Offer, intentId: string) {
  if (!intentId || !stripeConfigured()) return false;
  const stripe = getStripe();
  if (!stripe) return false;
  const intent = await stripe.paymentIntents.retrieve(intentId).catch(() => null);
  if (!intent || intent.status !== "requires_capture") return false;
  return (
    intent.amount === offer.sell_cents &&
    intent.currency.toLowerCase() === offer.currency.toLowerCase() &&
    intent.metadata?.purpose === "hotel_direct" &&
    intent.metadata?.crm_customer_id === customerId &&
    intent.metadata?.offer_id === offer.id
  );
}

export async function beginDirectCard(input: {
  customer: HotelAccessCustomer & {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    stripe_customer_id: string | null;
  };
  offerId: string;
}) {
  if (!hotelDirectLive(input.customer)) return { ok: false as const, message: "Le mode réel est éteint." };
  if (!stripeConfigured()) return { ok: false as const, message: "Stripe n’est pas configuré." };
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, message: "Stripe n’est pas configuré." };
  const admin = db();
  const { data } = await admin
    .from("crm_hotel_search_offers")
    .select("id, sell_cents, currency, hotel_name, expires_at")
    .eq("id", input.offerId)
    .eq("customer_id", input.customer.id)
    .maybeSingle();
  const offer = data as { id: string; sell_cents: number; currency: string; hotel_name: string; expires_at: string } | null;
  if (!offer || Date.parse(offer.expires_at) <= Date.now()) return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  try {
    const stripeCustomerId = await ensureStripeCustomer(stripe, admin, input.customer);
    const intent = await stripe.paymentIntents.create(
      {
        amount: offer.sell_cents,
        currency: offer.currency.toLowerCase(),
        customer: stripeCustomerId,
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        description: offer.hotel_name.slice(0, 180),
        metadata: { purpose: "hotel_direct", crm_customer_id: input.customer.id, offer_id: offer.id },
      },
      { idempotencyKey: `direct-auth:${input.customer.id}:${offer.id}` }
    );
    if (!intent.client_secret) return { ok: false as const, message: "L’autorisation n’a pas pu être ouverte." };
    return { ok: true as const, clientSecret: intent.client_secret, intentId: intent.id };
  } catch {
    return { ok: false as const, message: "L’autorisation n’a pas pu être ouverte." };
  }
}

export async function advanceDirectStays() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_hotel_direct_stays")
    .select("id, customer_id")
    .in("phase", ["transmitted", "confirming"])
    .limit(40);
  if (error || !data) return 0;
  let count = 0;
  for (const row of data as { id: string; customer_id: string }[]) {
    const result = await actOnDirectStay({
      customerId: row.customer_id,
      stayId: row.id,
      event: { type: "clock" },
      actor: "agency",
    }).catch(() => null);
    if (result?.ok) count += 1;
  }
  return count;
}
