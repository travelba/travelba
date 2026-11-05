import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { offersFromLeAvailability } from "./little-emperors-availability";
import {
  DEFAULT_MAPBOX_STYLE,
  hotelMapBounds,
  hotelMapCaption,
  hotelPinClass,
  hotelPreviewImages,
  hotelStars,
  publicMapboxStyle,
  publicMapboxToken,
} from "./hotel-map";
import { priceStayOffer, toClientHotel } from "./hotel-search";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("le jeton Mapbox public est un pk., jamais un secret", () => {
  const token = `pk.${"a".repeat(24)}`;
  assert.equal(publicMapboxToken(token), token);
  assert.equal(publicMapboxToken(`  ${token}  `), token);
  assert.equal(publicMapboxToken(""), null);
  assert.equal(publicMapboxToken("pk.short"), null);
  assert.equal(publicMapboxToken(`sk.${"a".repeat(24)}`), null);
  assert.equal(publicMapboxToken("pk.aaaa aaaaaaaaaaaaaaaaaaaa"), null);
});

test("le style reste chez Mapbox, sinon le clair par défaut", () => {
  assert.equal(publicMapboxStyle(""), DEFAULT_MAPBOX_STYLE);
  assert.equal(publicMapboxStyle("mapbox://styles/mapbox/streets-v12"), "mapbox://styles/mapbox/streets-v12");
  assert.equal(
    publicMapboxStyle("https://api.mapbox.com/styles/v1/travelba/quiet?optimize=true"),
    "https://api.mapbox.com/styles/v1/travelba/quiet?optimize=true"
  );
  assert.equal(publicMapboxStyle("https://evil.example/style.json"), DEFAULT_MAPBOX_STYLE);
  assert.equal(publicMapboxStyle("javascript:alert(1)"), DEFAULT_MAPBOX_STYLE);
});

test("les étoiles sont 1 à 5, le lieu reste la ville", () => {
  assert.equal(hotelStars(5), 5);
  assert.equal(hotelStars("4"), 4);
  assert.equal(hotelStars(4.5), null);
  assert.equal(hotelStars(8), null);
  assert.equal(hotelStars("luxe"), null);
  assert.equal(hotelMapCaption({ city: "Bordeaux", stars: 5 }), "5 étoiles · Bordeaux");
  assert.equal(hotelMapCaption({ city: "Bordeaux", stars: 1 }), "1 étoile · Bordeaux");
  assert.equal(hotelMapCaption({ city: "Bordeaux", stars: null }), "Bordeaux");
  assert.equal(hotelMapCaption({ city: "  ", stars: null }), "");
  assert.equal(hotelPinClass(true).includes("h-pin-on"), true);
  assert.equal(hotelPinClass(false).includes("h-pin-on"), false);
});

test("l’aperçu reprend la façade puis la galerie, en https", () => {
  assert.deepEqual(
    hotelPreviewImages({
      photo: "https://cdn.example/facade.jpg",
      images: ["https://cdn.example/facade.jpg", "https://cdn.example/hall.jpg", "http://insecure.example/x.jpg"],
      thumb: "https://cdn.example/thumb.jpg",
    }),
    ["https://cdn.example/facade.jpg", "https://cdn.example/hall.jpg", "https://cdn.example/thumb.jpg"]
  );
});

test("le cadre englobe les hôtels", () => {
  assert.deepEqual(
    hotelMapBounds([
      { lat: 44.84, lng: -0.58 },
      { lat: 44.9, lng: -0.55 },
    ]),
    { sw: [-0.58, 44.84], ne: [-0.55, 44.9] }
  );
  assert.equal(hotelMapBounds([{ lat: 120, lng: 0 }]), null);
});

test("une étoile lue chez le fournisseur arrive sur la carte, sans être inventée", () => {
  const offers = offersFromLeAvailability([
    {
      hotel_name: "La Grande Maison",
      is_available: true,
      hotel_info: {
        location: "Bordeaux, France",
        star_rating: 5,
        coords: [44.84, -0.58],
        images: [{ url: "https://cdn.example/bordeaux.jpg" }],
      },
      lowest_rate: { total_to_book: 185.18, currency_code: "EUR" },
    },
  ]);
  const stay = priceStayOffer(offers[0]);
  assert.ok(stay);
  if (!stay) return;
  const client = toClientHotel(stay, 1, null);
  assert.equal(client.stars, 5);
  assert.equal(client.city, "Bordeaux");
  assert.equal(hotelMapCaption(client), "5 étoiles · Bordeaux");
  assert.equal(client.images[0], "https://cdn.example/bordeaux.jpg");
  const plain = toClientHotel(
    priceStayOffer({ account: "little_emperors", hotelName: "Ritz", city: "Paris", proposed: 200, currency: "EUR" })!,
    1,
    null
  );
  assert.equal(plain.stars, null);
});

test("la carte charge Mapbox si le jeton public est là, et la fiche suit la liste", () => {
  const map = readFileSync(join(root, "components/account/HotelMap.tsx"), "utf8");
  const box = readFileSync(join(root, "components/account/HotelMapboxView.tsx"), "utf8");
  const osm = readFileSync(join(root, "components/account/HotelOsmMap.tsx"), "utf8");
  const preview = readFileSync(join(root, "components/account/HotelMapPreview.tsx"), "utf8");
  const search = readFileSync(join(root, "components/account/HotelSearch.tsx"), "utf8");
  const example = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(map, /NEXT_PUBLIC_MAPBOX_TOKEN/);
  assert.match(map, /NEXT_PUBLIC_MAPBOX_STYLE/);
  assert.match(map, /ssr:\s*false/);
  assert.match(map, /HotelOsmMap/);
  assert.match(osm, /tile\.openstreetmap\.org/);
  assert.match(box, /from "mapbox-gl"/);
  assert.match(box, /performanceMetricsCollection:\s*false/);
  assert.match(box, /language:\s*"fr"/);
  assert.match(box, /fitBounds/);
  assert.match(preview, /Voir la fiche/);
  assert.match(preview, /data-hotel-map-preview/);
  assert.match(preview, /onOpen\(hotel\)/);
  assert.match(search, /<HotelMap hotels=\{shown\} onOpen=\{openHotel\} \/>/);
  assert.match(search, /hotelJourneySearch\(token, "hotel"\)/);
  assert.match(example, /NEXT_PUBLIC_MAPBOX_TOKEN=/);
  assert.match(example, /NEXT_PUBLIC_MAPBOX_STYLE=/);
  for (const file of [map, box, osm, preview, search, example]) {
    assert.equal(file.includes("pk.eyJ"), false);
    assert.equal(/sk\.[A-Za-z0-9]{8,}/.test(file), false);
  }
});
