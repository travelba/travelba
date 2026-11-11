import assert from "node:assert/strict";
import test from "node:test";
import type { RatehawkConfig } from "./ratehawk/config";
import { parseRatehawkLookup, RatehawkLookupError, runRatehawkLookup } from "./ratehawk/lookup";
import { normalizeHotels, pickCompletion, presentHotels, type HotelCard } from "./ratehawk/search";

const today = new Date("2026-11-11T12:00:00Z");

const config = {
  environment: "production",
  baseUrl: "https://api.ratehawk.com",
  keyId: "key",
  apiKey: "secret",
  proxy: null,
  paymentType: "deposit",
  priceIncreasePercent: 10,
  marginPercent: 12,
  searchTimeoutSeconds: 30,
  prebookTimeoutMs: 60_000,
  bookingCutoffSeconds: 180,
  orderInfoDelaySeconds: 60,
  currency: "EUR",
  language: "fr",
  agencyEmail: "agence@travelba.fr",
  agencyPhone: "12345",
  webhookToken: "",
} satisfies RatehawkConfig;

const ok = { httpStatus: 200, status: "ok", error: null, data: {}, durationMs: 1 };

function stay(extra: Record<string, unknown> = {}) {
  return {
    arrivee: "2026-12-01",
    depart: "2026-12-03",
    recherche: [{ adultes: 2, enfants: [4] }],
    ...extra,
  };
}

function hotel(hid: number, hash = "h-1", amount = "100.00"): HotelCard {
  return {
    hid,
    name: `live-${hid}`,
    region_id: 1,
    images: ["https://cdn.worldota.net/t/640x400/live.jpeg"],
    rates: [
      {
        book_hash: hash,
        room_name: "Double",
        meal_code: "breakfast",
        meal_label: "Petit-déjeuner",
        payment_type: "deposit",
        amount,
        currency_code: "EUR",
        show_amount: amount,
        show_currency_code: "EUR",
        sell_amount: hash ? "112.00" : null,
        needs_card: false,
        excluded_taxes: [],
        penalties: [],
        free_cancellation_before: hash ? "2026-12-01T10:00:00" : null,
        rg_ext: null,
        room_images: [],
        room_amenities: [],
      },
    ],
  };
}

test("une ville ETG prime, un slug d’hôtel exact aussi", () => {
  const paris = pickCompletion("Paris", {
    regions: [
      { id: 2734, name: "Paris", type: "City", country_code: "FR" },
      { id: 99, name: "Paris, Texas", type: "City", country_code: "US" },
    ],
    hotels: [{ id: "paris-hotel", hid: 10, name: "Paris Hotel", region_id: 2734 }],
  });
  assert.deepEqual(paris, { kind: "region", id: 2734, nom: "Paris" });
  const sandbox = pickCompletion("test_hotel_do_not_book", {
    regions: [],
    hotels: [{ id: "test_hotel_do_not_book", hid: 8473727, name: "Test Hotel", region_id: 1 }],
  });
  assert.deepEqual(sandbox, { kind: "hotel", hid: 8473727, nom: "Test Hotel" });
  assert.equal(pickCompletion("8473727", { hotels: [{ id: "test_hotel_do_not_book", hid: 8473727, name: "Test Hotel" }] })?.kind, "hotel");
  assert.equal(pickCompletion("nulle part", { regions: [], hotels: [] }), null);
});

test("la fiche compacte sépare le net et la vente, et reprend images_ext", () => {
  const cards = normalizeHotels(
    {
      hotels: [
        {
          hid: 8473727,
          id: "test_hotel_do_not_book",
          rates: [
            {
              book_hash: "h-sandbox",
              room_name: "Standard Double",
              meal: "nomeal",
              payment_options: {
                payment_types: [
                  {
                    type: "deposit",
                    amount: "100.00",
                    show_amount: "100.00",
                    currency_code: "EUR",
                    show_currency_code: "EUR",
                    cancellation_penalties: { free_cancellation_before: "2026-12-01T12:00:00", policies: [] },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    { paymentType: "deposit", marginPercent: 12 },
    [],
    2,
    true
  );
  const view = presentHotels(cards, [
    {
      hid: 8473727,
      name: "Test Hotel (Do Not Book)",
      address: "1 Test Street",
      star_rating: 3,
      images: [],
      images_ext: [{ url: "https://cdn.worldota.net/t/{size}/content/test.jpeg" }],
    },
  ]);
  assert.equal(view.tronque, false);
  assert.equal(view.hotels.length, 1);
  const row = view.hotels[0];
  assert.equal(row.nom, "Test Hotel (Do Not Book)");
  assert.equal(row.hid, 8473727);
  assert.equal(row.etoiles, 3);
  assert.equal(row.adresse, "1 Test Street");
  assert.deepEqual(row.photos, ["https://cdn.worldota.net/t/640x400/content/test.jpeg"]);
  assert.deepEqual(row.tarifs[0], {
    hash: "h-sandbox",
    chambre: "Standard Double",
    repas: "Sans repas",
    net: "100.00",
    vente: "112.00",
    devise: "EUR",
    remboursable: true,
    annulation_gratuite_avant: "2026-12-01T12:00:00",
    paiement: "deposit",
  });
});

test("rechercher lit une région, des hid, ou la fiche, sans autre appel", async () => {
  const region = parseRatehawkLookup(stay({ destination: "Paris" }), today);
  assert.equal(region.residency, "fr");
  assert.deepEqual(region.guests, [{ adults: 2, children: [4] }]);
  let regionCalls = 0;
  const listed = await runRatehawkLookup(region, {
    config,
    complete: async (query, used) => {
      assert.equal(query, "Paris");
      assert.equal(used.language, "fr");
      assert.equal(used.currency, "EUR");
      return { call: ok, choice: { kind: "region", id: 2734, nom: "Paris" } };
    },
    searchRegion: async (input, regionId) => {
      regionCalls += 1;
      assert.equal(regionId, 2734);
      assert.equal(input.currency, "EUR");
      assert.equal(input.residency, "fr");
      assert.deepEqual(input.guests, [{ adults: 2, children: [4] }]);
      return { call: ok, hotels: Array.from({ length: 9 }, (_, index) => hotel(index + 1, "")) };
    },
    searchHids: async () => {
      throw new Error("hid");
    },
    hotelPage: async () => {
      throw new Error("fiche");
    },
    loadStatic: async () => [],
  });
  assert.equal(regionCalls, 1);
  assert.equal(listed.fiche, false);
  assert.equal(listed.ecrit, false);
  assert.equal(listed.langue, "fr");
  assert.equal(listed.prix, "net = prix ETG, vente = prix agence");
  assert.equal(listed.hotels.length, 8);
  assert.equal(listed.tronque, true);
  assert.deepEqual(listed.destination, { type: "region", id: 2734, nom: "Paris" });

  let sent: number[] = [];
  const byHid = await runRatehawkLookup(parseRatehawkLookup(stay({ hid: "8473727", hids: ["10004834"] }), today), {
    config,
    complete: async () => {
      throw new Error("complete");
    },
    searchHids: async (_input, hids) => {
      sent = hids;
      return { call: ok, hotels: [hotel(8473727, "")] };
    },
    loadStatic: async () => [
      {
        hid: 8473727,
        name: "Test Hotel (Do Not Book)",
        address: "1 Test Street",
        star_rating: 3,
        images: [],
        images_ext: [{ url: "https://cdn.worldota.net/t/{size}/content/test.jpeg" }],
      },
    ],
  });
  assert.deepEqual(sent, [8473727, 10004834]);
  assert.equal(byHid.hotels[0].nom, "Test Hotel (Do Not Book)");
  assert.equal(byHid.hotels[0].etoiles, 3);
  assert.equal(byHid.hotels[0].adresse, "1 Test Street");
  assert.equal(byHid.hotels[0].photos[0], "https://cdn.worldota.net/t/640x400/content/test.jpeg");
  assert.equal(byHid.destination, null);

  const page = hotel(8473727, "h-a");
  page.rates = [
    { ...page.rates[0], book_hash: "h-a", show_amount: "80.00" },
    { ...page.rates[0], book_hash: "h-b", show_amount: "90.00", free_cancellation_before: null, sell_amount: "100.80" },
    { ...page.rates[0], book_hash: "h-c", show_amount: "120.00" },
  ];
  let groups = 0;
  const opened = await runRatehawkLookup(parseRatehawkLookup(stay({ hid: 8473727, fiche: true }), today), {
    config,
    hotelPage: async (_input, hid, _used, roomGroups) => {
      assert.equal(hid, 8473727);
      groups = roomGroups?.length ?? 0;
      return { call: ok, hotel: page };
    },
    searchRegion: async () => {
      throw new Error("region");
    },
    searchHids: async () => {
      throw new Error("hid");
    },
    loadStatic: async () => [{ hid: 8473727, name: "Test Hotel", room_groups: [{ name: "Double" }] }],
  });
  assert.equal(groups, 1);
  assert.equal(opened.fiche, true);
  assert.deepEqual(
    opened.hotels[0].tarifs.map((rate) => rate.hash),
    ["h-a", "h-b", "h-c"]
  );
  assert.equal(opened.hotels[0].tarifs[1].remboursable, false);
  assert.equal(opened.hotels[0].tarifs[0].net, "80.00");
  assert.equal(opened.hotels[0].tarifs[0].vente, "112.00");
});

test("une recherche incomplète ou une fiche sans hid ne part pas", async () => {
  assert.throws(() => parseRatehawkLookup({ action: "rechercher" }, today), /incomplète/);
  assert.throws(() => parseRatehawkLookup(stay({}), today), /destination|region_id|hid/);
  assert.throws(() => parseRatehawkLookup(stay({ hids: [1, 1] }), today), /double/);
  assert.throws(() => parseRatehawkLookup(stay({ recherche: [{ adultes: 2, enfants: [18] }] }), today), /17 ans/);
  await assert.rejects(
    () =>
      runRatehawkLookup(parseRatehawkLookup(stay({ region_id: 2011, fiche: true }), today), {
        config,
        hotelPage: async () => {
          throw new Error("fiche");
        },
      }),
    (err: unknown) => err instanceof RatehawkLookupError && /seul hid/.test(err.message)
  );
  await assert.rejects(
    () =>
      runRatehawkLookup(parseRatehawkLookup(stay({ destination: "Paris" }), today), {
        config,
        complete: async () => ({ call: { httpStatus: 0, status: null, error: "timeout", data: null, durationMs: 1 }, choice: null }),
      }),
    /indisponible/
  );
  const partial = await runRatehawkLookup(parseRatehawkLookup(stay({ hid: 12 }), today), {
    config,
    searchHids: async () => ({
      call: { httpStatus: 200, status: "error", error: "partial", data: null, durationMs: 1 },
      hotels: [hotel(12, "h-12")],
    }),
    loadStatic: async () => [],
  });
  assert.equal(partial.hotels[0].tarifs[0].hash, "h-12");
  assert.equal(partial.hotels[0].tarifs[0].paiement, "deposit");
});
