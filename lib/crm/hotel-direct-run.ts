import "server-only";

import { createStaffBooking } from "@/lib/crm/booking-create";
import { setCarnetPublished, syncBookingLedger, syncBookingTotalFromItems } from "@/lib/crm/bookings";
import type { CrmBooking } from "@/lib/crm/types";
import { notifyStayPublished, remindMissingPieces, safeConcierge } from "@/lib/crm/concierge-send";
import { hotelDirectLive, hotelLeApiBooking, type HotelAccessCustomer } from "@/lib/crm/hotel-access";
import {
  applyStay,
  cancelOffer,
  clientStayLabel,
  directCardCeilingCents,
  failLeBooking,
  idempotencyKeyFor,
  openLeConfirmed,
  openStay,
  type DirectEffect,
  type DirectStay,
  type StayEvent,
} from "@/lib/crm/hotel-direct";
import { clientConfirmationDraft, hotelRequestLetter, outboundHotelRecipient, HOTEL_DIRECT_FROM } from "@/lib/crm/hotel-direct-mail";
import { clientBenefits, leRoomPartyOk, roomsFromStored, type HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import {
  adoptLeBooking,
  claimLeBooking,
  clientCancellationSentence,
  clientPaymentTerms,
  leCardWidgetUrl,
  leDeadlineParisLabel,
  lePrimaryGuest,
  PARTY_MISMATCH,
  partyChanged,
  partyWithCompanions,
  pricesDiffer,
} from "@/lib/crm/le-self-book";
import { refreshLeOfferQuote, submitLeBooking, type LeFreshQuote } from "@/lib/crm/le-direct-book";
import { assignLeIncluded, leRoomLabels } from "@/lib/crm/le-included";
import {
  cancelLittleEmperorsBooking,
  listLittleEmperorsBookings,
  littleEmperorsConfigured,
  littleEmperorsOrigin,
  type LeBooking,
} from "@/lib/crm/little-emperors";
import { portForBooking, type BookQuote } from "@/lib/crm/hotel-supplier";
import { formatDateFr } from "@/lib/crm/dates";
import { bookingCardValidity, manualStayCardBody } from "@/lib/crm/manual-stay-card";
import { centsToAmount, formatMoney } from "@/lib/crm/money";
import { issuePliantCard, lockPliantCard, pliantConfigured, readPliantCardholderName, readPliantCardSecrets } from "@/lib/crm/pliant";
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
  dossier: string | null;
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
  rooms?: unknown;
  adults?: number;
  le_hotel_id?: number | null;
  le_session_id?: string | null;
  le_rate_index?: string | null;
  cancellation_deadline?: string | null;
  requires_cvc?: boolean | null;
  payment_description?: string | null;
  rate_key?: string | null;
  room_key?: string | null;
};

const OFFER_COLUMNS =
  "id, customer_id, hotel_name, city, room_label, rate_title, cancellation_policy, check_in, check_out, sell_cents, currency, benefits, account, expires_at, free_cancellation, rooms, adults, le_hotel_id, le_session_id, le_rate_index, cancellation_deadline, requires_cvc, payment_description, rate_key, room_key";

function db() {
  return createServiceClient();
}

function benefitsOf(value: unknown) {
  const raw = Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];
  return clientBenefits(raw).slice(0, 12);
}

function cardDetails(
  offer: { hotel_name: string; city: string; room_label: string | null; benefits: unknown; account: string },
  guests: string,
  extra: Record<string, unknown> = {}
) {
  const details: Record<string, unknown> = {
    hotel_name: offer.hotel_name,
    city: offer.city,
    room: offer.room_label,
    guests,
    ...extra,
  };
  if (offer.account === "little_emperors") details.source_family = "little_emperors";
  const raw = Array.isArray(offer.benefits) ? offer.benefits.filter((line): line is string => typeof line === "string") : [];
  assignLeIncluded(details, raw, leRoomLabels({ room: offer.room_label }));
  return details;
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

function readStay(value: DirectStay): DirectStay {
  return {
    ...value,
    leBookingId: typeof value.leBookingId === "number" ? value.leBookingId : null,
    supplier: value.supplier === "api" ? "api" : "email",
    placingAt: typeof value.placingAt === "string" ? value.placingAt : null,
  };
}

function clientConditions(stay: DirectStay) {
  return clientCancellationSentence({
    deadline: stay.cancelDeadline,
    policy: stay.conditions,
    free: stay.freeCancellation,
  });
}

function priceChangedMessage(cents: number, currency: string) {
  return `Le tarif a changé : ${formatMoney(centsToAmount(cents), currency)}. Confirmez pour continuer.`;
}

function termsFor(quote: LeFreshQuote) {
  return clientPaymentTerms({
    paymentDescription: quote.paymentDescription,
    requiresCvc: quote.requiresCvc,
    deadlineLabel: leDeadlineParisLabel(quote.deadline),
    free: quote.free,
  });
}

async function issueStayCard(input: {
  stay: DirectStay;
  offer: Offer;
  live: boolean;
  reference: string;
  firstName: string;
  lastName: string;
  exact?: boolean;
  holder?: { firstName: string; lastName: string } | null;
}) {
  const ceiling = input.exact ? input.stay.hotelCents : directCardCeilingCents(input.stay.hotelCents);
  if (!input.live) return "Carte d’essai, aucun numéro";
  if (!pliantConfigured() || input.stay.currency !== "EUR" || ceiling == null) return "Plafond préparé, émission en attente";
  const holderId = process.env.PLIANT_CARDHOLDER_ID || "";
  const holder = input.holder || (await readPliantCardholderName(holderId));
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
  if (!input.live) return true;
  if (!input.stay.stripeIntent) return false;
  const stripe = getStripe();
  if (!stripe) return false;
  const intentId = input.stay.stripeIntent;
  const captured = await stripe.paymentIntents.capture(intentId).catch(async () => {
    const current = await stripe.paymentIntents.retrieve(intentId).catch(() => null);
    return current && current.status === "succeeded" ? current : null;
  });
  if (!captured || (captured.status !== "succeeded" && captured.status !== "processing")) return false;
  const { data: prior } = await input.admin.from("crm_transactions").select("id").eq("external_id", intentId).eq("source", "stripe").maybeSingle();
  if (prior) return true;
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
  return true;
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
    conditions: clientConditions(stay),
    reason: stay.reason,
    dossier: null,
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
  clientEmail?: string | null;
  sendMail?: (input: { to: string; subject: string; text: string }) => Promise<boolean>;
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
      if (input.live && input.stay.pliantCardId) {
        await lockPliantCard(input.stay.pliantCardId).catch(() => false);
        await input.admin.from("crm_booking_cards").update({ status: "locked" }).eq("pliant_card_id", input.stay.pliantCardId);
      }
      await remember(input.admin, input.stayId, "system", "carte", "Gelée", effect.key);
    } else if (effect.type === "capture") {
      const captured = await captureStay(input);
      if (!captured) {
        input.stay.stripe = "authorized";
        input.stay.keys = input.stay.keys.filter((key) => key !== effect.key);
      }
      await remember(input.admin, input.stayId, "system", "encaissement", captured ? "Capturé" : "Encaissement non abouti", captured ? effect.key : null);
    } else if (effect.type === "release") {
      if (input.live && input.stay.stripeIntent) {
        const stripe = getStripe();
        if (stripe) await stripe.paymentIntents.cancel(input.stay.stripeIntent).catch(() => null);
      }
      await remember(input.admin, input.stayId, "system", "autorisation", "Libérée", effect.key);
    } else if (effect.type === "debit") {
      if (input.bookingId) {
        await remember(input.admin, input.stayId, "system", "débit", "Porté par le dossier", effect.key);
        continue;
      }
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
        if (stripe) {
          await stripe.refunds
            .create({ payment_intent: input.stay.stripeIntent }, { idempotencyKey: `direct-refund:${input.stayId}` })
            .catch(() => null);
        }
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
        amount: formatMoney(centsToAmount(input.stay.sellCents), input.stay.currency),
      });
      input.stay.draft = draft;
      const subject = `Votre séjour à ${input.offer.hotel_name} est confirmé`.slice(0, 180);
      if (input.live && input.clientEmail) {
        const sent = await (input.sendMail || sendMail)({ to: input.clientEmail, subject, text: draft }).catch(() => false);
        if (!sent) input.stay.keys = input.stay.keys.filter((key) => key !== effect.key);
        await remember(input.admin, input.stayId, "system", "message", sent ? "Envoyé au client" : "Envoi non abouti", sent ? effect.key : null);
      } else {
        await remember(input.admin, input.stayId, "system", "message", "Prêt à valider, non envoyé", effect.key);
      }
    } else if (effect.type === "task") {
      await remember(input.admin, input.stayId, "system", "tâche", effect.label, effect.key);
    }
  }
}

const NOT_CHARGED = "La réservation n’a pas abouti. Aucun montant n’a été encaissé.";

type StayCustomer = HotelAccessCustomer & {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

async function saveStay(admin: Admin, stayId: string, stay: DirectStay) {
  await admin
    .from("crm_hotel_direct_stays")
    .update({
      state: stay,
      phase: stay.phase === "transmitted" && stay.supplier === "api" && !stay.confirmation ? "placing" : stay.phase,
      le_booking_id: stay.leBookingId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stayId);
}

async function storeFreshQuote(admin: Admin, offerId: string, fresh: LeFreshQuote, rooms?: HotelRoomOccupancy[]) {
  await admin
    .from("crm_hotel_search_offers")
    .update({
      sell_cents: fresh.sellCents,
      currency: fresh.currency,
      le_session_id: fresh.sessionId.slice(0, 120),
      le_rate_index: fresh.rateIndex.slice(0, 200),
      cancellation_deadline: fresh.deadline,
      requires_cvc: fresh.requiresCvc,
      payment_description: fresh.paymentDescription ? fresh.paymentDescription.slice(0, 500) : null,
      cancellation_policy: fresh.cancellation || null,
      free_cancellation: fresh.free,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      ...(rooms ? { rooms, adults: rooms.reduce((sum, room) => sum + room.adults, 0) } : {}),
    })
    .eq("id", offerId);
}

async function rollbackLe(input: {
  admin: Admin;
  stayId: string;
  stay: DirectStay;
  offer: Offer;
  bookingId: string | null;
  reason: string;
}) {
  const failed = failLeBooking(input.stay, input.reason);
  await runEffects({
    admin: input.admin,
    stayId: input.stayId,
    stay: failed.stay,
    effects: failed.effects,
    offer: input.offer,
    reference: input.stay.reference || `HS-${input.stayId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    live: true,
    email: null,
    firstName: "",
    lastName: "",
    bookingId: input.bookingId,
    clientEmail: null,
  });
  await input.admin
    .from("crm_hotel_direct_stays")
    .update({ state: failed.stay, phase: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", input.stayId);
}

function cardFromSecrets(secrets: { pan: string; expiry: string; cvc: string }, name: string) {
  const [month, year] = secrets.expiry.split("/");
  const expMonth = Number(month);
  const shortYear = Number(year);
  return {
    pan: secrets.pan,
    cvc: secrets.cvc,
    expMonth,
    expYear: shortYear < 100 ? 2000 + shortYear : shortYear,
    name,
  };
}

async function placeLeStay(input: {
  admin: Admin;
  customer: StayCustomer;
  offer: Offer;
  guests: string[];
  arrival: string | null;
  payMethod: "card" | "agency";
  companions: string[][];
  now: string;
  fetchImpl?: typeof fetch;
  sendMail?: (input: { to: string; subject: string; text: string }) => Promise<boolean>;
  onPhase?: (phase: "hotel" | "stay") => void;
}): Promise<
  | { ok: true; view: ClientStayView }
  | { ok: false; message: string; code?: "price_changed" | "card_again"; sellCents?: number; currency?: string; widgetUrl?: string; terms?: string }
> {
  const storedRooms = roomsFromStored(input.offer.rooms, input.offer.adults || input.guests.length || 2);
  const companions = input.companions.length === storedRooms.length ? input.companions : storedRooms.map((_, index) => input.companions[index] || []);
  if (input.guests.length !== storedRooms.length || input.guests.some((name) => !lePrimaryGuest(name)) || companions.some((room) => room.some((name) => !lePrimaryGuest(name)))) {
    return { ok: false, message: "Indiquez le prénom et le nom de chaque voyageur, une personne par ligne." };
  }
  const principals = input.guests.map((name) => lePrimaryGuest(name) || "");
  const rooms = partyWithCompanions(storedRooms, companions.map((room) => room.length));
  const party = leRoomPartyOk(rooms);
  if (!party.ok) return { ok: false, message: party.message };
  if (rooms.some((room) => room.adults > 6)) return { ok: false, message: "Six adultes au plus par chambre." };
  const guestEmail = (input.customer.email || "").trim();
  if (!guestEmail.includes("@")) return { ok: false, message: "Indiquez un e-mail sur votre fiche." };
  const hotelId = Number(input.offer.le_hotel_id);
  if (!Number.isInteger(hotelId) || hotelId < 1) return { ok: false, message: "Cette offre n’est plus disponible." };

  const key = idempotencyKeyFor(input.customer.id, input.offer.id);
  const { data: existing } = await input.admin
    .from("crm_hotel_direct_stays")
    .select("id, state, phase, booking_id")
    .eq("idempotency_key", key)
    .maybeSingle();
  const row = existing as { id: string; state: DirectStay; phase: string; booking_id: string | null } | null;
  const current = row ? readStay(row.state) : null;
  const { data: inflight } = await input.admin.from("crm_hotel_direct_stays").select("id, state").eq("phase", "placing").limit(8);
  const otherFresh = ((inflight || []) as { id: string; state: DirectStay }[]).some((item) => {
    if (row && item.id === row.id) return false;
    const at = Date.parse(readStay(item.state).placingAt || "");
    return Number.isFinite(at) && Date.now() - at < 120_000;
  });
  const claim = claimLeBooking({
    existing: current
      ? {
          phase: row?.phase || current.phase,
          leBookingId: current.leBookingId,
          placingAtMs: current.placingAt ? Date.parse(current.placingAt) : null,
        }
      : null,
    nowMs: Date.now(),
    otherFresh,
  });
  if (claim.action === "wait") return { ok: false, message: claim.message };
  if ((claim.action === "done" || claim.action === "resume") && row && current) {
    if (claim.action === "done" && !current.leBookingId) {
      return { ok: true, view: viewOf(row.id, current, input.offer, input.now.slice(0, 10)) };
    }
    if (current.leBookingId && !current.confirmation) current.confirmation = String(current.leBookingId);
    if (current.leBookingId && current.confirmation && current.phase === "confirmed" && current.draft && current.draft !== "ready") {
      return { ok: true, view: viewOf(row.id, current, input.offer, input.now.slice(0, 10)) };
    }
    if (current.leBookingId && current.confirmation) {
      const step = openLeConfirmed({
        payMethod: current.payMethod,
        sellCents: current.sellCents,
        currency: current.currency,
        confirmation: current.confirmation,
        leBookingId: current.leBookingId,
        freeCancellation: current.freeCancellation,
        cancelDeadline: current.cancelDeadline,
        conditions: current.conditions,
        guests: current.guests,
        arrival: current.arrival,
        now: input.now,
        pliantCardId: current.pliantCardId,
      });
      step.stay.reference = current.reference;
      step.stay.hotelName = input.offer.hotel_name;
      if (current.keys.includes("debit:agency")) step.effects = step.effects.filter((effect) => effect.type !== "debit");
      if (current.draft && current.draft !== "ready") {
        step.stay.draft = current.draft;
        step.effects = step.effects.filter((effect) => effect.type !== "draft");
      }
      await runEffects({
        admin: input.admin,
        stayId: row.id,
        stay: step.stay,
        effects: step.effects,
        offer: input.offer,
        reference: step.stay.reference,
        live: true,
        email: null,
        firstName: input.customer.first_name || "",
        lastName: input.customer.last_name || "",
        bookingId: row.booking_id,
        clientEmail: guestEmail,
      });
      await input.admin
        .from("crm_hotel_direct_stays")
        .update({ state: step.stay, phase: "confirmed", le_booking_id: current.leBookingId, updated_at: input.now })
        .eq("id", row.id);
      return { ok: true, view: viewOf(row.id, step.stay, input.offer, input.now.slice(0, 10)) };
    }
  }

  let stay = current || {
    ...openStay({
      payMethod: input.payMethod,
      sellCents: input.offer.sell_cents,
      currency: input.offer.currency,
      partnerRate: true,
      freeCancellation: input.offer.free_cancellation === true,
      cancelDeadline: input.offer.cancellation_deadline || deadlineOf(input.offer.cancellation_policy, input.offer.free_cancellation === true),
      conditions: input.offer.cancellation_policy || "",
      hotelEmail: null,
    guests: input.guests.flatMap((name, index) => [name, ...companions[index]]),
    arrival: input.arrival,
    now: input.now,
  }).stay,
    keys: [] as string[],
    mail: "none" as const,
    mailSentAt: null,
    stripe: "none" as const,
    authorizedAt: null,
  };
  stay = {
    ...stay,
    payMethod: input.payMethod,
    supplier: "api",
    placingAt: input.now,
    stripe: "none",
    stripeIntent: null,
    sellCents: input.offer.sell_cents,
    hotelCents: input.offer.sell_cents,
    currency: input.offer.currency,
    guests: input.guests.flatMap((name, index) => [name, ...companions[index]]),
    arrival: input.arrival,
  };
  let stayId = row?.id || "";
  let bookingId = row?.booking_id || null;
  if (!stayId) {
    const inserted = await input.admin
      .from("crm_hotel_direct_stays")
      .insert({
        customer_id: input.customer.id,
        offer_id: input.offer.id,
        idempotency_key: key,
        phase: "placing",
        pay_method: input.payMethod,
        supplier: "little_emperors",
        trial: false,
        state: stay,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") return { ok: false, message: "Une réservation est déjà en cours. Réessayez dans un instant." };
      return { ok: false, message: NOT_CHARGED };
    }
    stayId = (inserted.data as { id: string }).id;
  } else {
    await input.admin
      .from("crm_hotel_direct_stays")
      .update({ state: stay, phase: "placing", supplier: "little_emperors", updated_at: input.now })
      .eq("id", stayId);
  }

  const release = (reason: string) =>
    rollbackLe({ admin: input.admin, stayId, stay, offer: input.offer, bookingId, reason });

  const agency = input.payMethod === "agency";
  if (!agency && !input.offer.le_session_id) {
    await release("Session");
    return { ok: false, message: "La saisie de la carte a expiré. Recommencez." };
  }
  if (agency && input.offer.currency.toUpperCase() !== "EUR") {
    await release("Devise");
    return { ok: false, message: "Ce tarif n’est pas en euros. Écrivez à votre conseiller." };
  }

  const refresh = (partyRooms: HotelRoomOccupancy[] = rooms) =>
    refreshLeOfferQuote({
      hotelId,
      checkIn: input.offer.check_in,
      checkOut: input.offer.check_out,
      rooms: partyRooms,
      rateKey: input.offer.rate_key || "",
      rateIndex: input.offer.le_rate_index || null,
      roomKey: input.offer.room_key || "",
      fetchImpl: input.fetchImpl,
    });
  if (!agency && partyChanged(storedRooms, rooms)) {
    const again = await refresh(rooms).catch(() => null);
    if (!again) {
      await release("Voyageurs");
      return { ok: false, message: PARTY_MISMATCH };
    }
    await storeFreshQuote(input.admin, input.offer.id, again, rooms);
    let widgetUrl: string | null = null;
    try {
      widgetUrl = leCardWidgetUrl(littleEmperorsOrigin(), again.sessionId);
    } catch {
      widgetUrl = null;
    }
    await release("Prix");
    if (pricesDiffer(input.offer.sell_cents, again.sellCents) || again.currency !== input.offer.currency.toUpperCase()) {
      return {
        ok: false,
        code: "price_changed",
        message: priceChangedMessage(again.sellCents, again.currency),
        sellCents: again.sellCents,
        currency: again.currency,
        widgetUrl: widgetUrl || undefined,
        terms: termsFor(again),
      };
    }
    return {
      ok: false,
      code: "card_again",
      message: "Le nombre de voyageurs a changé. Saisissez à nouveau la carte.",
      widgetUrl: widgetUrl || undefined,
      terms: termsFor(again),
    };
  }
  let fresh: LeFreshQuote | null = agency
    ? null
    : {
        sellCents: input.offer.sell_cents,
        currency: input.offer.currency.toUpperCase(),
        sessionId: input.offer.le_session_id || "",
        rateIndex: input.offer.le_rate_index || input.offer.rate_key || "",
        deadline: input.offer.cancellation_deadline || null,
        requiresCvc: input.offer.requires_cvc ?? null,
        paymentDescription: input.offer.payment_description || null,
        cancellation: input.offer.cancellation_policy || "",
        free: input.offer.free_cancellation === true,
      };
  if (agency) {
    try {
      fresh = await refresh(rooms);
    } catch {
      fresh = null;
    }
  }
  if (agency && !fresh) {
    await release("Voyageurs");
    return { ok: false, message: partyChanged(storedRooms, rooms) ? PARTY_MISMATCH : "Cette offre n’est plus disponible." };
  }
  if (!fresh || !fresh.sessionId || !fresh.rateIndex) {
    await release("Offre");
    return { ok: false, message: "Cette offre n’est plus disponible." };
  }
  if (agency && (pricesDiffer(input.offer.sell_cents, fresh.sellCents) || fresh.currency !== input.offer.currency.toUpperCase())) {
    await storeFreshQuote(input.admin, input.offer.id, fresh, partyChanged(storedRooms, rooms) ? rooms : undefined);
    await release("Prix");
    return {
      ok: false,
      code: "price_changed",
      message: priceChangedMessage(fresh.sellCents, fresh.currency),
      sellCents: fresh.sellCents,
      currency: fresh.currency,
    };
  }
  if (agency) {
    stay = { ...stay, sellCents: fresh.sellCents, hotelCents: fresh.sellCents, currency: fresh.currency };
    await storeFreshQuote(input.admin, input.offer.id, fresh, partyChanged(storedRooms, rooms) ? rooms : undefined);
  }

  const holder = agency ? await readPliantCardholderName(process.env.PLIANT_CARDHOLDER_ID || "") : null;
  if (agency && !stay.pliantCardId) {
    await issueStayCard({
      stay,
      offer: input.offer,
      live: true,
      reference: stay.reference || `HS-${stayId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      firstName: input.customer.first_name || "",
      lastName: input.customer.last_name || "",
      exact: true,
      holder,
    });
    if (stay.pliantCardId) stay = { ...stay, pliant: "issued", pliantCardId: stay.pliantCardId };
    await saveStay(input.admin, stayId, stay);
  }
  if (agency && (!stay.pliantCardId || !holder)) {
    await release("Carte");
    return { ok: false, message: NOT_CHARGED };
  }

  let booking: LeBooking | null = null;
  if (current?.placingAt && !current.leBookingId) {
    const listed = await listLittleEmperorsBookings(input.fetchImpl).catch(() => null);
    const adopted = listed
      ? adoptLeBooking(listed, {
          hotelId,
          checkIn: input.offer.check_in,
          checkOut: input.offer.check_out,
          guest: principals[0],
        })
      : null;
    if (adopted === "ambiguous") {
      return { ok: false, message: "La réservation n’a pas pu être confirmée. Votre conseiller vérifie." };
    }
    if (adopted) booking = { id: adopted.id, confirmation_number: adopted.confirmation } as LeBooking;
  }
  const cardName = holder ? [holder.firstName, holder.lastName].filter(Boolean).join(" ") : "";
  let cardLast4: string | null = null;
  const post = async (quote: LeFreshQuote) => {
    const secrets = agency && stay.pliantCardId ? await readPliantCardSecrets(stay.pliantCardId) : null;
    if (secrets?.pan) cardLast4 = secrets.pan.replace(/\D/g, "").slice(-4) || null;
    return submitLeBooking({
      quote,
      checkIn: input.offer.check_in,
      checkOut: input.offer.check_out,
      hotelId,
      guestName: principals[0],
      guestEmail,
      arrival: input.arrival,
      rooms: rooms.map((room, index) => ({
        guestName: principals[index],
        adults: room.adults,
        children: room.children,
      })),
      card: secrets ? cardFromSecrets(secrets, cardName) : null,
      fetchImpl: input.fetchImpl,
    });
  };
  if (!booking) {
    let posted = await post(fresh).catch(() => ({ ok: false as const, expired: false, message: "" }));
    if (!posted.ok && posted.expired && !agency) {
      const again = await refresh().catch(() => null);
      if (again && !pricesDiffer(fresh.sellCents, again.sellCents) && again.currency === fresh.currency) {
        await storeFreshQuote(input.admin, input.offer.id, again);
        let widgetUrl: string | null = null;
        try {
          widgetUrl = leCardWidgetUrl(littleEmperorsOrigin(), again.sessionId);
        } catch {
          widgetUrl = null;
        }
        await release("Session");
        return {
          ok: false,
          code: "card_again",
          message: "La saisie de la carte a expiré. Recommencez.",
          widgetUrl: widgetUrl || undefined,
          terms: termsFor(again),
        };
      }
      if (again && pricesDiffer(fresh.sellCents, again.sellCents)) {
        await storeFreshQuote(input.admin, input.offer.id, again);
        await release("Prix");
        return {
          ok: false,
          code: "price_changed",
          message: priceChangedMessage(again.sellCents, again.currency),
          sellCents: again.sellCents,
          currency: again.currency,
        };
      }
      await release("Session");
      return { ok: false, message: "La saisie de la carte a expiré. Recommencez." };
    }
    if (!posted.ok && posted.expired) {
      const listed = await listLittleEmperorsBookings(input.fetchImpl).catch(() => null);
      const adopted = listed
        ? adoptLeBooking(listed, { hotelId, checkIn: input.offer.check_in, checkOut: input.offer.check_out, guest: input.guests[0] })
        : null;
      if (adopted === "ambiguous") {
        return { ok: false, message: "La réservation n’a pas pu être confirmée. Votre conseiller vérifie." };
      }
      if (adopted) {
        booking = { id: adopted.id, confirmation_number: adopted.confirmation } as LeBooking;
      }
    }
    if (!booking && !posted.ok && posted.expired) {
      const again = await refresh().catch(() => null);
      if (!again || pricesDiffer(fresh.sellCents, again.sellCents)) {
        if (again && pricesDiffer(fresh.sellCents, again.sellCents)) {
          await storeFreshQuote(input.admin, input.offer.id, again);
          await release("Prix");
          return {
            ok: false,
            code: "price_changed" as const,
            message: priceChangedMessage(again.sellCents, again.currency),
            sellCents: again.sellCents,
            currency: again.currency,
          };
        }
        await release("Session");
        return { ok: false, message: "Cette recherche a expiré. Relancez-la." };
      }
      fresh = again;
      posted = await post(again).catch(() => ({ ok: false as const, expired: true, message: "" }));
    }
    if (!booking && (!posted.ok || !("booking" in posted))) {
      await release("Refus");
      return { ok: false, message: posted.message || (posted.expired ? "La saisie de la carte a expiré. Recommencez." : NOT_CHARGED) };
    }
    if (!booking && posted.ok && "booking" in posted) booking = posted.booking;
  }
  if (!booking) return { ok: false, message: NOT_CHARGED };

  input.onPhase?.("stay");
  const confirmation = booking.confirmation_number || String(booking.id);
  const deadline = booking.cancellation_deadline || fresh.deadline;
  stay = {
    ...stay,
    leBookingId: booking.id,
    confirmation,
    cancelDeadline: deadline,
    sellCents: input.offer.sell_cents,
    hotelCents: input.offer.sell_cents,
    freeCancellation: booking.is_cancellable === true || fresh.free,
    conditions: fresh.cancellation || stay.conditions,
    hotelName: input.offer.hotel_name,
  };
  await input.admin
    .from("crm_hotel_direct_stays")
    .update({ state: stay, le_booking_id: booking.id, updated_at: input.now })
    .eq("id", stayId);

  let reference = stay.reference || `HS-${stayId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  if (!bookingId) {
    try {
      const clientPays = input.payMethod === "card";
      const sale = centsToAmount(input.offer.sell_cents);
      const created = await createStaffBooking(input.admin, {
        customer_id: input.customer.id,
        title: input.offer.hotel_name,
        destination: input.offer.city,
        start_date: input.offer.check_in,
        end_date: input.offer.check_out,
        currency: input.offer.currency,
        status: "confirmed",
        include_in_ledger: !clientPays,
        client_settles_stay: clientPays,
        notes_internal: "Réservation d’hôtel confirmée.",
      });
      reference = created.booking.reference;
      bookingId = created.booking.id;
      const hotelDetails: Record<string, unknown> = {
        hotel_name: input.offer.hotel_name,
        city: input.offer.city,
        room: input.offer.room_label,
        guests: input.guests.flatMap((name, index) => [name, ...(companions[index] || [])]).join(", "),
        direct_stay_id: stayId,
        le_hotel_id: hotelId,
        le_booking_id: booking.id,
        source_family: "little_emperors",
        cancellation_deadline: deadline,
        conditions: [clientConditions(stay)],
      };
      if (booking.board) hotelDetails.board = booking.board;
      const benefitSource = booking.benefits?.length ? booking.benefits : benefitsOf(input.offer.benefits);
      assignLeIncluded(
        hotelDetails,
        benefitSource,
        leRoomLabels({
          room_types: booking.room_types,
          rooms: booking.rooms,
          room: input.offer.room_label,
        })
      );
      const { data: item } = await input.admin
        .from("crm_booking_items")
        .insert({
          booking_id: created.booking.id,
          kind: "hotel",
          title: input.offer.hotel_name,
          confirmation_ref: confirmation,
          start_at: input.offer.check_in,
          end_at: input.offer.check_out,
          amount: sale,
          include_in_ledger: !clientPays,
          visible_to_client: true,
          supplier: null,
          details: hotelDetails,
        })
        .select("id")
        .single();
      await input.admin
        .from("crm_hotel_direct_stays")
        .update({ booking_id: created.booking.id, booking_item_id: (item as { id?: string } | null)?.id || null })
        .eq("id", stayId);
      await input.admin
        .from("crm_bookings")
        .update({ visible_to_client: true, prices_visible: true, status: "confirmed" })
        .eq("id", created.booking.id);
      if (agency && stay.pliantCardId) {
        const cents = input.offer.sell_cents;
        await input.admin.from("crm_booking_cards").insert({
          booking_id: created.booking.id,
          pliant_card_id: stay.pliantCardId,
          label: `${input.offer.hotel_name}`.slice(0, 40),
          first_name: holder?.firstName || "",
          last_name: holder?.lastName || "",
          limit_cents: cents,
          transaction_limit_cents: cents,
          max_transaction_count: null,
          currency: "EUR",
          status: "active",
          last4: cardLast4,
        });
        const { rememberPliantCard } = await import("@/lib/crm/pliant-card-run");
        await rememberPliantCard(input.admin, {
          pliant_card_id: stay.pliantCardId,
          booking_id: created.booking.id,
          customer_id: input.customer.id,
          label: input.offer.hotel_name.slice(0, 40),
          last4: cardLast4,
          limit_cents: cents,
          currency: "EUR",
          status: "active",
          limit_manual: true,
          transaction_limit_cents: cents,
          max_transaction_count: null,
        });
      }
      await setCarnetPublished(input.admin, created.booking.id, true);
      await syncBookingTotalFromItems(input.admin, created.booking.id);
      const { data: priced } = await input.admin.from("crm_bookings").select("*").eq("id", created.booking.id).maybeSingle();
      if (priced) await syncBookingLedger(input.admin, priced as CrmBooking, created.booking.status);
    } catch {
      console.error("[hotels] dossier", "refus");
    }
  }
  if (bookingId) {
    await safeConcierge(() => notifyStayPublished(bookingId as string, input.admin));
    await safeConcierge(() => remindMissingPieces(bookingId as string, new Date(), input.admin));
  }
  await input.admin.from("crm_le_bookings").upsert(
    {
      le_booking_id: booking.id,
      confirmation_number: booking.confirmation_number,
      state: booking.state || "confirmed",
      hotel_id: booking.hotel_id || hotelId,
      hotel_name: booking.hotel_name || input.offer.hotel_name,
      city: booking.city || input.offer.city,
      check_in: booking.check_in || input.offer.check_in,
      check_out: booking.check_out || input.offer.check_out,
      currency: booking.currency || input.offer.currency,
      total_cost: booking.total_cost,
      is_cancellable: booking.is_cancellable,
      cancellation_deadline: deadline,
      guest_names: booking.guest_names?.length ? booking.guest_names : input.guests,
      cancellation_policies: booking.cancellation_policies || [],
      room_types: booking.room_types || [],
      raw: booking,
      crm_booking_id: bookingId,
      status: bookingId ? "linked" : "unmatched",
      last_event: "hotel_booking_create",
    },
    { onConflict: "le_booking_id" }
  );

  const step = openLeConfirmed({
    payMethod: input.payMethod,
    sellCents: input.offer.sell_cents,
    currency: input.offer.currency,
    confirmation,
    leBookingId: booking.id,
    freeCancellation: stay.freeCancellation,
    cancelDeadline: deadline,
    conditions: stay.conditions,
    guests: input.guests.flatMap((name, index) => [name, ...(companions[index] || [])]),
    arrival: input.arrival,
    now: input.now,
    pliantCardId: stay.pliantCardId,
  });
  step.stay.reference = reference;
  step.stay.hotelName = input.offer.hotel_name;
  await runEffects({
    admin: input.admin,
    stayId,
    stay: step.stay,
    effects: step.effects,
    offer: input.offer,
    reference,
    live: true,
    email: null,
    firstName: input.customer.first_name || "",
    lastName: input.customer.last_name || "",
    bookingId,
    clientEmail: guestEmail,
    sendMail: input.sendMail,
  });
  await input.admin
    .from("crm_hotel_direct_stays")
    .update({ state: step.stay, phase: step.stay.phase, le_booking_id: booking.id, updated_at: input.now })
    .eq("id", stayId);
  const view = viewOf(stayId, step.stay, input.offer, input.now.slice(0, 10));
  return { ok: true, view: { ...view, dossier: /^TB-/.test(reference) ? reference : null } };
}

export async function openDirectStay(input: {
  customer: HotelAccessCustomer & { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; stripe_customer_id?: string | null };
  offerId: string;
  guests: string[];
  arrival?: string | null;
  payMethod: "card" | "agency";
  stripeIntent?: string | null;
  cardReady?: boolean;
  companions?: string[][];
  deps?: {
    admin?: Admin;
    fetchImpl?: typeof fetch;
    sendMail?: (input: { to: string; subject: string; text: string }) => Promise<boolean>;
  };
  onPhase?: (phase: "hotel" | "stay") => void;
}) {
  const admin = input.deps?.admin || db();
  const { data: offerRow, error } = await admin
    .from("crm_hotel_search_offers")
    .select(OFFER_COLUMNS)
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
  const live = hotelDirectLive(input.customer);
  const port = portForBooking({
    partnerRate: quote.partnerRate,
    leEndpoint: hotelLeApiBooking(input.customer) && quote.partnerRate && littleEmperorsConfigured(),
  });
  const checked = port.recheck(quote, now);
  if (!checked.ok) return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  const booked = port.book(quote);
  if (booked.status === "place") {
    if (input.payMethod === "card" && !input.cardReady) return prepareLeClientCard(admin, input.customer.id, offer, input.companions || []);
    return placeLeStay({
      admin,
      customer: input.customer,
      offer,
      guests: input.guests,
      arrival: input.arrival || null,
      payMethod: input.payMethod,
      companions: input.companions || [],
      now,
      fetchImpl: input.deps?.fetchImpl,
      sendMail: input.deps?.sendMail,
      onPhase: input.onPhase,
    });
  }
  if (booked.status === "unavailable") return { ok: false as const, message: "La réservation directe n’est pas ouverte." };

  const existing = await admin.from("crm_hotel_direct_stays").select("id, state").eq("idempotency_key", quote.idempotencyKey).maybeSingle();
  if (existing.data) {
    const row = existing.data as { id: string; state: DirectStay };
    return { ok: true as const, view: viewOf(row.id, row.state, offer, now.slice(0, 10)) };
  }

  const email = await hotelEmail(admin, offer.hotel_name);
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
    cancelDeadline: offer.cancellation_deadline || deadlineOf(offer.cancellation_policy, offer.free_cancellation === true),
    conditions: offer.cancellation_policy || "",
    hotelEmail: email,
    guests: input.guests.flatMap((name, index) => [name, ...((input.companions || [])[index] || [])]),
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
        details: cardDetails(
          offer,
          input.guests.flatMap((name, index) => [name, ...((input.companions || [])[index] || [])]).join(", "),
          { direct_stay_id: stayId }
        ),
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
    clientEmail: input.customer.email || null,
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
  const state = readStay(row.state);
  let event = input.event;
  if (event.type === "cancel_client" && state.supplier === "api" && state.leBookingId) {
    const preview = applyStay(state, event, now);
    if ("error" in preview) return { ok: false as const, message: preview.error };
    try {
      await cancelLittleEmperorsBooking(state.leBookingId);
    } catch {
      return { ok: false as const, message: "L’annulation n’a pas abouti. Contactez votre conseiller." };
    }
    event = { type: "supplier_cancelled" };
  }
  const step = applyStay(state, event, now);
  if ("error" in step) return { ok: false as const, message: step.error };
  const { data: offerRow } = await admin
    .from("crm_hotel_search_offers")
    .select(OFFER_COLUMNS)
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
  const { data: customer } = await admin.from("crm_customers").select("first_name, last_name, email, hotel_booking_enabled, hotel_demo, hotel_direct_live").eq("id", input.customerId).maybeSingle();
  const person = (customer as (HotelAccessCustomer & { first_name?: string; last_name?: string; email?: string | null }) | null) || {};
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
    clientEmail: person.email || null,
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

async function freshQuote(offer: Offer, rooms?: HotelRoomOccupancy[]): Promise<
  | { ok: true; fresh: LeFreshQuote; rooms: HotelRoomOccupancy[] }
  | { ok: false; message: string; code?: "price_changed"; sellCents?: number; currency?: string }
> {
  const stored = roomsFromStored(offer.rooms, offer.adults || 2);
  const partyRooms = rooms || stored;
  const party = leRoomPartyOk(partyRooms);
  if (!party.ok) return { ok: false, message: party.message };
  const hotelId = Number(offer.le_hotel_id);
  if (!Number.isInteger(hotelId) || hotelId < 1) return { ok: false, message: "Cette offre n’est plus disponible." };
  let fresh: LeFreshQuote | null = null;
  try {
    fresh = await refreshLeOfferQuote({
      hotelId,
      checkIn: offer.check_in,
      checkOut: offer.check_out,
      rooms: partyRooms,
      rateKey: offer.rate_key || "",
      rateIndex: offer.le_rate_index || null,
      roomKey: offer.room_key || "",
    });
  } catch {
    return { ok: false, message: "La vérification du tarif n’a pas abouti. Réessayez." };
  }
  if (!fresh) return { ok: false, message: partyChanged(stored, partyRooms) ? PARTY_MISMATCH : "Cette offre n’est plus disponible." };
  return { ok: true, fresh, rooms: partyRooms };
}

export async function prepareLeClientCard(admin: Admin, customerId: string, offer: Offer, companions: string[][] = []) {
  const stored = roomsFromStored(offer.rooms, offer.adults || 2);
  const wanted = partyWithCompanions(stored, stored.map((_, index) => companions[index]?.length || 0));
  const quoted = await freshQuote(offer, wanted);
  if (!quoted.ok) return quoted;
  const previous = offer.sell_cents;
  const previousCurrency = offer.currency.toUpperCase();
  await storeFreshQuote(admin, offer.id, quoted.fresh, partyChanged(stored, wanted) ? wanted : undefined);
  if (pricesDiffer(previous, quoted.fresh.sellCents) || quoted.fresh.currency !== previousCurrency) {
    return {
      ok: false as const,
      code: "price_changed" as const,
      message: priceChangedMessage(quoted.fresh.sellCents, quoted.fresh.currency),
      sellCents: quoted.fresh.sellCents,
      currency: quoted.fresh.currency,
    };
  }
  let origin = "";
  try {
    origin = littleEmperorsOrigin();
  } catch {
    return { ok: false as const, message: "La réservation n’est pas ouverte." };
  }
  const widgetUrl = leCardWidgetUrl(origin, quoted.fresh.sessionId);
  if (!widgetUrl) return { ok: false as const, message: "La saisie de la carte n’est pas ouverte." };
  return {
    ok: true as const,
    widgetUrl,
    widgetOrigin: new URL(widgetUrl).origin,
    terms: termsFor(quoted.fresh),
    customerId,
  };
}

export async function prepareDirectPayment(input: {
  customer: HotelAccessCustomer & {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    stripe_customer_id: string | null;
  };
  offerId: string;
  companions?: string[][];
}) {
  const admin = db();
  const { data } = await admin.from("crm_hotel_search_offers").select(OFFER_COLUMNS).eq("id", input.offerId).eq("customer_id", input.customer.id).maybeSingle();
  const offer = data as Offer | null;
  if (!offer || Date.parse(offer.expires_at) <= Date.now()) return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  if (offer.account === "little_emperors" && littleEmperorsConfigured() && hotelLeApiBooking(input.customer)) {
    return prepareLeClientCard(admin, input.customer.id, offer, input.companions || []);
  }
  return beginDirectCard(input);
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
  const { data } = await admin.from("crm_hotel_search_offers").select(OFFER_COLUMNS).eq("id", input.offerId).eq("customer_id", input.customer.id).maybeSingle();
  const offer = data as Offer | null;
  if (!offer || Date.parse(offer.expires_at) <= Date.now()) return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  if (offer.account === "little_emperors" && littleEmperorsConfigured() && hotelLeApiBooking(input.customer)) {
    return { ok: false as const, message: "Ce séjour se règle auprès de l’hôtel, ou par l’agence." };
  }
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
      { idempotencyKey: `direct-auth:${input.customer.id}:${offer.id}:${offer.sell_cents}` }
    );
    if (!intent.client_secret) return { ok: false as const, message: "L’autorisation n’a pas pu être ouverte." };
    return { ok: true as const, clientSecret: intent.client_secret, intentId: intent.id };
  } catch {
    return { ok: false as const, message: "L’autorisation n’a pas pu être ouverte." };
  }
}

export async function refundStayForBooking(bookingId: string) {
  const admin = db();
  const { data } = await admin
    .from("crm_hotel_direct_stays")
    .select("id, customer_id, offer_id, booking_id, state")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!data) return;
  const row = data as { id: string; customer_id: string; offer_id: string | null; booking_id: string | null; state: DirectStay };
  const stay = readStay(row.state);
  if (!stay.leBookingId) return;
  if (stay.payMethod === "card" && stay.stripe !== "captured") return;
  if (stay.payMethod === "agency" && stay.pliant !== "issued" && stay.pliant !== "charged" && stay.stripe !== "captured") return;
  const now = new Date().toISOString();
  const step = applyStay(stay, { type: "supplier_cancelled" }, now);
  if ("error" in step) return;
  const { data: offerRow } = await admin.from("crm_hotel_search_offers").select(OFFER_COLUMNS).eq("id", row.offer_id || "").maybeSingle();
  const offer = (offerRow as Offer | null) || {
    id: "",
    customer_id: row.customer_id,
    hotel_name: stay.hotelName,
    city: "",
    room_label: null,
    rate_title: null,
    cancellation_policy: null,
    check_in: now.slice(0, 10),
    check_out: now.slice(0, 10),
    sell_cents: stay.sellCents,
    currency: stay.currency,
    benefits: [],
    account: "little_emperors",
    expires_at: now,
    free_cancellation: stay.freeCancellation,
  };
  await runEffects({
    admin,
    stayId: row.id,
    stay: step.stay,
    effects: step.effects,
    offer,
    reference: stay.reference,
    live: true,
    email: null,
    firstName: "",
    lastName: "",
    bookingId: row.booking_id,
    clientEmail: null,
  });
  await admin.from("crm_hotel_direct_stays").update({ state: step.stay, phase: step.stay.phase, updated_at: now }).eq("id", row.id);
}

export async function advanceDirectStays() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_hotel_direct_stays")
    .select("id, customer_id")
    .in("phase", ["transmitted", "confirming", "placing"])
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
