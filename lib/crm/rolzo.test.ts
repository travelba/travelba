import assert from "node:assert/strict";
import test from "node:test";
import {
  addressLooksLikeAirport,
  placeFromBan,
  placeFromNominatim,
  placeFromPhoton,
  placeMatchesQuery,
  rolzoSearchQuery,
} from "./rolzo-place";
import {
  parseCancellationHours,
  parseRolzoRates,
  quoteAmountIn,
  rolzoBookingId,
  rolzoBooksWithoutCard,
  rolzoPaymentMode,
  rolzoPickUpDate,
} from "./rolzo";

test("heure de prise en charge au format Rolzo", () => {
  assert.equal(rolzoPickUpDate("2026-12-24T18:00:00"), "24/12/2026,6:00 PM");
  assert.equal(rolzoPickUpDate("2026-12-20T00:05:00"), "20/12/2026,12:05 AM");
  assert.equal(rolzoPickUpDate("2026-12-20T10:00:00"), "20/12/2026,10:00 AM");
  assert.equal(rolzoPickUpDate(null), null);
});

test("la facturation mensuelle seule réserve sans carte", () => {
  const account = {
    data: {
      paymentType: [
        { key: false, label: "deferredPayment", value: "Monthly billing" },
        { key: true, label: "deferredPaymentCard", value: "Deferred payment (book now, pay later)" },
      ],
    },
  };
  assert.equal(rolzoPaymentMode(account), "deferredPaymentCard");
  assert.equal(rolzoBooksWithoutCard(account), false);
  assert.equal(
    rolzoBooksWithoutCard({
      data: { paymentType: [{ key: true, label: "deferredPayment" }] },
    }),
    true
  );
});

test("un devis transfert se lit en euros, commission en plus", () => {
  const quotes = parseRolzoRates({
    meta: { success: true },
    data: [
      {
        vehicle: { label: "Mercedes-Benz E-Class", passenger: 2, luggage: 2, categoryChauffeured: "business" },
        rate: 100,
        currency: "EUR",
        benefits: { commissionWeight: 10, discountWeight: 0 },
        currencies: { to_usd: 2, to_eur: 1 },
        cancellationPolicy: { freeWaitingTime: "15 minutes", cancellation: "4 hours" },
        rateId: "rate-e",
      },
      {
        vehicle: { label: "Mercedes-Benz S-Class", passenger: 2, luggage: 2 },
        rate: 255,
        currency: "EUR",
        rateId: "rate-s",
        cancellationPolicy: { cancellation: "4 hours" },
      },
    ],
  });
  assert.equal(quotes[0].label, "Mercedes-Benz E-Class");
  assert.equal(quotes[0].amount, 100);
  assert.equal(quotes[0].commissionPercent, 10);
  assert.equal(quotes[0].cancellationHours, 4);
  assert.equal(quotes[1].amount, 255);
  assert.equal(quoteAmountIn(quotes[0], "EUR"), 100);
  assert.equal(quoteAmountIn(quotes[0], "USD"), 200);
  assert.equal(parseCancellationHours("4 hours"), 4);
  assert.equal(rolzoBookingId({ data: { bookingId: "bk_1" } }), "bk_1");
});

test("un code aéroport se géocode comme un aéroport", () => {
  assert.equal(rolzoSearchQuery("CDG · Paris"), "CDG airport");
  assert.equal(addressLooksLikeAirport("CDG · Paris"), true);
  assert.equal(addressLooksLikeAirport("228 Rue de Rivoli, 75001 Paris"), false);
  assert.equal(
    placeFromBan(
      {
        geometry: { coordinates: [2.55, 49.01] },
        properties: { city: "Paris", label: "Aéroport CDG", context: "95, Val-d'Oise, Île-de-France" },
      },
      "CDG"
    )?.country,
    "FR"
  );
  const airport = placeFromBan(
    {
      geometry: { coordinates: [2.55, 49.01] },
      properties: { city: "Roissy-en-France", label: "Aéroport Paris-Charles de Gaulle" },
    },
    "CDG"
  );
  const village = placeFromBan(
    {
      geometry: { coordinates: [0.1, 43.6] },
      properties: { city: "Couloumé-Mondebat", label: "Couloumé-Mondebat" },
    },
    "CDG"
  );
  assert.equal(airport ? placeMatchesQuery("CDG airport", airport) : false, true);
  assert.equal(village ? placeMatchesQuery("CDG airport", village) : true, false);
  const cdg = placeFromNominatim(
    {
      lat: "49.0068908",
      lon: "2.5710820",
      category: "aeroway",
      type: "aerodrome",
      name: "Aéroport de Paris-Charles-de-Gaulle",
      address: { town: "Tremblay-en-France", state: "Île-de-France", country_code: "fr" },
    },
    "CDG · Paris"
  );
  assert.equal(cdg?.city, "Tremblay-en-France");
  assert.equal(cdg?.country, "FR");
  assert.equal(cdg?.fullAddress, "Aéroport de Paris-Charles-de-Gaulle");
  assert.equal(
    placeFromNominatim(
      { lat: "49.0", lon: "2.5", category: "tourism", type: "hotel", name: "Holiday Inn CDG Airport", address: { country_code: "fr", city: "Roissy-en-France" } },
      "CDG"
    ),
    null
  );
  assert.equal(
    placeFromPhoton(
      {
        geometry: { coordinates: [2.55, 49.01] },
        properties: { name: "Charles de Gaulle", city: "Paris", countrycode: "fr", state: "Île-de-France" },
      },
      "CDG"
    )?.city,
    "Paris"
  );
});
