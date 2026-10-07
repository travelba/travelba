import assert from "node:assert/strict";
import test from "node:test";
import { identityOverwriteWarning } from "./identity";
import { loyaltyFromCustomer, normalizeLoyaltyMap, normalizeLoyaltyNumber } from "./loyalty";
import { encoursCaption, formatEncours, formatMoney, jMinusLabel, postedLedgerTotals } from "./money";
import { unsplashKeywordMatch, bookingCoverPlan, bookingCoverUrl } from "./covers";
import { stayArrivalPlaces } from "./carnet";
import {
  catalogCitiesWithoutPhoto,
  cityGeneratedCoverId,
  countryCodeForPlace,
  countryCoverPhoto,
  countriesWithPhoto,
  COUNTRY_CODES,
  lookupCoverPhoto,
} from "./cover-catalog";
import { vaultDocumentsForPerson } from "./trip-documents";
import { filterAgencyReceipts, filterCreditTransfers, isAgencyReceipt, isCreditTransfer, type CrmTravelDocument } from "./types";

test("identity overwrite warns only when names differ", () => {
  assert.equal(
    identityOverwriteWarning({ first_name: "Benjamin", last_name: "Boukris" }, { first_name: "Benjamin", last_name: "Boukris" }),
    null
  );
  assert.match(
    identityOverwriteWarning({ first_name: "Ben", last_name: "B" }, { first_name: "Benjamin", last_name: "Boukris" }) || "",
    /passeport indique Benjamin Boukris/
  );
});

test("loyalty map keeps every program", () => {
  assert.equal(normalizeLoyaltyNumber(" ab 12 "), "AB12");
  const mapped = normalizeLoyaltyMap({ flying_blue: "x", unknown: "nope" });
  assert.equal(mapped.flying_blue, "X");
  assert.equal(mapped.grand_voyageur, null);
  assert.equal(mapped.great_members, null);
  assert.equal("unknown" in mapped, false);
  const fromCustomer = loyaltyFromCustomer({ flying_blue: "FB1", loyalty: { miles_more: "MM" } });
  assert.equal(fromCustomer.flying_blue, "FB1");
  assert.equal(fromCustomer.miles_more, "MM");
  assert.equal(fromCustomer.grand_voyageur, null);
  const sncf = normalizeLoyaltyMap({ grand_voyageur: "gv 12", great_members: "cm 9" });
  assert.equal(sncf.grand_voyageur, "GV12");
  assert.equal(sncf.great_members, "CM9");
});

test("encours shows the signed amount", () => {
  assert.equal(formatEncours(1200), `Encours ${formatMoney(1200)}`);
  assert.equal(formatEncours(-2400), `Encours ${formatMoney(-2400)}`);
});

test("encours caption follows the sign", () => {
  assert.equal(encoursCaption(-2400), "Reste à régler");
  assert.equal(encoursCaption(1200), "Avoir");
  assert.equal(encoursCaption(0), "Compte à jour");
});

test("J-minus uses the real start date", () => {
  assert.equal(jMinusLabel(null), null);
  const ymd = (offset: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  assert.equal(jMinusLabel(ymd(0)), "Aujourd’hui");
  assert.equal(jMinusLabel(ymd(18)), "J - 18");
  assert.equal(jMinusLabel(ymd(-2)), null);
});

test("agency ledger keeps only credit transfers", () => {
  assert.equal(isCreditTransfer({ direction: "credit", kind: "transfer" }), true);
  assert.equal(isCreditTransfer({ direction: "debit", kind: "transfer" }), false);
  assert.equal(isCreditTransfer({ direction: "credit", kind: "adjustment" }), false);
  assert.equal(isCreditTransfer({ direction: "debit", kind: "booking" }), false);
  const kept = filterCreditTransfers([
    { direction: "credit", kind: "transfer" },
    { direction: "debit", kind: "booking" },
    { direction: "debit", kind: "adjustment" },
    { direction: "credit", kind: "adjustment" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].kind, "transfer");
  assert.equal(isAgencyReceipt({ direction: "credit", kind: "card_payment" }), true);
  assert.equal(isAgencyReceipt({ direction: "credit", kind: "transfer" }), true);
  assert.equal(isAgencyReceipt({ direction: "debit", kind: "card_payment" }), false);
  assert.equal(isAgencyReceipt({ direction: "credit", kind: "booking" }), false);
  const receipts = filterAgencyReceipts([
    { direction: "credit", kind: "transfer" },
    { direction: "credit", kind: "card_payment" },
    { direction: "debit", kind: "booking" },
  ]);
  assert.equal(receipts.length, 2);
});

test("ledger totals stay honest from posted movements", () => {
  const { credits, debits, settledPct } = postedLedgerTotals([
    { direction: "credit", amount: "9500" },
    { direction: "debit", amount: 14850 },
  ]);
  assert.equal(credits, 9500);
  assert.equal(debits, 14850);
  assert.equal(settledPct, 64);
});

test("cover catalogue matches the arrival place only", () => {
  const paris = unsplashKeywordMatch({ destination: "Paris", title: "Week-end" });
  const marrakech = unsplashKeywordMatch({
    destination: "Paris · Marrakech",
    title: "Voyage",
  });
  assert.ok(paris);
  assert.ok(marrakech);
  assert.notEqual(marrakech, paris);
  assert.equal(
    unsplashKeywordMatch({ destination: "Avoriaz", title: "Avoriaz" }),
    "photo-1674043613875-eabfa5a45425"
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "CDG → RAK", title: "Vol" }),
    marrakech
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Tel Aviv", title: "Tel Aviv" }),
    "photo-1528791075103-b149f525eb22"
  );
  assert.equal(unsplashKeywordMatch({ destination: "Provence", title: "Séjour" }), "photo-city-provence");
  assert.notEqual(unsplashKeywordMatch({ destination: "Provence", title: "Séjour" }), paris);
  assert.equal(unsplashKeywordMatch({ destination: "Bordeaux", title: "Séjour" }), "photo-city-bordeaux");
  assert.notEqual(unsplashKeywordMatch({ destination: "Bordeaux", title: "Séjour" }), paris);
  assert.equal(unsplashKeywordMatch({ destination: "France", title: "Séjour" }), paris);
  assert.equal(unsplashKeywordMatch({ destination: "Italie", title: "Voyage" }), "photo-1552832230-c0197dd311b5");
  assert.equal(
    unsplashKeywordMatch({ destination: "Florence", title: "Séjour" }),
    "photo-city-florence"
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Florence", title: "Séjour" }),
    unsplashKeywordMatch({ destination: "Italie", title: "Voyage" })
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Venise", title: "Séjour" }),
    unsplashKeywordMatch({ destination: "Italie", title: "Voyage" })
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Avoriaz", title: "Avoriaz" }),
    paris
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Marrakech", title: "Séjour" }),
    unsplashKeywordMatch({ destination: "Maroc", title: "Séjour" })
  );
  assert.equal(unsplashKeywordMatch({ destination: "Alpes", title: "Ski" }), null);
  assert.equal(
    unsplashKeywordMatch({ destination: "Lago di Como", title: "Lac" }),
    "photo-city-lago-di-como"
  );
  const bordeauxStay = bookingCoverPlan(
    { destination: "Bordeaux", title: "Séjour", cover_image_path: null },
    {
      items: [
        { kind: "flight", details: { city_from: "Paris", city_to: "Bordeaux" } },
        { kind: "hotel", details: { city: "Bordeaux" } },
      ],
    }
  );
  assert.equal(bordeauxStay.mode, "single");
  if (bordeauxStay.mode === "single") {
    assert.match(bordeauxStay.src, /photo-city-bordeaux/);
    assert.doesNotMatch(bordeauxStay.src, /photo-1502602898657/);
  }
  for (const key of catalogCitiesWithoutPhoto()) {
    const id = lookupCoverPhoto(key);
    assert.equal(id, cityGeneratedCoverId(key));
    const country = countryCodeForPlace(key);
    const countryPhoto = country ? countryCoverPhoto(country) : null;
    if (countryPhoto) assert.notEqual(id, countryPhoto);
  }
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Miami", title: "Miami" }),
    unsplashKeywordMatch({ destination: "Panama City", title: "Panama" })
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Antibes", title: "Séjour" }),
    "photo-antibes-garoupe"
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Lamego · Portugal", title: "Lamego · Portugal" }),
    "photo-lamego-remedios"
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Lamego", title: "Séjour" }),
    unsplashKeywordMatch({ destination: "Portugal", title: "Séjour" })
  );
  const lamegoStay = bookingCoverPlan(
    {
      destination: "Lamego · Portugal",
      title: "Lamego · Portugal",
      cover_image_path: null,
    },
    { items: [{ kind: "hotel", details: { city: "Lamego" } }] }
  );
  assert.equal(lamegoStay.mode, "single");
  if (lamegoStay.mode === "single") assert.match(lamegoStay.src, /photo-lamego-remedios/);
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Antibes", title: "Séjour" }),
    unsplashKeywordMatch({ destination: "France", title: "Séjour" })
  );
  assert.equal(unsplashKeywordMatch({ destination: "Xyzzy", title: "Inconnu" }), null);
  const marrakechPhoto = unsplashKeywordMatch({ destination: "Marrakech", title: "Séjour" });
  const moroccoPhoto = unsplashKeywordMatch({ destination: "Maroc", title: "Séjour" });
  assert.equal(
    unsplashKeywordMatch({ destination: "Aghouatim", title: "Aghouatim" }),
    marrakechPhoto
  );
  assert.notEqual(
    unsplashKeywordMatch({ destination: "Aghouatim", title: "Aghouatim" }),
    moroccoPhoto
  );
  const ranch = bookingCoverPlan({
    destination: "Aghouatim",
    title: "The Ranch resort",
    cover_image_path: null,
  });
  assert.equal(ranch.mode, "single");
  if (ranch.mode === "single") assert.match(ranch.src, /photo-1677837488142-a85ffbffe408/);
  const tahannaout = bookingCoverPlan(
    { destination: "40 ans", title: "40 ans", cover_image_path: null },
    { places: ["Tahannaout"] }
  );
  assert.equal(tahannaout.mode, "single");
  if (tahannaout.mode === "single") assert.match(tahannaout.src, /photo-1677837488142-a85ffbffe408/);
  const addressed = bookingCoverPlan(
    { destination: "Séjour", title: "Séjour", cover_image_path: null },
    { items: [{ kind: "hotel", details: { city: "Douar", address: "Route de Marrakech, Maroc" } }] }
  );
  assert.equal(addressed.mode, "single");
  if (addressed.mode === "single") assert.match(addressed.src, /photo-1677837488142-a85ffbffe408/);
  const countryOnly = bookingCoverPlan(
    { destination: "Séjour", title: "Séjour", cover_image_path: null },
    { items: [{ kind: "hotel", details: { city: "Douar", country: "Maroc" } }] }
  );
  assert.equal(countryOnly.mode, "single");
  if (countryOnly.mode === "single") assert.match(countryOnly.src, /photo-1489749798305-4fea3ae63d43/);
  const portugal = unsplashKeywordMatch({ destination: "Portugal", title: "Séjour" });
  assert.ok(portugal);
  assert.equal(
    unsplashKeywordMatch({ destination: "Inconnue · Portugal", title: "Séjour" }),
    portugal
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Inconnue, Portugal", title: "Séjour" }),
    portugal
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Paris · Inconnue · Portugal", title: "Séjour" }),
    portugal
  );
  const unknownHotel = bookingCoverPlan(
    {
      destination: "Inconnue · Portugal",
      title: "Séjour",
      cover_image_path: null,
    },
    { items: [{ kind: "hotel", details: { city: "Inconnue" } }] }
  );
  assert.equal(unknownHotel.mode, "single");
  if (unknownHotel.mode === "single") assert.match(unknownHotel.src, /photo-1585208798174-6cedd86e019a/);
  assert.equal(unsplashKeywordMatch({ destination: "Inconnue, Belgique", title: "Séjour" }), null);
  assert.equal(
    bookingCoverUrl({
      destination: "Inconnue, Belgique",
      title: "Séjour",
      cover_image_path: null,
    }),
    null
  );
  assert.equal(
    bookingCoverUrl({
      destination: "Xyzzy",
      title: "Inconnu",
      cover_image_path: null,
    }),
    null
  );
  const uploaded = bookingCoverUrl(
    {
      destination: "Marrakech",
      title: "Voyage",
      cover_image_path: "bookings/abc/cover.webp",
      updated_at: "2026-09-23T10:00:00.000Z",
    },
    960
  );
  if (!uploaded) throw new Error("couverture importée attendue");
  assert.match(uploaded, /^\/api\/files\?path=/);
  assert.match(uploaded, /v=2026-09-23/);
  assert.ok(COUNTRY_CODES.length >= 190);
  assert.ok(countriesWithPhoto() >= 30);
});

test("deux villes ont chacune leur image, deux pays se coupent", () => {
  const miami = unsplashKeywordMatch({ destination: "Miami Beach", title: "Miami Beach" });
  assert.equal(miami, "photo-1533106497176-45ae19e68ba2");
  const both = bookingCoverPlan({
    destination: "Miami Beach",
    title: "Miami Beach",
    cover_image_path: null,
  }, {
    places: stayArrivalPlaces(null, null, [
      { kind: "flight", details: { city_to: "New York", city_from: "Paris" } },
      { kind: "hotel", details: { city: "New York" } },
      { kind: "flight", details: { city_to: "Miami", city_from: "New York" } },
      { kind: "hotel", details: { city: "Miami Beach" } },
    ]),
  });
  assert.equal(both.mode, "split");
  if (both.mode !== "split") return;
  assert.match(both.src, /photo-1496442226666-8d4d0e62e6e9/);
  assert.match(both.srcB, /photo-1533106497176-45ae19e68ba2/);

  const morocco = bookingCoverPlan({
    destination: "Marrakech · Essaouira",
    title: "Séjour",
    cover_image_path: null,
  });
  assert.equal(morocco.mode, "split");
  if (morocco.mode !== "split") return;
  assert.match(morocco.src, /photo-1677837488142-a85ffbffe408/);
  assert.match(morocco.srcB, /photo-city-essaouira/);

  const split = bookingCoverPlan({
    destination: "Marrakech",
    title: "Voyage",
    cover_image_path: null,
  }, {
    places: ["Marrakech", "New York"],
  });
  assert.equal(split.mode, "split");
  if (split.mode !== "split") return;
  assert.match(split.src, /photo-1489749798305-4fea3ae63d43/);
  assert.match(split.srcB, /photo-1496442226666-8d4d0e62e6e9/);
});

test("vault documents for a person ignore trip clones", () => {
  const docs = [
    {
      id: "vault",
      customer_id: "c1",
      companion_id: null,
      booking_id: null,
      traveler_id: null,
      doc_type: "passport",
      number: "12AB",
      created_at: "2026-01-02",
    },
    {
      id: "trip",
      customer_id: "c1",
      companion_id: null,
      booking_id: "b1",
      traveler_id: "t1",
      doc_type: "passport",
      number: "12AB",
      created_at: "2026-01-03",
    },
  ] as CrmTravelDocument[];
  assert.deepEqual(vaultDocumentsForPerson(docs, null).map((doc) => doc.id), ["vault"]);
});
