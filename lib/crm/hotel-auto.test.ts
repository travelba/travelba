import assert from "node:assert/strict";
import test from "node:test";
import {
  autonomousArrivalChannel,
  autonomousDeskLines,
  buildHotelAutoNotice,
  chargeBrowserPlan,
  chargeMayStart,
  chargeResultHasPan,
  chargeWorkerAllowed,
  decideHotelCharge,
  hotelAutoSettingsPatch,
  hotelPayRequestTarget,
  isAutonomousStay,
  matchHotelChargeDebit,
  mayDeliverHotelPayRequest,
  noticeRetry,
  readChargePage,
  readHotelAutoSettings,
  runChargeSession,
  type ChargeFill,
} from "./hotel-auto";
import { exactStayCeiling, itemStayChannel, planHotelArrival, type ArrivalTick } from "./hotel-arrival";

const PAN = "4242424242424242";

function tick(overrides: Partial<ArrivalTick> = {}): ArrivalTick {
  return {
    status: "pending",
    channel: "direct",
    parisToday: "2026-11-02",
    nowMs: Date.parse("2026-11-02T08:00:00.000Z"),
    checkIn: "2026-11-04",
    checkOut: "2026-11-08",
    holidays: [],
    emails: ["reservations@hotel.test"],
    amountCents: 120000,
    passportCount: 1,
    travelerCount: 1,
    requestedAtMs: null,
    relanceCount: 0,
    lastRelanceAtMs: null,
    paymentUrl: null,
    bookingStatus: "confirmed",
    cardId: null,
    cardClosed: false,
    blockedReason: null,
    ...overrides,
  };
}

test("les interrupteurs naissent éteints et le plafond est 2 000 €", () => {
  const settings = readHotelAutoSettings(null);
  assert.equal(settings.payRequest, false);
  assert.equal(settings.chargeEnabled, false);
  assert.equal(settings.chargeMaxCents, 200_000);
  assert.equal(hotelAutoSettingsPatch({ payRequest: true, chargeEnabled: false, maxEuros: 2000 }).ok, true);
  assert.equal(hotelAutoSettingsPatch({ payRequest: false, chargeEnabled: false, maxEuros: 0 }).ok, false);
});

test("le canal API Little Emperors reste little_emperors, l’e-mail du catalogue est direct", () => {
  assert.equal(autonomousArrivalChannel({ placed: "api", account: "little_emperors" }), "little_emperors");
  assert.equal(autonomousArrivalChannel({ placed: "email", account: "little_emperors" }), "direct");
  assert.equal(
    itemStayChannel({
      supplier: null,
      details: { source_family: "little_emperors", le_hotel_id: 15, arrival_channel: "direct", direct_stay_id: "stay-1" },
    }),
    "direct"
  );
  assert.equal(isAutonomousStay({ direct_stay_id: "stay-1" }), true);
  assert.equal(isAutonomousStay({ source_family: "little_emperors" } as { autonomous?: unknown }), false);
});

test("l’avis agence porte les quatre derniers chiffres et refuse un numéro complet", () => {
  const notice = buildHotelAutoNotice({
    kind: "confirmed",
    stayId: "stay-1",
    bookingId: "booking-1",
    reference: "TB-2026-0253",
    client: "Camille Martin",
    hotel: "Hotel Indigo",
    city: "Bordeaux",
    checkIn: "2026-11-27",
    checkOut: "2026-11-28",
    room: "Queen",
    rate: "Flexible",
    amountCents: 14274,
    currency: "EUR",
    payMethod: "agency",
    supplier: "Little Emperors",
    confirmation: "LE-1",
    cancellable: true,
    cancelDeadline: "2026-11-26T18:00:00",
    cardLast4: "4242",
    reason: null,
    origin: "https://travelba.fr",
  });
  assert.ok(notice);
  assert.match(notice.text, /Camille Martin/);
  assert.match(notice.text, /•••• 4242/);
  assert.match(notice.text, /Little Emperors/);
  assert.match(notice.text, /Annulable/);
  assert.match(notice.text, /\/admin\/reservations\/booking-1/);
  assert.equal(notice.text.includes(PAN), false);
  assert.equal(
    buildHotelAutoNotice({
      kind: "failed",
      stayId: "stay-1",
      bookingId: null,
      reference: null,
      client: "Camille",
      hotel: "Hotel",
      city: null,
      checkIn: null,
      checkOut: null,
      room: null,
      rate: PAN,
      amountCents: null,
      currency: "EUR",
      payMethod: null,
      supplier: null,
      confirmation: null,
      cancellable: null,
      cancelDeadline: null,
      cardLast4: PAN,
      reason: null,
      origin: "https://travelba.fr",
    }),
    null
  );
});

test("l’avis échoue définitivement au cinquième essai", () => {
  assert.equal(noticeRetry(4, 0).status, "pending");
  assert.equal(noticeRetry(5, 0).status, "failed");
});

test("la demande de lien ne part à l’hôtel que si le mode réel est ouvert", () => {
  assert.equal(planHotelArrival(tick()).action, "task");
  const asked = planHotelArrival(tick({ autonomous: true, autoPayRequest: true }));
  assert.equal(asked.action, "request");
  if (asked.action === "request") assert.equal(asked.relance, false);
  assert.equal(planHotelArrival(tick({ autonomous: true, autoPayRequest: true, channel: "expedia" })).action, "task");
  assert.equal(planHotelArrival(tick({ status: "paid", autonomous: true, autoPayRequest: true })).action, "task");
  assert.equal(planHotelArrival(tick({ autonomous: true, autoPayRequest: true, amountCents: null })).action, "task");
  const target = hotelPayRequestTarget({ live: false, hotelEmail: "stay@hotel.test", testInbox: "essai@travelba.fr" });
  assert.equal(target.to, "essai@travelba.fr");
  assert.equal(target.redirected, true);
  assert.equal(mayDeliverHotelPayRequest({ to: "stay@hotel.test", live: false, testInbox: "essai@travelba.fr" }), false);
  assert.equal(hotelPayRequestTarget({ live: false, hotelEmail: "stay@hotel.test", testInbox: "" }).to, null);
});

test("le paiement exige le même montant en euros, sinon il s’arrête", () => {
  assert.equal(
    chargeMayStart({ enabled: true, amountCents: 250_000, currency: "EUR", cardLimitCents: 250_000, maxCents: 200_000, already: false }).ok,
    false
  );
  const page = readChargePage({
    url: "https://pay.hotel.test/3dsecure",
    text: "Verified by Visa",
    amountCents: 10000,
    currency: "EUR",
    hasCardFields: true,
  });
  assert.equal(decideHotelCharge({ page, stayCents: 10000, ceilingCents: 10000 }).pay, false);
  const ok = readChargePage({
    url: "https://pay.hotel.test/form",
    text: "Montant 100,00 EUR",
    amountCents: 10000,
    currency: "eur",
    hasCardFields: true,
  });
  assert.deepEqual(decideHotelCharge({ page: ok, stayCents: 10000, ceilingCents: 10000 }), { pay: true });
  assert.equal(decideHotelCharge({ page: ok, stayCents: 10000, ceilingCents: 13000 }).pay, false);
  assert.equal(exactStayCeiling({ baseCents: 10000, marginCents: 3000, ceilingCents: 13000, currency: "EUR" }).ceilingCents, 10000);
  assert.equal(matchHotelChargeDebit({ pliantCardId: "card", amountCents: 10000, status: "submitted" }, [
    { cardId: "card", status: "CONFIRMED", billingCents: 10000, billingCurrency: "EUR" },
  ]), "paid");
  assert.equal(matchHotelChargeDebit({ pliantCardId: "card", amountCents: 10000, status: "submitted" }, [
    { cardId: "card", status: "DECLINED", billingCents: 10000, billingCurrency: "EUR" },
  ]), "declined");
});

test("la session de paiement ne renvoie pas le numéro et ne saisit pas une page 3DS", async () => {
  let filled = false;
  const blocked: ChargeFill = {
    async url() {
      return "https://pay.hotel.test/3ds";
    },
    async text() {
      return "3D Secure challenge";
    },
    async amount() {
      return { cents: 10000, currency: "EUR" };
    },
    async hasCardFields() {
      return true;
    },
    async fill() {
      filled = true;
    },
    async submit() {},
    async clearSecrets() {},
    async screenshot() {
      return new Uint8Array();
    },
  };
  const stopped = await runChargeSession(blocked, { pan: PAN, expiry: "12/30", cvc: "123" }, { stayCents: 10000, ceilingCents: 10000 });
  assert.equal(stopped.status, "needs_agent");
  assert.equal(stopped.reason, "3ds");
  assert.equal(filled, false);
  assert.equal(chargeResultHasPan(stopped, PAN), false);

  const paid: ChargeFill = {
    async url() {
      return "https://pay.hotel.test/form";
    },
    async text() {
      return calls.text;
    },
    async amount() {
      return { cents: 10000, currency: "EUR" };
    },
    async hasCardFields() {
      return true;
    },
    async fill() {
      calls.filled = true;
    },
    async submit() {
      calls.text = "Thank you for your payment";
    },
    async clearSecrets() {
      calls.clearedAt = calls.shots;
    },
    async screenshot() {
      calls.shots += 1;
      return new Uint8Array([1, 2, 3]);
    },
  };
  const calls = { text: "Montant 100,00 EUR", filled: false, shots: 0, clearedAt: -1 };
  const done = await runChargeSession(paid, { pan: PAN, expiry: "12/30", cvc: "123" }, { stayCents: 10000, ceilingCents: 10000 });
  assert.equal(done.status, "submitted");
  assert.equal(calls.filled, true);
  assert.equal(calls.clearedAt, 0);
  assert.equal(chargeResultHasPan(done, PAN), false);
  assert.equal(JSON.stringify(done).includes(PAN), false);
  assert.equal(JSON.stringify(done).includes("123"), false);
});

test("le navigateur de paiement ne tourne pas sur Vercel", () => {
  assert.equal(chargeWorkerAllowed(undefined), false);
  assert.equal(chargeWorkerAllowed("1"), true);
  const refused = chargeBrowserPlan([]);
  assert.equal(refused.mode, "refuse");
  if (refused.mode === "refuse") assert.match(refused.message, /Vercel/);
  assert.equal(chargeBrowserPlan(["/usr/bin/google-chrome"]).mode, "local");
});

test("l’accueil montre l’état du paiement et le bouton manuel", () => {
  const lines = autonomousDeskLines({
    jobs: [
      {
        id: "job-1",
        bookingId: "booking-1",
        reference: "TB-2026-0253",
        client: "Camille",
        hotel: "Indigo",
        dates: "2026-11-27 → 2026-11-28",
        status: "needs_agent",
        seen: false,
      },
    ],
    notices: [
      {
        id: "note-1",
        bookingId: "booking-1",
        reference: "TB-2026-0253",
        client: "Camille",
        hotel: "Indigo",
        dates: "",
        kind: "confirmed",
        seen: false,
      },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].manual, true);
  assert.equal(lines[0].payment, "À payer à la main");
  assert.equal(lines[0].href, "/admin/reservations/booking-1");
});

test("le fichier navigateur ne charge pas Chromium empaqueté", async () => {
  const { readFileSync } = await import("node:fs");
  const browser = readFileSync(new URL("./hotel-charge-browser.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../../scripts/hotel-charge-worker.ts", import.meta.url), "utf8");
  assert.equal(browser.includes("@sparticuz/chromium"), false);
  assert.match(worker, /HOTEL_CHARGE_WORKER/);
  assert.equal(worker.includes("console.log(secrets"), false);
});
