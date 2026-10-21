import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { guestNameOk, presentHotels } from "./hotel-journey";
import {
  HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID,
  HOTEL_SEARCH_BENJAMIN_USER_ID,
  clearHotelSearchCache,
  hotelSearchAllowed,
  hotelSearchCacheKey,
  mergeOffers,
  mergePlaceSuggestions,
  parseHotelSearchQuery,
  priceStayOffer,
  streamHotelSearch,
  stayPartyLabel,
  suggestionsFromCatalog,
  supplierRoomOccupancy,
  toClientHotel,
  type HotelOffer,
  type HotelStreamEvent,
  type PricedStay,
} from "./hotel-search";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function offer(partial: HotelOffer): HotelOffer {
  return partial;
}

function priced(partial: HotelOffer) {
  const stay = priceStayOffer(partial);
  assert.ok(stay);
  return stay;
}

test("Little Emperors : le prix proposé, jamais le net majoré", () => {
  const stay = priced({
    account: "little_emperors",
    hotelName: "Ritz",
    city: "Paris",
    proposed: 250,
    net: 100,
    currency: "EUR",
    benefits: ["Petit-déjeuner"],
  });
  assert.equal(stay.sellCents, 25000);
  assert.equal(
    priceStayOffer({
      account: "little_emperors",
      hotelName: "Ritz",
      city: "Paris",
      proposed: null,
      net: 100,
      currency: "EUR",
    }),
    null
  );
});

test("compte net : 12 % si le tarif n’est pas commissionnable, commission sinon", () => {
  assert.equal(
    priced({ account: "net", hotelName: "Ritz", city: "Paris", net: 100, currency: "EUR" }).sellCents,
    11200
  );
  assert.equal(
    priced({
      account: "net",
      hotelName: "Ritz",
      city: "Paris",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.1,
    }).sellCents,
    10000
  );
  assert.equal(
    priced({
      account: "net",
      hotelName: "Ritz",
      city: "Paris",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.05,
    }).sellCents,
    10500
  );
});

test("un hôtel, un prix : le moins cher, puis le plus d’avantages", () => {
  const cheaper = new Map<string, PricedStay>();
  mergeOffers(cheaper, [
    offer({
      account: "net",
      hotelName: "Ritz",
      city: "Paris",
      net: 200,
      currency: "EUR",
      benefits: ["Petit-déjeuner", "Surclassement"],
    }),
    offer({
      account: "little_emperors",
      hotelName: "Ritz",
      city: "Paris",
      proposed: 180,
      currency: "EUR",
    }),
  ]);
  assert.equal([...cheaper.values()][0].sellCents, 18000);

  const tied = new Map<string, PricedStay>();
  mergeOffers(tied, [
    offer({
      account: "net",
      hotelName: "Ritz",
      city: "Paris",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.1,
      benefits: ["Petit-déjeuner"],
    }),
    offer({
      account: "little_emperors",
      hotelName: "Ritz",
      city: "Paris",
      proposed: 100,
      currency: "EUR",
      benefits: ["Petit-déjeuner", "Surclassement"],
    }),
  ]);
  const winner = [...tied.values()][0];
  assert.equal(winner.sellCents, 10000);
  assert.equal(winner.score, 13);
  assert.equal(winner.account, "little_emperors");

  const same = new Map<string, PricedStay>();
  mergeOffers(same, [
    offer({
      account: "net",
      hotelName: "Ritz",
      city: "Paris",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.1,
      benefits: ["Petit-déjeuner"],
    }),
    offer({
      account: "little_emperors",
      hotelName: "Ritz",
      city: "Paris",
      proposed: 100,
      currency: "EUR",
      benefits: ["Petit-déjeuner quotidien"],
    }),
  ]);
  assert.equal([...same.values()][0].account, "net");
});

test("le client ne reçoit ni compte, ni net, ni commission, ni marque", () => {
  const stay = priced({
    account: "little_emperors",
    hotelName: "Ritz",
    city: "Paris",
    proposed: 250,
    currency: "EUR",
    benefits: ["Surclassement Little Emperors", "Petit-déjeuner"],
    freeCancellation: true,
  });
  assert.deepEqual(stay.benefits, ["Petit-déjeuner"]);
  assert.equal(stay.perks.breakfast, true);
  assert.equal(stay.perks.upgrade, false);
  assert.equal(stay.perks.freeCancellation, true);
  const client = toClientHotel(stay, 2, null);
  assert.equal(client.sellCents, 25000);
  assert.equal(client.perNightCents, 12500);
  const json = JSON.stringify(client);
  assert.equal(Object.hasOwn(client, "account"), false);
  assert.equal(json.includes("little_emperors"), false);
  assert.equal(json.includes("commission"), false);
  assert.equal(json.includes("\"net\""), false);
});

test("la recherche refuse une arrivée passée, zéro nuit, zéro voyageur, une lettre", () => {
  const today = "2026-10-21";
  assert.equal(
    parseHotelSearchQuery({ destination: "Paris", checkIn: "2026-10-20", checkOut: "2026-10-22", adults: 2 }, today).ok,
    false
  );
  assert.equal(
    parseHotelSearchQuery({ destination: "Paris", checkIn: "2026-10-22", checkOut: "2026-10-22", adults: 2 }, today).ok,
    false
  );
  assert.equal(
    parseHotelSearchQuery({ destination: "Paris", checkIn: "2026-10-22", checkOut: "2026-10-24", adults: 0 }, today).ok,
    false
  );
  assert.equal(
    parseHotelSearchQuery({ destination: "P", checkIn: "2026-10-22", checkOut: "2026-10-24", adults: 2 }, today).ok,
    false
  );
  const ok = parseHotelSearchQuery(
    { destination: "Paris", checkIn: "2026-10-22", checkOut: "2026-10-24", adults: 2 },
    today
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.nights, 2);
    assert.deepEqual(ok.query.rooms, [{ adults: 2, children: [] }]);
  }
});

test("les chambres portent les adultes et l’âge de chaque enfant, un hôtel choisi reste cet hôtel", () => {
  const today = "2026-10-21";
  const parsed = parseHotelSearchQuery(
    {
      destination: "Ritz",
      city: "Paris",
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
      rooms: [
        { adults: 2, children: [{ age: 5 }] },
        { adults: 1, children: [] },
      ],
      target: { kind: "hotel", id: 15 },
    },
    today
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.query.target?.kind, "hotel");
  assert.equal(parsed.query.target?.id, 15);
  assert.deepEqual(supplierRoomOccupancy(parsed.query.rooms), [
    { adults: 2, children: [{ age: 5 }] },
    { adults: 1, children: [] },
  ]);
  assert.equal(stayPartyLabel(parsed.query.rooms), "2 chambres, 3 adultes, 1 enfant");
  const otherAge = {
    ...parsed.query,
    rooms: [
      { adults: 2, children: [{ age: 7 }] },
      { adults: 1, children: [] },
    ],
  };
  assert.notEqual(hotelSearchCacheKey(parsed.query), hotelSearchCacheKey(otherAge));
  assert.equal(
    parseHotelSearchQuery(
      {
        destination: "Paris",
        checkIn: "2026-11-12",
        checkOut: "2026-11-14",
        rooms: [{ adults: 2, children: [{ age: 40 }] }],
      },
      today
    ).ok,
    false
  );
});

test("le premier compte répond avant le compte lent, le cache ne rappelle personne", async () => {
  clearHotelSearchCache();
  let slowDone = false;
  let release: (offers: HotelOffer[]) => void = () => {};
  const slow = new Promise<HotelOffer[]>((resolve) => {
    release = (offers) => {
      slowDone = true;
      resolve(offers);
    };
  });
  const events: HotelStreamEvent[] = [];
  let tick = 0;
  const clock = () => {
    tick += 10;
    return tick;
  };
  const done = (async () => {
    for await (const event of streamHotelSearch({
      accounts: [
        async () => [offer({ account: "net", hotelName: "Rapide", city: "Paris", net: 200, currency: "EUR" })],
        () => slow,
      ],
      cached: null,
      timeoutMs: 2000,
      clock,
    })) {
      events.push(event);
    }
  })();
  const started = Date.now();
  while (!events.some((event) => event.type === "hotel")) {
    if (Date.now() - started > 500) throw new Error("premier hôtel en attente");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const first = events.find((event) => event.type === "hotel");
  assert.equal(first && first.type === "hotel" && first.stay.hotelName, "Rapide");
  assert.equal(slowDone, false);
  assert.equal(events.some((event) => event.type === "done"), false);
  release([offer({ account: "net", hotelName: "Lent", city: "Lyon", net: 80, currency: "EUR" })]);
  await done;
  const finished = events.at(-1);
  assert.equal(finished?.type, "done");
  if (finished?.type === "done") {
    assert.equal(finished.cached, false);
    assert.equal(finished.count, 2);
    assert.ok(finished.tFirstMs != null && finished.tFirstMs < finished.tDoneMs);
    console.log(
      `[hotel-search perf] wallFirstMs=${Date.now() - started} tFirstMs=${finished.tFirstMs} tDoneMs=${finished.tDoneMs} cached=false`
    );
  }

  let called = 0;
  const cachedStay = priced({ account: "net", hotelName: "Cache", city: "Nice", net: 100, currency: "EUR" });
  const cachedEvents: HotelStreamEvent[] = [];
  for await (const event of streamHotelSearch({
    accounts: [
      async () => {
        called += 1;
        return [];
      },
    ],
    cached: [cachedStay],
  })) {
    cachedEvents.push(event);
  }
  assert.equal(called, 0);
  const last = cachedEvents.at(-1);
  assert.equal(last?.type, "done");
  if (last?.type === "done") assert.equal(last.cached, true);
});

test("allowlist : Benjamin par défaut, une variable remplace, vide ferme", () => {
  const open = {} as NodeJS.ProcessEnv;
  assert.equal(
    hotelSearchAllowed(
      { id: "11111111-1111-4111-8111-111111111111", auth_user_id: HOTEL_SEARCH_BENJAMIN_USER_ID },
      open
    ),
    true
  );
  assert.equal(hotelSearchAllowed({ id: HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID, auth_user_id: null }, open), true);
  assert.equal(hotelSearchAllowed({ id: "11111111-1111-4111-8111-111111111111", auth_user_id: null }, open), false);

  const replaced = { HOTEL_SEARCH_ALLOWLIST: "22222222-2222-4222-8222-222222222222" } as unknown as NodeJS.ProcessEnv;
  assert.equal(hotelSearchAllowed({ id: HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID, auth_user_id: HOTEL_SEARCH_BENJAMIN_USER_ID }, replaced), false);
  assert.equal(hotelSearchAllowed({ id: "22222222-2222-4222-8222-222222222222", auth_user_id: null }, replaced), true);

  const closed = { HOTEL_SEARCH_ALLOWLIST: "" } as unknown as NodeJS.ProcessEnv;
  assert.equal(hotelSearchAllowed({ id: HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID, auth_user_id: HOTEL_SEARCH_BENJAMIN_USER_ID }, closed), false);
});

test("suggestions : catalogue ville et hôtel, fusion sans doublon", () => {
  const catalog = suggestionsFromCatalog(
    [
      { hotel_name: "Ritz Paris", city: "Paris" },
      { hotel_name: "Autre", city: "Lyon" },
    ],
    "paris"
  );
  assert.ok(catalog.some((item) => item.kind === "ville" && item.label === "Paris"));
  assert.ok(catalog.some((item) => item.kind === "hotel" && item.label === "Ritz Paris"));
  const named = suggestionsFromCatalog([{ hotel_name: "Ritz Paris", city: "Paris", le_hotel_id: 15 }], "ritz");
  assert.equal(named.find((item) => item.kind === "hotel")?.id, 15);
  const kept = mergePlaceSuggestions([
    [{ label: "Ritz", kind: "hotel", detail: "Paris" }],
    [{ label: "Ritz", kind: "hotel", detail: "Paris", id: 15 }],
  ]);
  assert.equal(kept[0]?.id, 15);
  const merged = mergePlaceSuggestions([
    catalog,
    [
      { label: "Paris", kind: "ville", detail: "" },
      { label: "Rome", kind: "ville", detail: "" },
    ],
  ]);
  assert.equal(merged.filter((item) => item.label === "Paris" && item.kind === "ville").length, 1);
  assert.ok(merged.some((item) => item.label === "Rome"));
});

test("la liste se trie et se filtre, le nom de chambre exige prénom et nom", () => {
  const perks = {
    breakfast: false,
    freeCancellation: false,
    upgrade: false,
    credit: false,
    earlyCheckIn: false,
    lateCheckOut: false,
  };
  const hotels = [
    toClientHotel(priced({ account: "little_emperors", hotelName: "Ritz", city: "Paris", proposed: 300, currency: "EUR", benefits: ["Petit-déjeuner"], freeCancellation: true }), 2, "a"),
    toClientHotel(priced({ account: "little_emperors", hotelName: "Bristol", city: "Paris", proposed: 200, currency: "EUR" }), 2, "b"),
  ];
  assert.equal(presentHotels(hotels, "prix", []).map((hotel) => hotel.name).join(","), "Bristol,Ritz");
  assert.equal(presentHotels(hotels, "prix", ["breakfast"]).length, 1);
  assert.equal(presentHotels(hotels, "avantages", [])[0]?.name, "Ritz");
  assert.equal(guestNameOk("Jean"), false);
  assert.equal(guestNameOk("Jean D"), false);
  assert.equal(guestNameOk("Jean Du"), true);
  assert.equal(hotels[0]?.perks.breakfast, true);
  assert.equal(perks.breakfast, false);
});

test("l’accueil montre la recherche seulement à l’allowlist, sans nom de fournisseur", () => {
  const home = readFileSync(join(root, "app/mon-compte/page.tsx"), "utf8");
  const searchAt = home.indexOf("<HotelSearch");
  const encoursAt = home.indexOf("<HomeEncours");
  assert.ok(searchAt > 0 && searchAt < encoursAt);
  assert.match(home, /hotelSearchAllowed\(customer\) \? <HotelSearch \/> : null/);
  const ui = readFileSync(join(root, "components/account/HotelSearch.tsx"), "utf8");
  assert.doesNotMatch(ui, /little emperors|expedia|ratehawk|amadeus|\btaap\b/i);
  assert.match(ui, /data-t-client/);
  assert.match(ui, /data-t-server/);
  assert.match(ui, /loading=\{first \? "eager" : "lazy"\}/);
  assert.match(ui, /animate-pulse/);
  assert.match(ui, /Destinations/);
  assert.match(ui, /Hôtels/);
  assert.match(ui, /data-hotel-summary/);
  assert.match(ui, /data-hotel-sheet/);
  assert.match(ui, /data-hotel-themes/);
  assert.match(ui, /initialTheme \|\| "d"/);
  assert.match(ui, /Voir l’hôtel/);
  assert.doesNotMatch(ui, /bg-gradient|rounded-\[28px\]|commission/i);
  const themes = readFileSync(join(root, "lib/crm/hotel-journey.ts"), "utf8");
  assert.match(themes, /label: "Mix"/);
  const journey = readFileSync(join(root, "components/account/HotelJourney.tsx"), "utf8");
  assert.match(journey, /data-hotel-hero/);
  assert.match(journey, /data-hotel-rate-cta/);
  assert.match(journey, /data-hotel-detail/);
  assert.match(journey, /data-hotel-rate/);
  assert.match(journey, /data-hotel-guests/);
  assert.match(journey, /data-hotel-confirm/);
  assert.match(journey, /Choisir/);
  assert.doesNotMatch(journey, /bg-gradient|commission/i);
});
