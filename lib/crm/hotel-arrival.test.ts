import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays,
  arrivalRowHasNoCardSecrets,
  businessDaysBefore,
  cardCloseDate,
  cardLast4,
  cardSecretsFromPayload,
  CHECKIN_CARD_CENTS,
  classifyPaymentPage,
  countryIso,
  formatArrivalAmount,
  groupedPan,
  holidayDatesFromNager,
  hotelChannel,
  hotelLanguage,
  leStayAmount,
  linkRequestMail,
  nagerHolidayUrl,
  nextBusinessDay,
  parisIsoDate,
  maskedCardNumber,
  parseMoneyToCents,
  paymentUrlFromText,
  planHotelArrival,
  quotedAmount,
  replyPaymentUrl,
  shownStayProvision,
  stayCardFace,
  tripStayCard,
  stayProvision,
  stayRevealNeedsAgencyCode,
  vipMail,
  type ArrivalTick,
} from "./hotel-arrival";

const holidays = new Set(["2026-11-03", "2026-11-11"]);

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

test("deux jours ouvrés avant le check-in, fuseau Paris, fériés du pays", () => {
  assert.equal(businessDaysBefore("2026-11-04", 2, new Set()), "2026-11-02");
  assert.equal(businessDaysBefore("2026-11-02", 2, new Set()), "2026-10-29");
  assert.equal(businessDaysBefore("2026-11-04", 2, holidays), "2026-10-30");
  assert.equal(nextBusinessDay("2026-10-30", new Set()), "2026-11-02");
  assert.equal(nextBusinessDay("2026-10-30", new Set(["2026-11-02"])), "2026-11-03");
  assert.equal(parisIsoDate(new Date("2026-11-02T23:30:00.000Z")), "2026-11-03");
  assert.equal(cardCloseDate("2026-11-08"), "2026-11-11");
  assert.equal(addIsoDays("2026-11-08", 3), "2026-11-11");
});

test("langue française en France, anglais ailleurs", () => {
  assert.equal(hotelLanguage("France"), "fr");
  assert.equal(hotelLanguage("Réunion"), "fr");
  assert.equal(hotelLanguage("Thailand"), "en");
  assert.equal(hotelLanguage("Émirats arabes unis"), "en");
  assert.equal(countryIso("Royaume-Uni"), "GB");
  assert.equal(countryIso("FR"), "FR");
  assert.equal(nagerHolidayUrl(2026, "TH"), "https://date.nager.at/api/v3/PublicHolidays/2026/TH");
  assert.deepEqual(holidayDatesFromNager([{ date: "2026-12-05" }, { date: "nope" }]), ["2026-12-05"]);
});

test("canal, montant Little Emperors, net direct, 500 € Expedia", () => {
  assert.equal(hotelChannel({ sourceFamily: "expedia_taap", supplier: "Expedia" }), "expedia");
  assert.equal(hotelChannel({ sourceFamily: "little_emperors", leHotelId: 4 }), "little_emperors");
  assert.equal(hotelChannel({ supplier: "Hôtel de la Paix" }), "direct");
  assert.equal(parseMoneyToCents("1.234,56 EUR"), 123456);
  assert.equal(parseMoneyToCents("1,234.56"), 123456);
  assert.equal(
    leStayAmount(
      { checkIn: "2026-11-04", hotelName: "Leela" },
      [{ checkIn: "2026-11-04", hotelName: "The Leela", total: "2 400,00", currency: "eur" }]
    )?.cents,
    240000
  );
  assert.equal(
    leStayAmount(
      { checkIn: "2026-11-04", hotelName: "A" },
      [
        { checkIn: "2026-11-01", hotelName: "A", total: "10", currency: "EUR" },
        { checkIn: "2026-12-01", hotelName: "A", total: "20", currency: "EUR" },
      ]
    ),
    null
  );
  assert.deepEqual(
    quotedAmount({
      channel: "little_emperors",
      leCents: 240000,
      leCurrency: "EUR",
      netCents: 100,
      bookingCurrency: "EUR",
    }),
    { cents: 240000, currency: "EUR" }
  );
  assert.equal(
    quotedAmount({ channel: "direct", leCents: null, leCurrency: null, netCents: 80000, bookingCurrency: "EUR" }).cents,
    80000
  );
  assert.equal(
    quotedAmount({ channel: "expedia", leCents: null, leCurrency: null, netCents: null, bookingCurrency: "USD" }).cents,
    CHECKIN_CARD_CENTS
  );
  assert.equal(formatArrivalAmount(240000, "EUR"), "2400,00 EUR");
});

test("le plafond carte est le prix de l'hôtel plus 30 %", () => {
  const direct = stayProvision({
    channel: "direct",
    itemCents: 100000,
    documentCents: 120000,
    documentCurrency: "EUR",
    leCents: null,
    leCurrency: null,
    netCents: 80000,
    savedBaseCents: null,
    bookingCurrency: "EUR",
  });
  assert.deepEqual(direct, { baseCents: 120000, marginCents: 36000, ceilingCents: 156000, currency: "EUR" });
  const odd = stayProvision({
    channel: "direct",
    itemCents: 1,
    documentCents: null,
    documentCurrency: null,
    leCents: null,
    leCurrency: null,
    netCents: null,
    savedBaseCents: null,
    bookingCurrency: "EUR",
  });
  assert.equal(odd?.ceilingCents, 2);
  const emperors = stayProvision({
    channel: "little_emperors",
    itemCents: 100,
    documentCents: 100,
    documentCurrency: "EUR",
    leCents: 240000,
    leCurrency: "EUR",
    netCents: null,
    savedBaseCents: null,
    bookingCurrency: "EUR",
  });
  assert.equal(emperors?.baseCents, 240000);
  assert.equal(emperors?.ceilingCents, 312000);
  assert.equal(
    stayProvision({
      channel: "expedia",
      itemCents: null,
      documentCents: null,
      documentCurrency: null,
      leCents: null,
      leCurrency: null,
      netCents: null,
      savedBaseCents: null,
      bookingCurrency: "EUR",
    }),
    null
  );
  const shown = shownStayProvision(
    { amount: 800, supplier: "The Ranch", details: { document_amount: 1000, document_currency: "EUR" } },
    { channel: "direct", amount_cents: null, net_cents: null, currency: "EUR" },
    "EUR"
  );
  assert.equal(shown?.baseCents, 100000);
  assert.equal(shown?.ceilingCents, 130000);
  const fromLe = shownStayProvision(
    { amount: null, supplier: "Leela", details: {} },
    { channel: "little_emperors", amount_cents: 240000, net_cents: null, currency: "EUR" },
    "EUR"
  );
  assert.equal(fromLe?.ceilingCents, 312000);
});

test("le suivi n'a pas de champ carte, le secret se lit au moment de l'envoi", () => {
  assert.equal(
    arrivalRowHasNoCardSecrets({
      status: "paid",
      pliant_card_id: "card-1",
      payment_url: "https://pay.hotel.test/1",
      net_cents: 100,
    }),
    true
  );
  assert.deepEqual(cardSecretsFromPayload({ pan: "4242424242424242", cvv: "123", expiryMonth: 6, expiryYear: 2028 }), {
    pan: "4242424242424242",
    expiry: "06/28",
    cvc: "123",
  });
  assert.equal(cardSecretsFromPayload({ pan: "4111" }), null);
});

test("mails : lien avec montant et référence, VIP avec attentions, carte seulement dans le texte d'envoi", () => {
  const link = linkRequestMail({
    lang: "fr",
    hotel: "Le Bristol",
    reference: "HB-9",
    checkIn: "2026-11-04",
    checkOut: "2026-11-08",
    amount: "2400,00 EUR",
  });
  assert.match(link.subject, /HB-9/);
  assert.match(link.text, /2400,00 EUR/);
  assert.match(link.text, /HB-9/);
  assert.match(link.text, /4 novembre 2026/);
  assert.match(link.text, /lien de paiement/);
  const vip = vipMail({
    lang: "en",
    hotel: "The Leela",
    reference: "EX-1",
    checkIn: "2026-11-04",
    checkOut: "2026-11-08",
    card: null,
  });
  assert.match(vip.text, /VIP/);
  assert.match(vip.text, /amenities/i);
  assert.match(vip.text, /upgrade/i);
  assert.doesNotMatch(vip.text, /4242/);
  const withCard = vipMail({ ...{
    lang: "fr" as const,
    hotel: "Le Bristol",
    reference: "HB-9",
    checkIn: "2026-11-04",
    checkOut: "2026-11-08",
    card: { holder: "Ada Martin", pan: "4242424242424242", expiry: "06/28", cvc: "123" },
  } });
  assert.match(withCard.text, /4242424242424242/);
  assert.match(withCard.text, /surclassement/);
  assert.match(withCard.text, /accueil VIP/);
});

test("lien de paiement extrait de la réponse hôtel", () => {
  const url = paymentUrlFromText("Bonjour https://pay.hotel.test/checkout/9 merci https://hotel.test/logo.png");
  assert.equal(url, "https://pay.hotel.test/checkout/9");
  assert.equal(
    replyPaymentUrl({
      from: "Reservations <reservations@hotel.test>",
      receivedAtMs: 20,
      requestedAtMs: 10,
      hotelEmails: ["reservations@hotel.test"],
      subject: "Payment",
      body: "https://secure.hotel.test/pay/1",
    }),
    "https://secure.hotel.test/pay/1"
  );
  assert.equal(
    replyPaymentUrl({
      from: "other@hotel.test",
      receivedAtMs: 20,
      requestedAtMs: 10,
      hotelEmails: ["reservations@hotel.test"],
      subject: "",
      body: "https://secure.hotel.test/pay/1",
    }),
    null
  );
});

test("la page de paiement interactive revient à l'agent", () => {
  assert.equal(classifyPaymentPage({ ok: true, url: "https://pay.hotel.test/3dsecure", body: "" }), "needs_agent");
  assert.equal(
    classifyPaymentPage({ ok: true, url: "https://pay.hotel.test/ok", body: "Thank you for your payment" }),
    "paid"
  );
  assert.equal(classifyPaymentPage({ ok: false, url: "https://pay.hotel.test/ok", body: "" }), "failed");
  assert.equal(classifyPaymentPage({ ok: true, url: "https://pay.hotel.test/form", body: "<form>card</form>" }), "needs_agent");
});

test("échéancier : attente, tâche agence, Expedia sans lien, relances, paiement, clôture", () => {
  assert.equal(planHotelArrival(tick({ parisToday: "2026-10-30" })).action, "wait");
  assert.equal(planHotelArrival(tick({ bookingStatus: "quoted" })).action, "wait");
  const expedia = planHotelArrival(tick({ channel: "expedia", amountCents: null }));
  assert.equal(expedia.action, "task");
  if (expedia.action === "task") {
    assert.equal(expedia.reason, "manual");
    assert.match(expedia.note, /mail automatique/);
    assert.match(expedia.note, /VIP/);
  }
  const missingMail = planHotelArrival(tick({ emails: [] }));
  assert.deepEqual(missingMail, { action: "task", note: "Aucun e-mail d'hôtel.", reason: "no_email" });
  const partial = planHotelArrival(tick({ amountCents: null, passportCount: 0, travelerCount: 2 }));
  assert.equal(partial.action, "task");
  if (partial.action === "task") {
    assert.equal(partial.reason, "manual");
    assert.match(partial.note, /lien de paiement/);
    assert.match(partial.note, /Montant manquant/);
    assert.match(partial.note, /Passeport manquant/);
  }
  const requested = Date.parse("2026-11-02T08:00:00.000Z");
  assert.equal(
    planHotelArrival(tick({ status: "link_requested", requestedAtMs: requested, nowMs: requested + 60_000 })).action,
    "wait"
  );
  const followUp = planHotelArrival(
    tick({ status: "link_requested", requestedAtMs: requested, nowMs: requested + 4 * 60 * 60 * 1000 })
  );
  assert.equal(followUp.action, "task");
  if (followUp.action === "task") assert.equal(followUp.reason, "manual");
  const nextDay = planHotelArrival(
    tick({
      status: "link_requested",
      relanceCount: 1,
      lastRelanceAtMs: Date.parse("2026-10-30T10:00:00.000Z"),
      parisToday: "2026-11-02",
    })
  );
  assert.equal(nextDay.action, "task");
  if (nextDay.action === "task") assert.match(nextDay.note, /Relancer/);
  const silent = planHotelArrival(tick({ status: "link_requested", relanceCount: 2 }));
  assert.equal(silent.action, "task");
  if (silent.action === "task") assert.equal(silent.reason, "no_reply");
  assert.equal(planHotelArrival(tick({ status: "link_requested", paymentUrl: "https://pay.hotel.test/1" })).action, "pay");
  const afterPay = planHotelArrival(tick({ status: "paid" }));
  assert.equal(afterPay.action, "task");
  if (afterPay.action === "task") {
    assert.equal(afterPay.reason, "manual");
    assert.match(afterPay.note, /VIP/);
  }
  assert.equal(
    planHotelArrival(tick({ status: "blocked", blockedReason: "payment", paymentUrl: "https://pay.hotel.test/1" })).action,
    "wait"
  );
  const resumed = planHotelArrival(tick({ status: "blocked", blockedReason: "no_email", emails: ["desk@hotel.test"] }));
  assert.equal(resumed.action, "task");
  if (resumed.action === "task") assert.equal(resumed.reason, "manual");
  assert.equal(
    planHotelArrival(tick({ status: "vip_sent", cardId: "card-1", parisToday: "2026-11-11", checkOut: "2026-11-08" }))
      .action,
    "close"
  );
  assert.equal(planHotelArrival(tick({ bookingStatus: "cancelled", cardId: "card-1" })).action, "close");
  assert.equal(
    planHotelArrival(
      tick({
        status: "blocked",
        blockedReason: "amount",
        amountCents: 90000,
        paymentUrl: "https://pay.hotel.test/1",
      })
    ).action,
    "pay"
  );
});

test("carte visuelle : le début reste masqué, le code agence ne se devine pas à la longueur", () => {
  assert.equal(cardLast4("4242 4242 4242 4242"), "4242");
  assert.equal(maskedCardNumber("4242"), "•••• •••• •••• 4242");
  assert.equal(maskedCardNumber(null), "•••• •••• •••• ••••");
  assert.equal(maskedCardNumber("12"), "•••• •••• •••• ••••");
  assert.equal(groupedPan("4242424242424242"), "4242 4242 4242 4242");
  const face = stayCardFace({
    itemId: "item-1",
    hotel: "Le Bristol",
    holder: "Camille Martin",
    last4: "42424",
    closed: false,
  });
  assert.equal(face.last4, null);
  assert.equal(Object.prototype.hasOwnProperty.call(face, "pan"), false);
  assert.equal(
    stayCardFace({ itemId: "item-1", hotel: "Le Bristol", holder: "Camille Martin", last4: "4242", closed: true }).last4,
    "4242"
  );
  const trip = tripStayCard([
    stayCardFace({ itemId: "h1", hotel: "Four Seasons", holder: "Arnaud", last4: "4242", closed: false }),
    stayCardFace({ itemId: "h2", hotel: "Le Bristol", holder: "Arnaud", last4: "1111", closed: false }),
  ]);
  assert.equal(trip?.itemId, "h1");
  assert.equal(trip?.hotel, "");
  assert.equal(
    tripStayCard([
      stayCardFace({ itemId: "h1", hotel: "Four Seasons", holder: "Arnaud", last4: "4242", closed: true }),
      stayCardFace({ itemId: "h2", hotel: "Four Seasons", holder: "Arnaud", last4: "4242", closed: false }),
    ])?.itemId,
    "h2"
  );
  assert.equal(tripStayCard([]) , null);
  assert.equal(stayRevealNeedsAgencyCode("client"), false);
  assert.equal(stayRevealNeedsAgencyCode("staff"), true);
});
