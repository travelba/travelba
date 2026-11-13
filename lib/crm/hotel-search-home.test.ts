import assert from "node:assert/strict";
import test from "node:test";
import { SEARCH_PERK_LABEL, stayBenefits } from "./hotel-journey";
import type { HotelPerks } from "./hotel-search";
import {
  HOTEL_ACCESS_EYEBROW,
  HOTEL_ACCESS_LEVEL,
  HOTEL_ACCESS_LINES,
  HOTEL_ACCESS_OFFER,
  HOTEL_ACCESS_RESERVE,
  HOTEL_ACCESS_UNTIL,
  HOTEL_SEARCH_CITY_CHIPS,
  HOTEL_SEARCH_HERO_FALLBACK,
  TRAVEL_BA_SEARCH_ADVANTAGES,
  hotelDraftStorageKey,
  hotelRecentStorageKey,
  hotelSearchHeroSrc,
  rankFeaturedHotels,
} from "./hotel-search-home";

test("la photo du lieu suit le catalogue, sinon l’image déjà dans le projet", () => {
  assert.equal(hotelSearchHeroSrc(""), HOTEL_SEARCH_HERO_FALLBACK);
  assert.equal(hotelSearchHeroSrc("   "), HOTEL_SEARCH_HERO_FALLBACK);
  const paris = hotelSearchHeroSrc("Paris");
  assert.match(paris, /^\/api\/covers\/photo-/);
  assert.match(paris, /w=960/);
  assert.match(hotelSearchHeroSrc("Milan, Italie"), /photo-city-milan/);
  assert.equal(hotelSearchHeroSrc("Hôtel qui n’existe pas"), HOTEL_SEARCH_HERO_FALLBACK);
});

test("les puces et le stockage local sont par personne", () => {
  assert.deepEqual([...HOTEL_SEARCH_CITY_CHIPS], ["Paris", "Milan", "Courchevel", "Bordeaux"]);
  assert.equal(hotelRecentStorageKey(""), "hotel-recent-list");
  assert.equal(hotelRecentStorageKey("d4e0a000-1111-4111-8111-0000000000de"), "hotel-recent-list:d4e0a000-1111-4111-8111-0000000000de");
  assert.equal(hotelDraftStorageKey("exemple-client"), "hotel-search-last:exemple-client");
  assert.notEqual(hotelRecentStorageKey("aaa"), hotelRecentStorageKey("bbb"));
});

test("les avantages de l’accueil sont ceux de la recherche, pas un modèle générique", () => {
  const keys = ["breakfast", "upgrade", "earlyCheckIn", "lateCheckOut"] as const;
  assert.deepEqual(
    [...TRAVEL_BA_SEARCH_ADVANTAGES],
    keys.map((key) => SEARCH_PERK_LABEL.find((row) => row.key === key)?.label)
  );
  assert.deepEqual([...TRAVEL_BA_SEARCH_ADVANTAGES], [
    "Petit-déjeuner",
    "Surclassement",
    "Arrivée anticipée",
    "Départ tardif",
  ]);
  assert.deepEqual([...HOTEL_ACCESS_LINES], [
    "Petit-déjeuner offert",
    "Arrivée anticipée et départ tardif*",
    "Surclassement prioritaire*",
    "Jusqu’à 200 $ de crédit de dépense dans l’hôtel*",
    "Transfert aéroport*",
  ]);
  assert.equal(HOTEL_ACCESS_RESERVE, "* Soumis à disponibilité et selon l’hôtel.");
  assert.equal(HOTEL_ACCESS_EYEBROW, "Club Travel BA");
  assert.equal(HOTEL_ACCESS_LEVEL, "Platinum");
  assert.equal(HOTEL_ACCESS_OFFER, "Offert*");
  assert.equal(HOTEL_ACCESS_UNTIL, "Jusqu’au 31 déc. 2026");
  assert.equal(HOTEL_ACCESS_LINES[0].endsWith("*"), false);
  const perks: HotelPerks = {
    breakfast: true,
    freeCancellation: true,
    upgrade: true,
    credit: true,
    earlyCheckIn: true,
    lateCheckOut: true,
  };
  const read = [
    "Petit-déjeuner quotidien pour deux personnes",
    "Surclassement prioritaire à l'enregistrement",
    "Enregistrement anticipé et départ tardif",
  ];
  const shown = stayBenefits(read, perks);
  assert.deepEqual(shown.lines, read);
  assert.equal(shown.discreet, "");
  assert.notDeepEqual(shown.lines, [...TRAVEL_BA_SEARCH_ADVANTAGES]);
});

test("les coups de cœur gardent les hôtels les plus réservés qui ont une photo", () => {
  const ranked = rankFeaturedHotels([
    { name: "Ritz", city: "Paris", photo: "https://cdn.example/ritz.jpg", hotelId: 4 },
    { name: "Ritz", city: "", photo: "https://cdn.example/ritz-2.jpg", hotelId: null },
    { name: "Bristol", city: "Paris", photo: "http://cdn.example/clear.jpg" },
    { name: "Crillon", city: "Paris", photo: "https://cdn.example/crillon.jpg" },
    { name: "  ", city: "Lyon", photo: "https://cdn.example/vide.jpg" },
    { name: "Four Seasons Hotel Milano", city: "Milano", photo: "https://cdn.example/fs.jpg", hotelId: 89 },
    { name: "Four Seasons Hotel Milan", city: "Milan", photo: "https://cdn.example/fs.jpg", hotelId: 89 },
  ]);
  assert.deepEqual(
    ranked.map((row) => row.name),
    ["Four Seasons Hotel Milano", "Ritz", "Crillon"]
  );
  const ritz = ranked.find((row) => row.name === "Ritz");
  assert.equal(ritz?.city, "Paris");
  assert.equal(ritz?.hotelId, 4);
  assert.equal(ritz?.photo, "https://cdn.example/ritz.jpg");
  assert.equal(ranked.filter((row) => /four seasons/i.test(row.name)).length, 1);
  assert.deepEqual(rankFeaturedHotels([]), []);
});
