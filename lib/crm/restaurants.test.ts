import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyCatalogRules,
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
  planRestaurantCron,
  rankRestaurants,
  restaurantDedupeKey,
  selectionBlock,
  stayNights,
  timezoneForStay,
  untreatedAfter1830,
  type DeskEvening,
  type RestaurantRecord,
} from "./restaurants";
import {
  deliveryDecision,
  parseRestaurantReply,
  RESTAURANT_TEMPLATE_ENV,
  restaurantChoiceBody,
  restaurantChoiceSubmission,
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
    platform: null,
    bookingUrl: "",
    bot: "non",
    guaranteeCard: false,
    cancelHours: null,
    cancelFeeCents: null,
    closedWeekdays: [],
    annualClosures: [],
    status: "actif",
    exclusionReason: null,
    starred: false,
    prepaidRequired: false,
    note: "",
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

test("le fuseau vient du dossier, sinon de l’hôtel, sinon de la ville", () => {
  assert.deepEqual(timezoneForStay({ stored: "Asia/Bangkok", city: "Paris" }), { zone: "Asia/Bangkok", source: "dossier" });
  assert.deepEqual(timezoneForStay({ hotelZone: "Asia/Tokyo", city: "Paris" }), { zone: "Asia/Tokyo", source: "hotel" });
  assert.deepEqual(timezoneForStay({ city: "Milano" }), { zone: "Europe/Rome", source: "ville" });
  assert.deepEqual(timezoneForStay({ city: "Tel Aviv" }), { zone: "Asia/Jerusalem", source: "ville" });
  assert.deepEqual(timezoneForStay({ city: "Phuket" }), { zone: "Asia/Bangkok", source: "ville" });
  assert.deepEqual(timezoneForStay({ country: "Thaïlande" }), { zone: "Asia/Bangkok", source: "ville" });
  assert.deepEqual(timezoneForStay({ city: "Ville inconnue" }), { zone: null, source: null });
  assert.deepEqual(timezoneForStay({ stored: "nimp" }), { zone: null, source: null });
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
  assert.deepEqual(ready.sends, [{ bookingId: "booking-1", eveningDate: "2026-01-15", mode: "send" }]);
  assert.equal(ready.closes.length, 1);
  assert.equal(ready.closes[0]?.bookingId, "booking-2");

  const queued = planRestaurantCron([desk()], at16, false);
  assert.equal(queued.sends[0]?.mode, "queue");

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
  assert.equal(restaurantDedupeKey("b1", "2026-06-02"), "restaurant:b1:2026-06-02");
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
});

test("le modèle WhatsApp reste en file tant qu’il n’est pas approuvé", () => {
  assert.equal(RESTAURANT_TEMPLATE_ENV, "TWILIO_CONTENT_RESTAURANT_CHOIX");
  const body = restaurantChoiceBody();
  assert.match(body, /\{\{1\}\}/);
  assert.match(body, /\{\{4\}\}/);
  assert.match(body, /18 h/);
  assert.match(restaurantChoiceSubmission(), /boutons de réponse rapide : A \(id A\), B \(id B\), Aucune \(id aucune\)/i);
  assert.equal(parseRestaurantReply({ buttonPayload: "A" }), "A");
  assert.equal(parseRestaurantReply({ body: "Aucune" }), "aucune");
  assert.equal(parseRestaurantReply({ body: "Je garde la table A" }), null);
  assert.equal(deliveryDecision({ templateSid: "", hasPhone: true, alreadySent: false }), "queue");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: true, alreadySent: false }), "send");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: false, alreadySent: false }), "no_phone");
  assert.equal(deliveryDecision({ templateSid: "HXok", hasPhone: true, alreadySent: true }), "skip");
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
});
