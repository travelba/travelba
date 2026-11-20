import assert from "node:assert/strict";
import test from "node:test";
import { foldProviderRates } from "./hotel-providers/aggregate";
import { decideHotelMatch, distanceKm, hotelNameScore } from "./hotel-providers/matching";
import { expediaNotOpenBook, littleEmperorsBook, littleEmperorsCancel } from "./hotel-providers/outcomes";
import { littleEmperorsPort } from "./hotel-supplier";
import { priceStayOffer, type HotelOffer, type PricedStay } from "./hotel-search";
import type { NormalizedRate } from "./hotel-providers/types";

function stay(partial: HotelOffer): PricedStay {
  const priced = priceStayOffer(partial);
  assert.ok(priced);
  return priced;
}

function expediaRate(partial: Partial<NormalizedRate> & Pick<NormalizedRate, "providerHotelId" | "hotel">): NormalizedRate {
  return {
    provider: "expedia",
    providerRateToken: { propertyId: partial.providerHotelId },
    room: { label: "Chambre" },
    currency: "EUR",
    price: {
      totalInclusiveCents: 30000,
      currency: "EUR",
      baseRateCents: 25000,
      taxesAndServiceFeesCents: 5000,
      dueAtPropertyCents: 0,
      strikethroughCents: null,
      payNowCents: 30000,
      payLaterCents: 0,
    },
    agency: {
      supplierCostCents: null,
      commissionPct: null,
      commissionCents: null,
      markupCents: 0,
      discountCents: 0,
      earningCents: null,
      earningKind: "commission",
    },
    cancellation: { refundable: false, freeUntil: null, penalties: [], text: "Non remboursable." },
    payment: { collect: "supplier", merchantOfRecord: "supplier", needsCard: true },
    perks: [],
    legalLines: ["Taxes et frais groupés."],
    expiresAt: "2026-12-01T00:00:00.000Z",
    ...partial,
    hotel: partial.hotel,
    providerHotelId: partial.providerHotelId,
  };
}

test("rapprochement : GPS et nom confirment, le doute reste à vérifier", () => {
  assert.ok((distanceKm({ lat: 48.868, lng: 2.328 }, { lat: 48.8681, lng: 2.3281 }) || 99) < 0.15);
  assert.equal(hotelNameScore("Ritz Paris", "Hôtel Ritz Paris", "Paris"), 1);
  const confirmed = decideHotelMatch(
    { name: "Ritz Paris", city: "Paris", lat: 48.868, lng: 2.328 },
    { name: "Hôtel Ritz Paris", city: "Paris", address: "15 Place Vendôme", lat: 48.86805, lng: 2.32805 }
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.method, "geo_name");
  const review = decideHotelMatch(
    { name: "Four Seasons George V", city: "Paris" },
    { name: "Four Seasons Hotel George V", city: "Paris", address: "31 avenue George V" }
  );
  assert.equal(review.status, "proposed");
  const far = decideHotelMatch(
    { name: "Ritz Paris", city: "Paris", lat: 48.868, lng: 2.328 },
    { name: "Plaza Athénée", city: "Paris", lat: 48.866, lng: 2.303 }
  );
  assert.equal(far.status, "none");
});

test("fusion : deux offres confirmées côte à côte, le doute ne fusionne pas", () => {
  const le = stay({
    account: "little_emperors",
    hotelName: "Ritz Paris",
    city: "Paris",
    proposed: 280,
    currency: "EUR",
    hotelId: 42,
    coords: { lat: 48.868, lng: 2.328 },
    benefits: ["Petit-déjeuner"],
  });
  const george = stay({
    account: "little_emperors",
    hotelName: "Four Seasons George V",
    city: "Paris",
    proposed: 500,
    currency: "EUR",
  });
  const folded = foldProviderRates({
    stays: [le, george],
    nights: 2,
    audience: "client",
    expedia: [
      expediaRate({
        providerHotelId: "4242",
        hotel: { name: "Hôtel Ritz Paris", city: "Paris", coords: { lat: 48.86805, lng: 2.32805 } },
        price: {
          totalInclusiveCents: 24000,
          currency: "EUR",
          baseRateCents: null,
          taxesAndServiceFeesCents: 2500,
          dueAtPropertyCents: 1000,
          strikethroughCents: null,
          payNowCents: 24000,
          payLaterCents: 1000,
        },
      }),
      expediaRate({
        providerHotelId: "77",
        hotel: { name: "Four Seasons Hotel George V", city: "Paris" },
      }),
    ],
  });
  assert.equal(folded.updates.length, 1);
  assert.equal(folded.updates[0]?.hotelKey, le.hotelKey);
  assert.equal(folded.updates[0]?.compares.length, 2);
  assert.equal(folded.updates[0]?.compares[0]?.label, "Offre membre");
  assert.equal(folded.updates[0]?.compares[1]?.label, "Autre tarif");
  assert.equal(folded.updates[0]?.compares[1]?.sellCents, 24000);
  assert.equal(folded.updates[0]?.compares[1]?.taxesCents, 2500);
  assert.equal(JSON.stringify(folded.updates).includes("Expedia"), false);
  assert.equal(folded.reviews.length, 1);
  assert.equal(folded.created.length, 1);
  assert.equal(folded.created[0]?.compares[0]?.bookable, false);

  const agent = foldProviderRates({
    stays: [le],
    nights: 2,
    audience: "agent",
    expedia: [
      expediaRate({
        providerHotelId: "4242",
        hotel: { name: "Hôtel Ritz Paris", city: "Paris", coords: { lat: 48.86805, lng: 2.32805 } },
      }),
    ],
  });
  assert.deepEqual(
    agent.updates[0]?.compares.map((rate) => rate.label),
    ["Little Emperors", "Expedia"]
  );
});

test("Little Emperors : réserver et annuler restent les issues du port actuel", () => {
  const input = {
    idempotencyKey: "stay-1",
    hotelName: "Ritz",
    checkIn: "2026-12-01",
    checkOut: "2026-12-04",
    sellCents: 25000,
    currency: "EUR",
    expiresAt: "2026-12-01T00:00:00.000Z",
    partnerRate: true,
  };
  const quote = { ...input };
  assert.deepEqual(littleEmperorsBook(true, input), { ok: true, outcome: littleEmperorsPort(true).book(quote) });
  assert.deepEqual(littleEmperorsBook(false, input), { ok: false, reason: "not_contracted" });
  assert.deepEqual(littleEmperorsCancel(true, { idempotencyKey: "stay-1", confirmation: null, paid: false }), {
    ok: false,
    reason: "not_contracted",
  });
  const closed = expediaNotOpenBook();
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(closed.reason, "not_open");
});
