import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collapseRooms, guestNameOk, hotelJourneySearch, hotelJourneyStep, presentHotels, type ClientRate } from "./hotel-journey";
import {
  HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID,
  HOTEL_SEARCH_BENJAMIN_USER_ID,
  clearHotelSearchCache,
  defaultHotelStay,
  hotelSearchAllowed,
  hotelSearchCacheKey,
  hotelSearchDraft,
  mergeOffers,
  offerBeats,
  mergePlaceSuggestions,
  nightsBetween,
  parseHotelSearchDraft,
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

test("une offre : le moins cher, à l’arrondi près celle qui a le plus d’avantages", () => {
  const plain = { currency: "EUR", score: 1, benefits: ["Séjour"] };
  const rich = { currency: "EUR", score: 13, benefits: ["Petit-déjeuner", "Surclassement"] };
  assert.equal(offerBeats({ ...rich, sellCents: 20000 }, { ...plain, sellCents: 15000 }), true);
  assert.equal(offerBeats({ ...plain, sellCents: 20000 }, { ...rich, sellCents: 20080 }), true);
  assert.equal(offerBeats({ ...plain, sellCents: 20000 }, { ...rich, sellCents: 20300 }), false);

  const near = new Map<string, PricedStay>();
  mergeOffers(near, [
    offer({
      account: "net",
      hotelName: "Molitor",
      city: "Paris",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.1,
      benefits: ["Petit-déjeuner"],
    }),
    offer({
      account: "little_emperors",
      hotelName: "Molitor",
      city: "Paris",
      proposed: 100.5,
      currency: "EUR",
      benefits: ["Petit-déjeuner", "Surclassement"],
    }),
  ]);
  assert.equal([...near.values()][0].account, "little_emperors");

  const cheaper = new Map<string, PricedStay>();
  mergeOffers(cheaper, [
    offer({
      account: "net",
      hotelName: "Normandy",
      city: "Deauville",
      net: 100,
      currency: "EUR",
      commissionable: true,
      hotelCommission: 0.1,
    }),
    offer({
      account: "little_emperors",
      hotelName: "Normandy",
      city: "Deauville",
      proposed: 102,
      currency: "EUR",
      benefits: ["Petit-déjeuner", "Surclassement"],
    }),
  ]);
  assert.equal([...cheaper.values()][0].account, "net");

  const perks = {
    breakfast: false,
    freeCancellation: false,
    upgrade: false,
    credit: false,
    earlyCheckIn: false,
    lateCheckOut: false,
  };
  const roomRate = (room: string, sellCents: number, extra: Partial<ClientRate>): ClientRate => ({
    offerId: room,
    room,
    title: extra.title || "Séjour",
    detail: "",
    cancellation: extra.cancellation || "Gratuite",
    benefits: extra.benefits || [],
    footnotes: [],
    perks: extra.perks || perks,
    sellCents,
    perNightCents: sellCents,
    currency: "EUR",
    images: [],
  });
  const rooms = collapseRooms([
    {
      name: "Chambre deluxe",
      detail: "",
      images: [],
      rates: [
        roomRate("Chambre deluxe", 20000, { cancellation: "Non remboursable", benefits: [] }),
        roomRate("Chambre deluxe", 20040, {
          title: "Avec petit-déjeuner",
          cancellation: "Gratuite",
          benefits: ["Petit-déjeuner"],
          perks: { ...perks, breakfast: true, freeCancellation: true },
        }),
      ],
    },
    {
      name: "chambre deluxe",
      detail: "",
      images: [],
      rates: [roomRate("chambre deluxe", 18000, { benefits: [], title: "Autre compte" })],
    },
    {
      name: "Suite",
      detail: "",
      images: [],
      rates: [roomRate("Suite", 40000, { benefits: ["Surclassement"], perks: { ...perks, upgrade: true } })],
    },
  ]);
  assert.equal(rooms.length, 2);
  const deluxe = rooms.find((room) => room.name === "Chambre deluxe");
  assert.equal(deluxe?.rates.length, 1);
  assert.equal(deluxe?.rates[0].sellCents, 18000);
  assert.equal(rooms.find((room) => room.name === "Suite")?.rates.length, 1);
  assert.equal(hotelJourneyStep("chambre"), "room");
  assert.equal(hotelJourneyStep("voyageurs"), "guests");
  assert.equal(hotelJourneyStep(null), "hotel");
  assert.equal(hotelJourneySearch("12", "guests"), "hotel=12&etape=voyageurs");
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

test("un compte qui échoue signale l’erreur et n’invente pas d’hôtel", async () => {
  const events: HotelStreamEvent[] = [];
  for await (const event of streamHotelSearch({
    accounts: [async () => Promise.reject(new Error("supplier"))],
    cached: null,
    timeoutMs: 1000,
  })) {
    events.push(event);
  }
  assert.equal(events.some((event) => event.type === "supplier_error"), true);
  const finished = events.at(-1);
  assert.equal(finished?.type, "done");
  if (finished?.type === "done") assert.equal(finished.count, 0);
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

test("le client lit la chambre, la ville et l’annulation en français", () => {
  const stay = priced({
    account: "little_emperors",
    hotelName: "Ritz",
    city: "London",
    proposed: 400,
    currency: "EUR",
    roomLabel: "Deluxe King Room with City View",
    rateTitle: "Flexible Rate, Bed and Breakfast",
    cancellation: "Free cancellation until 18:00 on 12 Mar 2026",
    benefits: ["Room upgrade"],
    description: "Located in the heart of Mayfair, this hotel offers a swimming pool.",
  });
  assert.equal(stay.city, "Londres");
  assert.equal(stay.roomLabel, "Chambre deluxe, lit king, vue ville");
  assert.equal(stay.rateTitle, "Tarif flexible · Petit-déjeuner inclus");
  assert.equal(stay.cancellation, "Gratuite jusqu’au 12 mars 2026, 18 h");
  assert.deepEqual(stay.benefits, ["Surclassement"]);
  assert.match(stay.description, /au cœur de Mayfair/i);
  assert.match(stay.description, /piscine/);
  assert.doesNotMatch(`${stay.roomLabel} ${stay.rateTitle} ${stay.cancellation} ${stay.description}`, /\b(room|free cancellation|breakfast|located)\b/i);
});

test("l’accueil montre la recherche seulement à l’allowlist, sans nom de fournisseur", () => {
  const home = readFileSync(join(root, "app/mon-compte/page.tsx"), "utf8");
  const shortcutAt = home.indexOf("/mon-compte/hotels");
  const encoursAt = home.indexOf("<HomeEncours");
  assert.ok(shortcutAt > 0 && shortcutAt < encoursAt);
  assert.match(home, /hotelSearchAllowed\(customer\)/);
  assert.doesNotMatch(home, /<HotelSearch/);
  const hotelsPage = readFileSync(join(root, "app/mon-compte/hotels/page.tsx"), "utf8");
  assert.match(hotelsPage, /hotelSearchAllowed/);
  assert.match(hotelsPage, /<HotelSearch/);
  const chrome = readFileSync(join(root, "components/account/AccountChrome.tsx"), "utf8");
  assert.match(chrome, /AccountNightTabs/);
  assert.match(chrome, /suffix !== "\/hotels"/);
  assert.match(chrome, /label: "Hôtels"/);
  assert.match(chrome, /label: "Réservations"/);
  assert.match(chrome, /label: "Transactions"/);
  assert.match(chrome, /label: "Mon compte"/);
  const night = readFileSync(join(root, "components/account/AccountNightTabs.tsx"), "utf8");
  assert.match(night, /account-tabbar-night/);
  assert.match(night, /\["home", "stay", "hotel", "ledger", "account"\]/);
  assert.match(night, /account-hotel-fab/);
  assert.match(night, /rounded-full/);
  assert.match(night, /min-h-11/);
  assert.match(night, /safe-area-inset-bottom/);
  assert.match(night, /text-\[10px\]/);
  assert.doesNotMatch(night, /gradient/);
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
  assert.match(ui, /data-hotel-theme="a"/);
  assert.doesNotMatch(ui, /data-hotel-themes|Noir & or|Éditorial|Mix|Nuit/);
  assert.match(ui, /Voir l’hôtel/);
  assert.doesNotMatch(ui, /bg-gradient|rounded-\[28px\]|commission/i);
  const themes = readFileSync(join(root, "lib/crm/hotel-journey.ts"), "utf8");
  assert.doesNotMatch(themes, /label: "Mix"|HotelThemeId/);
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  const nightRule = css.indexOf(".account-tabbar.account-tabbar-night");
  assert.ok(nightRule > css.indexOf(".account-tabbar {"));
  assert.match(css.slice(nightRule), /#c5a880|#C5A880|account-tabbar-plate/);
  assert.match(css, /account-tabbar-plate/);
  assert.match(css, /calc\(3\.5rem \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.doesNotMatch(css, /data-hotel-theme="b"|data-hotel-theme="c"|data-hotel-theme="d"/);
  const supplier = readFileSync(join(root, "lib/crm/little-emperors-search.ts"), "utf8");
  assert.match(supplier, /SEARCH_TIMEOUT_MS = 25_000/);
  assert.match(supplier, /SUGGEST_TIMEOUT_MS = 8_000/);
  const searchRoute = readFileSync(join(root, "app/api/client/hotels/search/route.ts"), "utf8");
  assert.match(searchRoute, /timeoutMs: 55_000/);
  assert.match(searchRoute, /supplierFailed && stays.length === 0/);
  assert.match(searchRoute, /loadKnownHotelOffers/);
  assert.match(searchRoute, /londres/);
  const suggestRoute = readFileSync(join(root, "app/api/client/hotels/suggest/route.ts"), "utf8");
  assert.doesNotMatch(suggestRoute, /setTimeout\(\(\) => resolve\(\[\]\), 280\)/);
  assert.match(suggestRoute, /remoteFailed/);
  assert.match(suggestRoute, /londres/);
  const journey = readFileSync(join(root, "components/account/HotelJourney.tsx"), "utf8");
  assert.match(ui, /journeyQuery/);
  assert.match(journey, /data-hotel-hero/);
  assert.match(journey, /data-hotel-rate-cta/);
  assert.match(journey, /data-hotel-detail/);
  assert.match(journey, /data-hotel-rate/);
  assert.match(journey, /data-hotel-guests/);
  assert.match(journey, /data-hotel-confirm/);
  assert.match(journey, /Sélectionner/);
  assert.match(journey, /data-hotel-rooms/);
  assert.match(journey, /Privilèges Travel BA/);
  assert.match(journey, /h-serif/);
  assert.doesNotMatch(journey, /little emperors|luminous|virtuoso|marriott/i);
  assert.match(journey, /data-hotel-dock/);
  assert.match(journey, /data-hotel-steps/);
  assert.match(journey, /data-hotel-gallery/);
  assert.match(journey, /Pension/);
  assert.match(journey, /Je ne voyage pas/);
  assert.match(journey, /Ajouter un occupant/);
  assert.match(journey, /createPortal/);
  assert.match(css, /\.h-journey \{\s*position: fixed;\s*z-index: 46;\s*top: 0;/);
  assert.match(css, /100dvh/);
  assert.doesNotMatch(journey, />Avantages</);
  assert.doesNotMatch(ui, />Avantages</);
  assert.match(journey, /collapseRooms/);
  assert.match(readFileSync(join(root, "app/api/client/hotels/fiche/route.ts"), "utf8"), /collapseRooms/);
  assert.match(ui, /Où souhaitez-vous séjourner/);
  assert.match(ui, /data-hotel-ask/);
  assert.match(ui, /data-hotel-destination/);
  assert.match(ui, /data-hotel-dates/);
  assert.match(ui, /data-hotel-party/);
  assert.match(ui, /data-hotel-search-cta/);
  assert.match(ui, />\s*Rechercher\s*</);
  assert.match(ui, /Destination ou hôtel/);
  assert.match(ui, /data-hotel-recent/);
  assert.match(ui, /data-hotel-inspiration/);
  assert.match(ui, /Recherches récentes/);
  assert.match(ui, /Inspiration/);
  assert.match(ui, /hotel-search-last/);
  assert.match(ui, /pointer: coarse/);
  assert.doesNotMatch(ui, /autoFocus/);
  assert.match(css, /\.h-ask \{/);
  assert.match(css, /padding: 1\.25rem 1rem 2\.75rem/);
  assert.match(css, /hotel-step/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(journey, /bg-gradient|rounded-full|commission/i);
});

test("le formulaire propose un vendredi, deux nuits, au moins quatorze jours plus tard", () => {
  const friday = defaultHotelStay("2026-10-23");
  assert.equal(friday.checkIn, "2026-11-06");
  assert.equal(friday.checkOut, "2026-11-08");
  assert.equal(nightsBetween(friday.checkIn, friday.checkOut), 2);
  assert.equal(new Date(`${friday.checkIn}T00:00:00Z`).getUTCDay(), 5);
  const saturday = defaultHotelStay("2026-10-24");
  assert.equal(saturday.checkIn, "2026-11-13");
  assert.equal(saturday.checkOut, "2026-11-15");
  assert.ok(saturday.checkIn >= "2026-11-07");

  const fresh = hotelSearchDraft("2026-10-23", null);
  assert.equal(fresh.destination, "");
  assert.equal(fresh.checkIn, "2026-11-06");
  assert.deepEqual(fresh.rooms, [{ adults: 2, children: [] }]);

  const kept = hotelSearchDraft("2026-10-23", {
    destination: "Ritz Paris",
    city: "Paris",
    checkIn: "2026-12-01",
    checkOut: "2026-12-04",
    rooms: [{ adults: 1, children: [4] }],
    target: { kind: "hotel", id: 12 },
  });
  assert.equal(kept.destination, "Ritz Paris");
  assert.equal(kept.checkIn, "2026-12-01");
  assert.equal(kept.rooms[0]?.adults, 1);

  const expired = hotelSearchDraft("2026-10-23", {
    destination: "Paris",
    city: "",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    rooms: [{ adults: 2, children: [] }],
    target: { kind: "ville", id: 3 },
  });
  assert.equal(expired.destination, "Paris");
  assert.equal(expired.checkIn, "2026-11-06");
  assert.equal(expired.target?.id, 3);

  assert.equal(parseHotelSearchDraft({ destination: "Paris" }), null);
  assert.equal(parseHotelSearchDraft(null), null);
});

test("un délai du fournisseur n’est pas une liste vide", async () => {
  const { loadLittleEmperorsOffers, loadLittleEmperorsSuggestions } = await import("./little-emperors-search");
  const previousKey = process.env.LITTLE_EMPERORS_API_KEY;
  process.env.LITTLE_EMPERORS_API_KEY = "test-key";
  const timeout = new Error("timeout");
  timeout.name = "TimeoutError";
  const fetchImpl: typeof fetch = async () => {
    throw timeout;
  };
  try {
    await assert.rejects(
      () =>
        loadLittleEmperorsOffers({
          destination: "Paris",
          checkIn: "2026-11-12",
          checkOut: "2026-11-14",
          rooms: [{ adults: 2, children: [] }],
          target: { kind: "ville", id: 12 },
          fetchImpl,
        }),
      /supplier/
    );
    assert.equal(await loadLittleEmperorsSuggestions("Paris", fetchImpl), null);
    const { loadKnownHotelOffers } = await import("./little-emperors-search");
    const knownFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { hotel_id?: number };
      if (body.hotel_id === 2) {
        const err = new Error("timeout");
        err.name = "TimeoutError";
        throw err;
      }
      return new Response(
        JSON.stringify([
          {
            hotel_id: body.hotel_id,
            hotel_name: "Hôtel de test",
            is_available: true,
            hotel_info: { location: "Paris, France" },
            lowest_rate: { total_to_book: 200, currency_code: "EUR", requested_currency_code: "EUR" },
          },
        ]),
        { status: 200 }
      );
    };
    const known = await loadKnownHotelOffers({
      destination: "Paris",
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
      rooms: [{ adults: 2, children: [] }],
      hotelIds: [1, 2, 1],
      fetchImpl: knownFetch,
    });
    assert.equal(known.length, 1);
    assert.equal(known[0]?.hotelId, 1);
    assert.equal(known[0]?.net, null);
    const { clearHotelGalleryCache } = await import("./hotel-gallery");
    clearHotelGalleryCache();
  } finally {
    if (previousKey === undefined) delete process.env.LITTLE_EMPERORS_API_KEY;
    else process.env.LITTLE_EMPERORS_API_KEY = previousKey;
  }
});

test("la fiche hôtel prend la galerie du catalogue, façade puis hall", async () => {
  const { loadLittleEmperorsHotelFile } = await import("./little-emperors-search");
  const { clearHotelGalleryCache } = await import("./hotel-gallery");
  clearHotelGalleryCache();
  const previousKey = process.env.LITTLE_EMPERORS_API_KEY;
  process.env.LITTLE_EMPERORS_API_KEY = "test-key";
  const cdn = "https://d13bre0qp8legl.cloudfront.net/hotels/184";
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/hotels/184")) {
      return new Response(
        JSON.stringify({
          name: "Prince De Galles",
          images_gallery: [
            { image_url: `${cdn}/restaurant.jpg`, description: "Restaurant" },
            { image_url: `${cdn}/lobby.jpg`, description: "Lobby" },
            { image_url: `${cdn}/exterior.jpg`, description: "Exterior" },
            { image_url: `${cdn}/suite.jpg`, description: "Suite Vendome" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/v2/hotels/availability")) {
      return new Response(
        JSON.stringify([
          {
            hotel_id: 184,
            hotel_name: "Prince De Galles",
            is_available: true,
            hotel_info: { location: "Paris, France", images: [{ url: "https://cdn.example/partner.jpg" }] },
            room_types: [
              {
                name: "Deluxe Room",
                images: [{ url: "https://cdn.example/room.jpg" }],
                rates: [{ title: "Best Available Rate", total_to_book: 900, currency_code: "EUR" }],
              },
            ],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/v2/hotels/184")) {
      return new Response(
        JSON.stringify({
          name: "Prince De Galles",
          images: [{ url: "https://cdn.example/partner.jpg" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("no", { status: 404 });
  };
  try {
    const loaded = await loadLittleEmperorsHotelFile({
      hotelId: 184,
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
      rooms: [{ adults: 2, children: [] }],
      fetchImpl,
    });
    assert.deepEqual(loaded?.profile.images, [
      `${cdn}/exterior.jpg`,
      `${cdn}/lobby.jpg`,
      `${cdn}/restaurant.jpg`,
      `${cdn}/suite.jpg`,
    ]);
    assert.equal(loaded?.offers[0]?.images?.[0], "https://cdn.example/room.jpg");
    assert.equal(loaded?.profile.name, "Prince De Galles");
  } finally {
    clearHotelGalleryCache();
    if (previousKey === undefined) delete process.env.LITTLE_EMPERORS_API_KEY;
    else process.env.LITTLE_EMPERORS_API_KEY = previousKey;
  }
});
