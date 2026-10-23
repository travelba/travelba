import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { portForBooking } from "./hotel-supplier";
import { clientConfirmationDraft, hotelRequestLetter, outboundHotelRecipient } from "./hotel-direct-mail";
import {
  applyStay,
  cancelOffer,
  clientStayLabel,
  directCardCeilingCents,
  openStay,
  PAY_COPY,
  readHotelReply,
  redactAudit,
  type DirectStay,
} from "./hotel-direct";

const NOW = "2026-10-23T12:00:00.000Z";

function opened(extra?: { email?: string | null; partner?: boolean; pay?: "card" | "agency"; free?: boolean; deadline?: string | null }) {
  return openStay({
    payMethod: extra?.pay || "card",
    sellCents: 100_000,
    currency: "EUR",
    partnerRate: extra?.partner === true,
    freeCancellation: extra?.free !== false,
    cancelDeadline: extra?.deadline === undefined ? "2026-11-01" : extra.deadline,
    conditions: "Gratuite jusqu’au 1er novembre 2026.",
    hotelEmail: extra?.email === undefined ? "reservations@hotel.test" : extra.email,
    now: NOW,
  });
}

function keys(step: { effects: { key: string }[] }) {
  return step.effects.map((effect) => effect.key);
}

test("la carte et l’agence ouvrent une demande, une seule fois", () => {
  const card = opened();
  assert.equal(card.stay.phase, "transmitted");
  assert.equal(card.stay.stripe, "authorized");
  assert.equal(clientStayLabel(card.stay), "Demande transmise à l’hôtel");
  assert.ok(keys(card).includes("mail:request"));
  assert.ok(keys(card).includes("card:issue"));
  assert.equal(keys(card).filter((key) => key === "mail:request").length, 1);
  assert.equal(directCardCeilingCents(100_000), 105_000);
  const again = opened();
  assert.equal(keys(again).length, keys(card).length);

  const agency = opened({ pay: "agency" });
  assert.ok(keys(agency).includes("debit:agency"));
  assert.equal(agency.stay.stripe, "none");
});

test("sans adresse, aucun e-mail ; le mode essai ne part pas vers l’hôtel", () => {
  const missing = opened({ email: null });
  assert.equal(missing.stay.mail, "no_contact");
  assert.equal(keys(missing).includes("mail:request"), false);
  assert.ok(keys(missing).includes("task:no-email"));
  assert.deepEqual(outboundHotelRecipient({ live: false, hotelEmail: "stay@hotel.test", testInbox: "essai@travelba.fr" }), {
    to: "essai@travelba.fr",
    redirected: true,
    blocked: null,
  });
  assert.equal(outboundHotelRecipient({ live: false, hotelEmail: "stay@hotel.test", testInbox: "" }).to, null);
  assert.equal(outboundHotelRecipient({ live: true, hotelEmail: "stay@hotel.test", testInbox: "essai@travelba.fr" }).to, "stay@hotel.test");
});

test("réponse : lien, confirmation, refus, silence, prix, remboursement", () => {
  const link = applyStay(opened().stay, { type: "reply", text: "Please pay https://pay.hotel.test/checkout/abc" }, NOW);
  assert.ok(!("error" in link));
  if ("error" in link) return;
  assert.equal(link.stay.phase, "confirming");
  assert.equal(link.stay.hotelPay, "link_ready");
  assert.equal(clientStayLabel(link.stay), "En cours de confirmation");
  assert.ok(keys(link).includes("task:pay-link"));

  const confirmed = applyStay(link.stay, { type: "reply", text: "Confirmation : HTL4491" }, NOW);
  assert.ok(!("error" in confirmed));
  if ("error" in confirmed) return;
  assert.equal(confirmed.stay.phase, "confirmed");
  assert.equal(confirmed.stay.confirmation, "HTL4491");
  assert.equal(confirmed.stay.stripe, "captured");
  assert.equal(clientStayLabel(confirmed.stay), "Confirmée · HTL4491");
  assert.ok(keys(confirmed).includes("draft:client"));
  const twice = applyStay(confirmed.stay, { type: "reply", text: "Confirmation : HTL4491" }, NOW);
  assert.ok(!("error" in twice) && keys(twice).includes("stripe:capture") === false);

  const refused = applyStay(opened().stay, { type: "reply", text: "We are fully booked, sold out." }, NOW);
  assert.ok(!("error" in refused));
  if ("error" in refused) return;
  assert.equal(refused.stay.phase, "cancelled");
  assert.equal(refused.stay.stripe, "released");
  assert.ok(keys(refused).includes("card:lock"));

  const price = applyStay(opened().stay, { type: "reply", text: "The price has changed." }, NOW);
  assert.ok(!("error" in price) && price.stay.priceState === "changed" && price.stay.stripe === "authorized");

  const refund = applyStay(
    { ...opened().stay, hotelPay: "paid", pliant: "charged" },
    { type: "reply", text: "Refund processed." },
    NOW
  );
  assert.ok(!("error" in refund));
  if ("error" in refund) return;
  assert.equal(refund.stay.clientRefunded, true);
  assert.equal(refund.stay.phase, "cancelled");
  const partial = applyStay(opened({ pay: "agency" }).stay, { type: "reply", text: "Partial refund issued." }, NOW);
  assert.ok(!("error" in partial) && partial.stay.hotelPay === "partial" && partial.stay.clientRefunded === false);
});

test("tarif partenaire : le numéro n’encaisse pas avant le prix de l’hôtel", () => {
  const partner = opened({ partner: true });
  assert.ok(keys(partner).includes("task:partner-rate"));
  const number = applyStay(partner.stay, { type: "reply", text: "Booking reference HTL900" }, NOW);
  assert.ok(!("error" in number));
  if ("error" in number) return;
  assert.equal(number.stay.phase, "confirming");
  assert.equal(number.stay.stripe, "authorized");
  const priced = applyStay(number.stay, { type: "price_ok", hotelCents: 90_000 }, NOW);
  assert.ok(!("error" in priced));
  if ("error" in priced) return;
  assert.equal(priced.stay.phase, "confirmed");
  assert.equal(priced.stay.stripe, "captured");
  assert.equal(priced.stay.hotelCents, 90_000);
  const letter = hotelRequestLetter({
    guestNames: ["Benjamin Boukris"],
    hotelName: "Ritz",
    city: "Paris",
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    room: "Chambre supérieure",
    rate: "Tarif flexible",
    benefits: ["Petit-déjeuner"],
    arrival: "15 h",
    sellLabel: "1 000,00 €",
    reference: "TB-2026-0001",
    partnerRate: true,
    kind: "request",
  });
  assert.match(letter.text, /Little Emperors/);
  assert.match(letter.text, /lien de paiement/);
  assert.match(letter.text, /payment link/);
  assert.doesNotMatch(letter.text, /\b\d{13,19}\b/);
  const plain = hotelRequestLetter({ ...{
    guestNames: ["Camille Morel"],
    hotelName: "Costes",
    city: "Paris",
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    room: "Chambre",
    rate: "Tarif",
    benefits: [],
    arrival: null,
    sellLabel: "500,00 €",
    reference: "TB-1",
    partnerRate: false,
    kind: "request",
  } });
  assert.doesNotMatch(plain.text, /Little Emperors/);
});

test("annulation avant paiement, après paiement, hors délai, remboursement immédiat", () => {
  const early = applyStay(opened().stay, { type: "cancel_client" }, "2026-10-24T08:00:00.000Z");
  assert.ok(!("error" in early));
  if ("error" in early) return;
  assert.equal(early.stay.phase, "cancelled");
  assert.ok(keys(early).includes("mail:cancel"));
  assert.ok(keys(early).includes("stripe:release"));
  assert.equal(keys(early).filter((key) => key === "mail:cancel").length, 1);

  const agency = opened({ pay: "agency" });
  const voided = applyStay(agency.stay, { type: "cancel_client" }, "2026-10-24T08:00:00.000Z");
  assert.ok(!("error" in voided) && keys(voided).includes("debit:void"));

  const paid = { ...opened().stay, hotelPay: "paid" as const, pliant: "charged" as const };
  const later = applyStay(paid, { type: "cancel_client" }, "2026-10-24T08:00:00.000Z");
  assert.ok(!("error" in later));
  if ("error" in later) return;
  assert.equal(later.stay.phase, "refunding");
  assert.equal(clientStayLabel(later.stay), "Remboursement en cours");
  assert.ok(keys(later).includes("mail:refund"));
  const now = applyStay(later.stay, { type: "refund_now" }, NOW);
  assert.ok(!("error" in now) && now.stay.clientRefunded);
  const again = applyStay(now.stay, { type: "refund_now" }, NOW);
  assert.ok(!("error" in again) && keys(again).includes("client:refund") === false);

  const late = opened({ deadline: "2026-10-01" });
  assert.equal(cancelOffer(late.stay, "2026-10-23").mode, "ask");
  const asked = applyStay(late.stay, { type: "cancel_client" }, NOW);
  assert.ok("error" in asked);
  const task = applyStay(late.stay, { type: "ask_agency" }, NOW);
  assert.ok(!("error" in task) && task.stay.phase === "transmitted");
  const rigid = opened({ free: false });
  assert.equal(cancelOffer(rigid.stay, "2026-10-23").mode, "ask");
});

test("relance, alerte, expiration d’autorisation, lien expiré, carte virtuelle", () => {
  const day = applyStay(opened().stay, { type: "clock" }, "2026-10-24T13:00:00.000Z");
  assert.ok(!("error" in day) && day.stay.mail === "chased" && keys(day).includes("mail:chase"));
  const quiet = applyStay(day.stay, { type: "clock" }, "2026-10-25T13:00:00.000Z");
  assert.ok(!("error" in quiet) && quiet.stay.mail === "alerted");
  const second = applyStay(quiet.stay, { type: "clock" }, "2026-10-26T13:00:00.000Z");
  assert.ok(!("error" in second) && keys(second).includes("mail:chase") === false);

  const old = opened().stay;
  const expired = applyStay(old, { type: "clock" }, "2026-10-31T12:00:00.000Z");
  assert.ok(!("error" in expired));
  if ("error" in expired) return;
  assert.equal(expired.stay.phase, "cancelled");
  assert.equal(expired.stay.stripe, "expired");
  const renew = applyStay(expired.stay, { type: "reauthorize" }, "2026-10-31T15:00:00.000Z");
  assert.ok(!("error" in renew) && renew.stay.stripe === "authorized");

  const expiredLink = applyStay(opened().stay, { type: "mark_link_expired" }, NOW);
  assert.ok(!("error" in expiredLink) && expiredLink.stay.hotelPay === "expired");
  const card = applyStay(opened().stay, { type: "send_card" }, NOW);
  assert.ok(!("error" in card) && card.stay.hotelPay === "card_sent");
  const spent = applyStay(card.stay, { type: "pliant_charged" }, NOW);
  assert.ok(!("error" in spent) && spent.stay.hotelPay === "paid");
});

test("le journal retire un numéro, le port membre ne crée rien, le message client n’est pas envoyé tout seul", () => {
  assert.match(redactAudit("carte 4242424242424242 et sk_live_abc"), /••••/);
  assert.doesNotMatch(redactAudit("carte 4242424242424242 et sk_live_abc"), /4242/);
  assert.equal(readHotelReply("https://hotel.test/about").link, null);
  assert.equal(readHotelReply("https://pay.hotel.test/i/1").link?.includes("pay.hotel"), true);
  const port = portForBooking({ partnerRate: true, leEndpoint: false });
  assert.equal(port.kind, "direct_email");
  const closed = portForBooking({ partnerRate: true, leEndpoint: true });
  assert.equal(closed.book({
    idempotencyKey: "k",
    hotelName: "Ritz",
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    sellCents: 100,
    currency: "EUR",
    expiresAt: "2026-11-01T00:00:00.000Z",
    partnerRate: true,
  }).status, "unavailable");
  const draft = clientConfirmationDraft({ firstName: "Benjamin", hotel: "Ritz", confirmation: "HTL1", dates: "6–8 novembre" });
  assert.match(draft, /HTL1/);
  assert.doesNotMatch(draft, /Little Emperors|net|commission/i);
  const stay: DirectStay = opened().stay;
  assert.equal(stay.draft, null);
  const journey = readFileSync(join(import.meta.dirname, "../../components/account/HotelJourney.tsx"), "utf8");
  assert.equal(PAY_COPY.cardTitle, "Payer par carte");
  assert.equal(PAY_COPY.agencyTitle, "Payé par l’agence");
  assert.match(journey, /PAY_COPY\.cardTitle/);
  assert.match(journey, /PAY_COPY\.agencyTitle/);
  assert.doesNotMatch(journey, /hotel-direct-mail/);
  assert.match(readFileSync(join(import.meta.dirname, "../../app/apercu/membres/layout.tsx"), "utf8"), /exampleSessionEnabled/);
});
