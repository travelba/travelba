import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyCatalogRules,
  applySeatReply,
  closeEveningTables,
  closedOn,
  eveningAlerts,
  eveningsOfStay,
  fillNights,
  formatDistanceKm,
  haversineKm,
  hotelsFromItems,
  inChoiceWindow,
  inCloseWindow,
  localClock,
  normalizeCatalog,
  parseCardLast4,
  parseCovers,
  planRestaurantCron,
  RESTAURANT_COVERS,
  RESTAURANT_DEFAULT_TIME,
  restaurantDefaultClock,
  rankRestaurants,
  restaurantDedupeKey,
  selectionBlock,
  stayNights,
  untreatedAfter1830,
  type DeskEvening,
  type RestaurantRecord,
} from "./restaurants";
import { isPrivateAddress, parseMediaToken, publicHttpsUrl } from "./restaurant-media";
import { eveningBanner, eveningPhase, faceStatus, ficheGaps, sendBlockReason } from "./restaurant-desk";
import { clientTableCanReply, clientTableFace, presentClientTables } from "./client-tables";
import { deauvilleCarouselErrors, deauvilleClientEvenings } from "./deauville-preview";
import { outboundRestaurantPhone, restaurantTestOperator } from "./restaurant-test";
import {
  deliveryDecision,
  parseRestaurantButton,
  PLAT_CARD_BODY,
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  RESTAURANT_INTRO_ENV,
  RESTAURANT_SIGNATURE,
  restaurantAcceptAck,
  restaurantCarouselBody,
  restaurantCarouselContentCreateBody,
  restaurantCarouselDraft,
  restaurantDeskPreview,
  restaurantGreeting,
  restaurantIntroBody,
  restaurantIntroContentCreateBody,
  restaurantTemplateFlags,
  restaurantTemplateSubmission,
  SALLE_CARD_BODY,
  SALLE_PITCH_MAX,
} from "./restaurant-whatsapp";

const PARIS = "Europe/Paris";
const BANGKOK = "Asia/Bangkok";
const NEW_YORK = "America/New_York";

function desk(partial: Partial<DeskEvening> = {}): DeskEvening {
  return {
    bookingId: "booking-1",
    eveningDate: "2026-01-15",
    timezone: PARIS,
    choice: null,
    messageStatus: "aucun",
    closed: false,
    canWhatsapp: true,
    tables: [
      { seat: "A", status: "reservee", restaurantName: "Ostuni" },
      { seat: "B", status: "reservee", restaurantName: "Da Vittorio" },
    ],
    ...partial,
  };
}

function place(partial: Partial<RestaurantRecord> & Pick<RestaurantRecord, "id" | "name" | "city">): RestaurantRecord {
  return {
    cityKey: "",
    address: "",
    lat: null,
    lng: null,
    phone: "",
    website: "",
    categories: ["italien"],
    cuisine: "",
    style: "",
    platform: null,
    bookingUrl: "",
    bot: "non",
    guaranteeCard: false,
    onlineCancellation: null,
    cancelHours: null,
    cancelFeeCents: null,
    closedWeekdays: [],
    openingHours: "",
    annualClosures: [],
    status: "actif",
    exclusionReason: null,
    starred: false,
    prepaidRequired: false,
    note: "",
    photoUrls: [],
    menuPhotoUrl: "",
    signaturePhotoUrl: "",
    pitch: "",
    priceBand: "",
    priceEstimated: false,
    placeUrl: "",
    availabilityNotes: "",
    ...partial,
  };
}

test("16 h et 18 h suivent le fuseau, hiver comme été", () => {
  const winterSend = new Date("2026-01-15T15:00:00.000Z");
  const winterBefore = new Date("2026-01-15T14:59:00.000Z");
  const winterClose = new Date("2026-01-15T17:00:00.000Z");
  const winterAlmost = new Date("2026-01-15T16:59:00.000Z");
  const summerSend = new Date("2026-07-15T14:00:00.000Z");
  assert.equal(localClock(winterSend, PARIS)?.hour, 16);
  assert.equal(localClock(winterSend, PARIS)?.isoDate, "2026-01-15");
  assert.equal(inChoiceWindow(winterBefore, "2026-01-15", PARIS), false);
  assert.equal(inChoiceWindow(winterSend, "2026-01-15", PARIS), true);
  assert.equal(inChoiceWindow(winterAlmost, "2026-01-15", PARIS), true);
  assert.equal(inCloseWindow(winterAlmost, "2026-01-15", PARIS), false);
  assert.equal(inChoiceWindow(winterClose, "2026-01-15", PARIS), false);
  assert.equal(inCloseWindow(winterClose, "2026-01-15", PARIS), true);
  assert.equal(untreatedAfter1830(winterClose, "2026-01-15", PARIS), false);
  assert.equal(untreatedAfter1830(new Date("2026-01-15T17:30:00.000Z"), "2026-01-15", PARIS), true);
  assert.equal(inChoiceWindow(summerSend, "2026-07-15", PARIS), true);
  assert.equal(localClock(summerSend, PARIS)?.hour, 16);

  const sameInstant = new Date("2026-01-15T15:00:00.000Z");
  assert.equal(inChoiceWindow(sameInstant, "2026-01-15", PARIS), true);
  assert.equal(inChoiceWindow(sameInstant, "2026-01-15", BANGKOK), false);
  assert.equal(inCloseWindow(sameInstant, "2026-01-15", BANGKOK), true);
  assert.equal(inChoiceWindow(sameInstant, "2026-01-15", NEW_YORK), false);
  assert.equal(inChoiceWindow(new Date("2026-01-15T09:00:00.000Z"), "2026-01-15", BANGKOK), true);
  assert.equal(inChoiceWindow(new Date("2026-01-15T21:00:00.000Z"), "2026-01-15", NEW_YORK), true);
  assert.equal(inChoiceWindow(sameInstant, "2026-01-15", "PasUnFuseau"), false);
});

test("la clôture de 18 h annule la table non choisie, ou les deux sans réponse", () => {
  const both = [
    { seat: "A" as const, status: "reservee" as const },
    { seat: "B" as const, status: "proposee" as const },
  ];
  assert.deepEqual(
    closeEveningTables(both, "A").map((table) => table.status),
    ["choisie", "a_annuler"]
  );
  assert.deepEqual(
    closeEveningTables(both, "B").map((table) => table.status),
    ["a_annuler", "choisie"]
  );
  assert.deepEqual(
    closeEveningTables(both, null).map((table) => table.status),
    ["a_annuler", "a_annuler"]
  );
  assert.deepEqual(
    closeEveningTables(both, "aucune").map((table) => table.status),
    ["a_annuler", "a_annuler"]
  );
  const mixed = [
    { seat: "A" as const, status: "a_reserver" as const },
    { seat: "B" as const, status: "echec" as const },
  ];
  assert.deepEqual(closeEveningTables(mixed, null), mixed);
  const done = [
    { seat: "A" as const, status: "annulee" as const },
    { seat: "B" as const, status: "a_annuler" as const },
  ];
  assert.deepEqual(closeEveningTables(done, null), done);
});

test("le cron envoie dans la fenêtre et clôture à 18 h, y compris le lendemain si le passage a été manqué", () => {
  const at16 = new Date("2026-01-15T15:00:00.000Z");
  const ready = planRestaurantCron([desk(), desk({ bookingId: "booking-2", timezone: BANGKOK })], at16, true);
  assert.deepEqual(ready.sends, [
    { bookingId: "booking-1", eveningDate: "2026-01-15", part: "intro", mode: "send" },
    { bookingId: "booking-1", eveningDate: "2026-01-15", part: "A", mode: "send" },
    { bookingId: "booking-1", eveningDate: "2026-01-15", part: "B", mode: "send" },
  ]);
  assert.equal(ready.closes.length, 1);
  assert.equal(ready.closes[0]?.bookingId, "booking-2");

  const queued = planRestaurantCron([desk()], at16, false);
  assert.deepEqual(queued.sends, [{ bookingId: "booking-1", eveningDate: "2026-01-15", part: "intro", mode: "queue" }]);
  const introOnly = planRestaurantCron([desk()], at16, { intro: true, carousel: false });
  assert.deepEqual(
    introOnly.sends.map((row) => `${row.part}:${row.mode}`),
    ["intro:send", "A:queue", "B:queue"]
  );
  const afterIntro = planRestaurantCron(
    [desk({ partsSent: { intro: true, A: false, B: true }, messageStatus: "en_file" })],
    at16,
    true
  );
  assert.deepEqual(afterIntro.sends, [{ bookingId: "booking-1", eveningDate: "2026-01-15", part: "A", mode: "send" }]);

  const sent = planRestaurantCron([desk({ messageStatus: "envoye" })], at16, true);
  assert.deepEqual(sent.sends, []);

  const noPhone = planRestaurantCron([desk({ canWhatsapp: false })], at16, true);
  assert.deepEqual(noPhone.sends, []);

  const oneTable = planRestaurantCron(
    [desk({ tables: [{ seat: "A", status: "reservee", restaurantName: "Ostuni" }] })],
    at16,
    true
  );
  assert.deepEqual(oneTable.sends, []);

  const at18 = new Date("2026-01-15T17:00:00.000Z");
  const closed = planRestaurantCron([desk({ choice: "A" })], at18, true);
  assert.deepEqual(closed.sends, []);
  assert.deepEqual(
    closed.closes[0]?.tables.map((table) => table.status),
    ["choisie", "a_annuler"]
  );

  const missed = planRestaurantCron([desk({ closed: false })], new Date("2026-01-16T09:00:00.000Z"), true);
  assert.deepEqual(missed.sends, []);
  assert.equal(missed.closes.length, 1);
  assert.deepEqual(planRestaurantCron([desk({ closed: true })], at18, true).closes, []);
});

test("les alertes : échec, fermé, sans WhatsApp, annulation après 18 h 30, fuseau", () => {
  const now = new Date("2026-01-15T17:30:00.000Z");
  const base = { now, eveningDate: "2026-01-15", timezone: PARIS, hasPhone: true, tables: [] as { status: "reservee"; restaurantClosed: boolean; cancelledAt: string | null }[] };
  assert.deepEqual(eveningAlerts({ ...base, timezone: null }), ["fuseau"]);
  assert.ok(eveningAlerts({ ...base, tables: [{ status: "echec", restaurantClosed: false, cancelledAt: null }] }).includes("echec"));
  assert.ok(
    eveningAlerts({ ...base, tables: [{ status: "reservee", restaurantClosed: true, cancelledAt: null }] }).includes("ferme")
  );
  assert.ok(eveningAlerts({ ...base, hasPhone: false }).includes("sans_whatsapp"));
  assert.ok(
    eveningAlerts({
      ...base,
      tables: [{ status: "a_annuler", restaurantClosed: false, cancelledAt: null }],
    }).includes("a_annuler")
  );
  assert.equal(
    eveningAlerts({
      ...base,
      now: new Date("2026-01-15T16:00:00.000Z"),
      tables: [{ status: "a_annuler", restaurantClosed: false, cancelledAt: null }],
    }).includes("a_annuler"),
    false
  );
  assert.equal(
    eveningAlerts({
      ...base,
      tables: [{ status: "a_annuler", restaurantClosed: false, cancelledAt: "2026-01-15T17:40:00.000Z" }],
    }).includes("a_annuler"),
    false
  );
});

test("les proches passent devant, deux par catégorie, Milan = Milano", () => {
  const hotel = { city: "Milano", lat: 45.464, lng: 9.19 };
  const rows = [
    place({ id: "far", name: "Loin", city: "Milan", lat: 45.5, lng: 9.19, categories: ["japonais"] }),
    place({ id: "near", name: "Près", city: "Milano", lat: 45.465, lng: 9.19, categories: ["japonais"] }),
    place({ id: "mid", name: "Milieu", city: "Milan", lat: 45.47, lng: 9.19, categories: ["japonais"] }),
    place({ id: "it", name: "Italie", city: "Milan", lat: 45.466, lng: 9.191, categories: ["italien"] }),
    place({ id: "rome", name: "Rome", city: "Rome", lat: 41.9, lng: 12.5, categories: ["italien"] }),
    place({ id: "star", name: "Étoilé", city: "Milan", lat: 45.4641, lng: 9.19, categories: ["japonais"], starred: true }),
    place({ id: "out", name: "Exclu", city: "Milan", lat: 45.464, lng: 9.19, status: "exclu", exclusionReason: "ferme" }),
  ];
  const ranked = rankRestaurants(rows, hotel);
  assert.deepEqual(
    ranked.filter((row) => row.categories.includes("japonais") && !row.blocked).map((row) => row.id),
    ["near", "mid", "far"]
  );
  assert.deepEqual(
    ranked.filter((row) => row.featured).map((row) => row.id),
    ["near", "it", "mid"]
  );
  assert.equal(ranked.find((row) => row.id === "star")?.blocked, "Gastronomique ou étoilé, hors sélection.");
  assert.equal(ranked.some((row) => row.id === "rome" || row.id === "out"), false);
  assert.ok((ranked.find((row) => row.id === "near")?.distanceKm || 0) < 1);
  assert.match(formatDistanceKm(0.4), /m$/);
  assert.match(formatDistanceKm(1.2), /km$/);
  assert.ok(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }) === 0);
});

test("le séjour compte le soir d’arrivée et pas le jour de départ", () => {
  assert.deepEqual(stayNights("2026-06-01", "2026-06-04"), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  assert.deepEqual(stayNights("2026-06-01", "2026-06-01"), ["2026-06-01"]);
  assert.deepEqual(fillNights(["2026-06-01", "2026-06-03"]), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  const hotels = hotelsFromItems([
    {
      kind: "hotel",
      title: "Hôtel",
      start_at: "2026-06-02",
      end_at: "2026-06-04",
      details: { hotel_name: "Ostuni", city: "Milan", latitude: 45.46, longitude: 9.19, timezone: "Europe/Rome" },
    },
    { kind: "hotel", title: "Annulé", start_at: "2026-06-01", end_at: "2026-06-02", lifecycle: "cancelled", details: { city: "Rome" } },
    { kind: "flight", title: "Vol", start_at: "2026-06-01", details: {} },
  ]);
  assert.equal(hotels.length, 1);
  assert.equal(hotels[0]?.city, "Milan");
  assert.equal(hotels[0]?.zone, "Europe/Rome");
  assert.deepEqual(eveningsOfStay(hotels, "2026-06-01", "2026-06-08"), ["2026-06-02", "2026-06-03"]);
});

test("fermé le mercredi et pendant la fermeture annuelle, y compris à cheval sur l’année", () => {
  const row = { closedWeekdays: [3], annualClosures: [{ from: "08-01", to: "08-15" }, { from: "12-20", to: "01-05" }] };
  assert.equal(closedOn(row, "2026-01-14"), true);
  assert.equal(closedOn(row, "2026-01-15"), false);
  assert.equal(closedOn(row, "2026-08-10"), true);
  assert.equal(closedOn(row, "2026-08-20"), false);
  assert.equal(closedOn(row, "2026-12-28"), true);
  assert.equal(closedOn(row, "2026-01-03"), true);
});

test("la garantie ne garde que quatre chiffres", () => {
  assert.deepEqual(parseCardLast4("4242"), { ok: true, last4: "4242" });
  assert.deepEqual(parseCardLast4(""), { ok: true, last4: null });
  assert.equal(parseCardLast4("4242 4242 4242 4242").ok, false);
  assert.equal(parseCardLast4("4242424242424242").ok, false);
  assert.equal(restaurantDedupeKey("b1", "2026-06-02", "intro"), "restaurant:b1:2026-06-02:intro");
  assert.equal(restaurantDedupeKey("b1", "2026-06-02", "A"), "restaurant:b1:2026-06-02:A");
});

test("gastronomique, étoilé et prépaiement sortent du catalogue actif", () => {
  const starred = applyCatalogRules(place({ id: "1", name: "A", city: "Paris", starred: true }));
  assert.equal(starred.status, "exclu");
  assert.equal(starred.exclusionReason, "gastronomique");
  const prepaid = applyCatalogRules(place({ id: "1", name: "A", city: "Paris", prepaidRequired: true }));
  assert.equal(prepaid.exclusionReason, "prepaiement");
  assert.equal(selectionBlock(prepaid), "Prépaiement obligatoire, hors sélection.");
  const draft = normalizeCatalog({
    nom: "Table",
    ville: "Paris",
    categories: "japonais, terrasse",
    plateforme: "The Fork",
    bot: "partiel",
    etoile: false,
    interne: "note 4242424242424242",
  });
  assert.equal("error" in draft, false);
  if (!("error" in draft)) {
    assert.deepEqual(draft.categories, ["japonais", "terrasse"]);
    assert.equal(draft.platform, "thefork");
    assert.equal(draft.bot, "partiel");
    assert.equal(draft.note.includes("4242"), false);
    assert.equal(draft.cityKey, "paris");
  }
  const visual = normalizeCatalog({
    nom: "Table",
    ville: "Paris",
    photos: "https://cdn.example/salle.jpg\nhttps://cdn.example/bar.jpg",
    photo_plat: "https://cdn.example/plat.jpg",
    photo_carte: "https://cdn.example/carte.jpg",
    description: "Une salle calme.",
    fourchette: "90 à 140 €",
    page: "https://maps.example/table",
  });
  assert.equal("error" in visual, false);
  if (!("error" in visual)) {
    assert.deepEqual(visual.photoUrls, ["https://cdn.example/salle.jpg", "https://cdn.example/bar.jpg"]);
    assert.equal(visual.signaturePhotoUrl, "https://cdn.example/plat.jpg");
    assert.equal(visual.menuPhotoUrl, "https://cdn.example/carte.jpg");
    assert.equal(visual.pitch, "Une salle calme.");
    assert.equal(visual.priceBand, "90 à 140 €");
    assert.equal(visual.placeUrl, "https://maps.example/table");
  }
  assert.equal("error" in normalizeCatalog({ nom: "Table", ville: "Paris", photo_plat: "http://cdn.example/plat.jpg" }), true);
});

test("le pré-message part avant les carrousels, et 18 h n’est pas répété", () => {
  assert.equal(RESTAURANT_INTRO_ENV, "TWILIO_CONTENT_RESTAURANT_INTRO");
  assert.equal(RESTAURANT_CAROUSEL_ENV, "TWILIO_CONTENT_RESTAURANT_PROPOSITION");
  assert.equal(RESTAURANT_CAROUSEL_MENU_ENV, "TWILIO_CONTENT_RESTAURANT_PROPOSITION_CARTE");
  const intro = restaurantIntroBody();
  const carousel = restaurantCarouselBody();
  assert.match(intro, /18 h/);
  assert.match(intro, /La Conciergerie Travel BA/);
  assert.match(intro, /accepter celle de votre choix/);
  assert.equal(carousel.includes("18"), false);
  assert.match(carousel, /table pour deux/);
  assert.match(carousel, new RegExp(RESTAURANT_SIGNATURE));
  assert.equal(/\p{Extended_Pictographic}/u.test(intro + carousel), false);
  assert.deepEqual(restaurantTemplateFlags(false), { intro: false, carousel: false });
  const two = restaurantCarouselContentCreateBody(false);
  const three = restaurantCarouselContentCreateBody(true);
  assert.equal(two.types["twilio/carousel"].cards.length, 2);
  assert.equal(three.types["twilio/carousel"].cards.length, 3);
  const actions = two.types["twilio/carousel"].cards.map((card) => card.actions.map((action) => action.type).join("+"));
  assert.deepEqual(actions, ["QUICK_REPLY+QUICK_REPLY", "QUICK_REPLY+QUICK_REPLY"]);
  assert.equal(two.types["twilio/carousel"].cards[0]?.actions[0]?.title, "J'accepte");
  assert.equal(two.types["twilio/carousel"].cards[1]?.actions[1]?.title, "Je refuse");
  assert.match(SALLE_CARD_BODY, /travelba\.fr\/api\/r\//);
  assert.match(PLAT_CARD_BODY, /par personne/);
  assert.match(restaurantTemplateSubmission(), /Découvrir l’adresse/);
  assert.equal(restaurantGreeting({ sex: "M", lastName: "Dupont", firstName: "Camille" }), "Monsieur Dupont");
  assert.equal(restaurantGreeting({ sex: "F", lastName: "Martin", firstName: "Camille" }), "Madame Martin");
  assert.equal(restaurantGreeting({ sex: "X", lastName: "Martin", firstName: "Camille" }), "Camille");
  const pitch = "S".repeat(SALLE_PITCH_MAX);
  const draft = restaurantCarouselDraft({
    greeting: "Monsieur Dupont",
    restaurantName: "Ostuni",
    timeLabel: "20h30",
    pitch,
    priceBand: "90 à 140 €",
    restaurantId: "11111111-1111-4111-8111-111111111111",
    tableId: "22222222-2222-4222-8222-222222222222",
    menuPhoto: true,
  });
  assert.equal("error" in draft, false);
  if (!("error" in draft)) {
    const salle = `En salle, ${pitch}. Lien https://travelba.fr/api/r/11111111-1111-4111-8111-111111111111 ici.`;
    assert.ok("La salle".length + salle.length <= 160);
    assert.equal(draft.variables["10"], "11111111-1111-4111-8111-111111111111.carte");
    assert.equal(draft.withMenu, true);
  }
  const coded = parseRestaurantButton({ buttonPayload: "accepte:22222222-2222-4222-8222-222222222222" });
  assert.deepEqual(coded, { reply: "accepte", tableId: "22222222-2222-4222-8222-222222222222" });
  assert.deepEqual(parseRestaurantButton({ body: "Je refuse" }), { reply: "refuse", tableId: null });
  assert.deepEqual(parseRestaurantButton({ buttonPayload: "A" }), { legacy: "A" });
  assert.equal(parseRestaurantButton({ body: "Je garde la table A" }), null);
  const introJson = restaurantIntroContentCreateBody();
  assert.equal(introJson.types["twilio/text"].body.startsWith("Bonsoir "), true);
  assert.deepEqual(JSON.parse(readFileSync(new URL("../../scripts/whatsapp/restaurant-selection.json", import.meta.url), "utf8")), introJson);
  assert.deepEqual(
    JSON.parse(readFileSync(new URL("../../scripts/whatsapp/restaurant-proposition.json", import.meta.url), "utf8")),
    restaurantCarouselContentCreateBody(false)
  );
  assert.deepEqual(
    JSON.parse(readFileSync(new URL("../../scripts/whatsapp/restaurant-proposition-carte.json", import.meta.url), "utf8")),
    restaurantCarouselContentCreateBody(true)
  );
  assert.equal(deliveryDecision({ templateSid: "", hasPhone: true, alreadySent: false }), "queue");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: true, alreadySent: false }), "send");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: false, alreadySent: false }), "no_phone");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: true, alreadySent: true }), "skip");
  const preview = restaurantDeskPreview();
  assert.match(preview.caption, /Madame Morel/);
  assert.match(preview.intro, /18 h/);
  assert.match(preview.intro, /La Conciergerie Travel BA/);
  assert.equal(preview.restaurants.length, 2);
  assert.equal(preview.restaurants[0]?.cards.length, 3);
  assert.equal(preview.restaurants[1]?.cards.length, 2);
  assert.equal(preview.restaurants[0]?.intro.includes("18"), false);
  assert.match(preview.restaurants[0]?.cards[0]?.body || "", /travelba\.fr\/api\/r\//);
  assert.doesNotMatch(preview.restaurants[0]?.cards[0]?.body || "", /\.\./);
  assert.equal(preview.restaurants[1]?.cards.some((card) => card.kind === "carte"), false);
});

test("accepter une table passe l’autre à annuler, sans changer la clôture de 18 h", () => {
  const both = [
    { seat: "A" as const, status: "proposee" as const },
    { seat: "B" as const, status: "proposee" as const },
  ];
  const accepted = applySeatReply(both, "A", "accepte");
  assert.equal(accepted.choice, "A");
  assert.deepEqual(
    accepted.tables.map((table) => table.status),
    ["choisie", "a_annuler"]
  );
  assert.deepEqual(
    closeEveningTables(accepted.tables, accepted.choice).map((table) => table.status),
    ["choisie", "a_annuler"]
  );
  const refused = applySeatReply(both, "B", "refuse");
  assert.equal(refused.choice, null);
  assert.deepEqual(
    refused.tables.map((table) => table.status),
    ["proposee", "a_annuler"]
  );
  const bothRefused = applySeatReply(refused.tables, "A", "refuse");
  assert.equal(bothRefused.choice, "aucune");
  assert.equal(parseCovers(undefined), RESTAURANT_COVERS);
  assert.equal(parseCovers(""), 2);
  assert.equal(RESTAURANT_DEFAULT_TIME, "20:30");
  assert.equal(restaurantDefaultClock(), "20h30");
  assert.equal(restaurantCarouselContentCreateBody(false).variables["3"], restaurantDefaultClock());
  const timed = restaurantCarouselDraft({
    greeting: "Monsieur Dupont",
    restaurantName: "Ostuni",
    timeLabel: "",
    pitch: "Salle",
    priceBand: "90 €",
    restaurantId: "11111111-1111-4111-8111-111111111111",
    tableId: "22222222-2222-4222-8222-222222222222",
    menuPhoto: false,
  });
  assert.equal("error" in timed, false);
  if (!("error" in timed)) assert.equal(timed.variables["3"], "20h30");
  assert.equal("error" in (parseCovers(4) as { error?: string }), true);
});

test("le mode test n’écrit qu’à Benjamin et le bureau reste lisible", () => {
  assert.equal(restaurantTestOperator("Benjamin@travelba.fr"), true);
  assert.equal(restaurantTestOperator("camille@travelba.fr"), false);
  assert.equal(outboundRestaurantPhone({ test: true, clientPhone: "+33611111111", testPhone: "+33600000000" }), "+33600000000");
  assert.equal(outboundRestaurantPhone({ test: true, clientPhone: "+33611111111", testPhone: null }), null);
  assert.equal(outboundRestaurantPhone({ test: false, clientPhone: "+33611111111", testPhone: "+33600000000" }), "+33611111111");
  assert.equal(faceStatus({ hasRestaurant: true, status: "reservee", sent: false, otherAccepted: false }), "proposee");
  assert.equal(faceStatus({ hasRestaurant: true, status: "proposee", sent: true, otherAccepted: false }), "envoyee");
  assert.equal(faceStatus({ hasRestaurant: true, status: "choisie", sent: true, otherAccepted: false }), "acceptee");
  assert.equal(faceStatus({ hasRestaurant: true, status: "a_annuler", sent: true, otherAccepted: true }), "a_annuler");
  assert.equal(faceStatus({ hasRestaurant: true, status: "a_annuler", sent: true, otherAccepted: false }), "refusee");
  assert.equal(eveningPhase(["a_choisir", "a_choisir"]), "choisir");
  assert.equal(eveningPhase(["proposee", "proposee"]), "envoyer");
  assert.equal(eveningPhase(["acceptee", "a_annuler"]), "annuler");
  assert.deepEqual(ficheGaps({ photoUrls: [], signaturePhotoUrl: "", pitch: "", priceBand: "", placeUrl: "", website: "" }).length, 5);
  assert.equal(sendBlockReason({ gaps: ["photo de la salle"], templatesReady: true, test: false, testPhone: false, alreadySent: false, hasClientPhone: true, allowed: true }), "Fiche incomplète : photo de la salle.");
  assert.equal(sendBlockReason({ gaps: [], templatesReady: false, test: false, testPhone: false, alreadySent: false, hasClientPhone: true, allowed: true }), "Le modèle WhatsApp n’est pas encore approuvé par Meta.");
  assert.equal(sendBlockReason({ gaps: [], templatesReady: false, test: true, testPhone: true, alreadySent: false, hasClientPhone: false, allowed: false }), null);
  assert.equal(eveningBanner([{ phase: "envoyer", clicks: 0, faces: ["proposee", "proposee"] }, { phase: "annuler", clicks: 1, faces: ["acceptee", "a_annuler"] }]).envoyer, 1);
  const sql = readFileSync(new URL("../../supabase/migrations/20261029223000_crm_restaurant_test.sql", import.meta.url), "utf8");
  assert.match(sql, /is_test/);
});

test("la migration restaurants ne stocke pas de PAN", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261029120000_crm_restaurants.sql", import.meta.url), "utf8");
  assert.match(sql, /crm_restaurants/);
  assert.match(sql, /crm_restaurant_tables/);
  assert.match(sql, /crm_restaurant_evenings/);
  assert.match(sql, /crm_restaurant_messages/);
  assert.match(sql, /card_last4/);
  assert.match(sql, /\^\[0-9\]\{4\}\$/);
  assert.doesNotMatch(sql, /\bpan\b/i);
  assert.match(sql, /a_annuler/);
  assert.match(sql, /concierge@travelba.fr/);
  assert.match(sql, /timezone/);
  const catalogue = readFileSync(new URL("../../supabase/migrations/20261029203000_crm_restaurant_catalogue.sql", import.meta.url), "utf8");
  assert.match(catalogue, /photo_urls/);
  assert.match(catalogue, /menu_photo_url/);
  assert.match(catalogue, /signature_photo_url/);
  assert.match(catalogue, /concierge_pitch/);
  assert.match(catalogue, /price_band/);
  assert.match(catalogue, /place_url/);
  assert.match(catalogue, /covers set default 2/);
  assert.match(catalogue, /part in \('intro', 'A', 'B'\)/);
  assert.equal(parseMediaToken("exemple.salle")?.kind, "sample");
  assert.equal(parseMediaToken("11111111-1111-4111-8111-111111111111.plat")?.kind, "restaurant");
  assert.equal(parseMediaToken("pas-une-photo"), null);
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.1.1.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(publicHttpsUrl("http://cdn.example/a.jpg"), null);
  assert.equal(publicHttpsUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
});

test("l’espace client montre les tables envoyées et le clic suit le même choix", () => {
  assert.equal(clientTableFace({ status: "reservee", otherAccepted: false }), null);
  assert.equal(clientTableFace({ status: "a_reserver", otherAccepted: false }), null);
  assert.equal(clientTableFace({ status: "proposee", otherAccepted: false }), "proposee");
  assert.equal(clientTableFace({ status: "choisie", otherAccepted: false }), "acceptee");
  assert.equal(clientTableFace({ status: "a_annuler", otherAccepted: true }), "a_annuler");
  assert.equal(clientTableFace({ status: "a_annuler", otherAccepted: false }), "refusee");
  assert.equal(clientTableFace({ status: "annulee", otherAccepted: true }), "annulee");
  assert.equal(clientTableCanReply("proposee", false), true);
  assert.equal(clientTableCanReply("proposee", true), false);
  assert.equal(clientTableCanReply("acceptee", false), false);
  const shown = presentClientTables([
    {
      id: "t1",
      date: "2026-10-30",
      seat: "A",
      time: "20:30",
      status: "proposee",
      name: "Le Drakkar",
      address: "77 rue Eugène Colas",
      href: "https://www.ledrakkar-deauville.fr/",
      photo: "/apercu/deauville/drakkar-salle.jpg",
      pitch: "Une salle.",
      price: "50–90 €",
      closed: false,
    },
    {
      id: "t0",
      date: "2026-10-30",
      seat: "B",
      time: "20:30",
      status: "reservee",
      name: "Pas encore",
      address: "",
      href: "http://pas-https",
      photo: null,
      pitch: "",
      price: "",
      closed: false,
    },
  ]);
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.tables.length, 1);
  assert.equal(shown[0]?.tables[0]?.time, "20h30");
  assert.equal(shown[0]?.tables[0]?.canReply, true);
  assert.equal(shown[0]?.tables[0]?.href.startsWith("https://"), true);
  const choix = deauvilleClientEvenings("choix");
  const friday = choix.find((evening) => evening.date === "2026-10-30");
  assert.equal(friday?.tables[0]?.status, "acceptee");
  assert.equal(friday?.tables[1]?.status, "annulee");
  assert.equal(friday?.tables[0]?.canReply, false);
  assert.deepEqual(deauvilleCarouselErrors(), []);
  const ack = restaurantAcceptAck({
    greeting: "Monsieur Boukris",
    restaurant: "Le Drakkar",
    eveningDate: "2026-10-30",
    timeLabel: "20h30",
    other: "Le Deauville",
  });
  assert.match(ack, /Monsieur Boukris/);
  assert.match(ack, /Le Drakkar/);
  assert.match(ack, /Le Deauville/);
  assert.match(ack, /20h30/);
  assert.match(ack, /La Conciergerie Travel BA/);
  assert.doesNotMatch(ack, /18 h/);
  const sql = readFileSync(new URL("../../supabase/migrations/20261029310000_crm_restaurant_choice_espace.sql", import.meta.url), "utf8");
  assert.match(sql, /'espace'/);
});
