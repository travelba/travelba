import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeStayRooms,
  encodeStayRooms,
  hotelListCacheKey,
  hotelSearchMatches,
  readHotelListSearch,
  writeHotelListSearch,
  type HotelListCriteria,
  type HotelSearchSnapshot,
} from "./hotel-search-resume";

const criteria: HotelListCriteria = {
  destination: "Paris",
  city: "",
  checkIn: "2026-12-01",
  checkOut: "2026-12-04",
  rooms: [
    { adults: 2, children: [] },
    { adults: 1, children: [{ age: 4 }, { age: 7 }] },
  ],
  target: { kind: "ville", id: 12 },
  sort: "avantages",
  filters: ["breakfast"],
  page: 2,
};

test("les critères de recherche tiennent dans l’URL et s’y relisent", () => {
  const raw = writeHotelListSearch(criteria);
  const back = readHotelListSearch(new URLSearchParams(raw));
  assert.deepEqual(back, criteria);
  assert.equal(decodeStayRooms(""), null);
  assert.equal(decodeStayRooms("0"), null);
  assert.equal(encodeStayRooms([{ adults: 2, children: [] }]), "2");
  assert.equal(hotelListCacheKey(criteria), hotelListCacheKey({ ...criteria, sort: "prix", page: 1, filters: [] }));
});

test("le retour retrouve la liste ou l’hôtel déjà ouvert", () => {
  const snapshot: HotelSearchSnapshot = {
    key: hotelListCacheKey(criteria),
    hotels: [],
    catalog: { "88": { hotelKey: "88" } as HotelSearchSnapshot["catalog"][string] },
    page: 1,
    sort: "prix",
    needs: [],
    scroll: 420,
    rooms: criteria.rooms,
  };
  assert.equal(hotelSearchMatches(snapshot, new URLSearchParams(writeHotelListSearch(criteria))), true);
  assert.equal(hotelSearchMatches(snapshot, new URLSearchParams("hotel=88")), true);
  assert.equal(hotelSearchMatches(snapshot, new URLSearchParams("hotel=99")), false);
  assert.equal(readHotelListSearch(new URLSearchParams("ou=A&arrivee=2026-01-01&depart=2026-01-02&chambres=2")), null);
});

test("la page hôtels attend avec les phrases, et la liste se reprend", () => {
  const root = join(import.meta.dirname, "../..");
  const loading = readFileSync(join(root, "app/mon-compte/hotels/loading.tsx"), "utf8");
  const search = readFileSync(join(root, "components/account/HotelSearch.tsx"), "utf8");
  const strip = readFileSync(join(root, "components/account/HotelPhotoStrip.tsx"), "utf8");
  assert.match(loading, /HotelWait/);
  assert.doesNotMatch(loading, /animate-pulse/);
  assert.match(search, /rememberHotelSearch/);
  assert.match(search, /router\.back\(\)/);
  assert.match(search, /hotelJourneySearch\(token, "hotel"\)/);
  assert.match(search, /Voir les tarifs/);
  assert.match(strip, /from "next\/image"/);
  assert.match(strip, /sizes=/);
  assert.match(strip, /hotelImageLoader/);
  assert.doesNotMatch(strip, /scrollLeft =/);
});
