import assert from "node:assert/strict";
import test from "node:test";
import { amountToCents } from "./money";
import { mergeOffers } from "./hotel-search";
import { coordsOf, offersFromLeAvailability, pickLeSearchTarget, profileFromLeHotel } from "./little-emperors-availability";

test("la ville l’emporte sur un hôtel au même nom", () => {
  const target = pickLeSearchTarget(
    [
      { id: 1, text: "Paris Hotel", type: "hotel", location: "Paris, France" },
      { id: 9, text: "Paris", type: "location", location: "France" },
    ],
    "paris"
  );
  assert.deepEqual(target, { kind: "location", id: 9 });
});

test("le montant à réserver est total_to_book, les chambres d’un hôtel n’en font qu’un", () => {
  const offers = offersFromLeAvailability(
    [
      {
        hotel_name: "Le Bristol",
        is_available: true,
        hotel_info: {
          location: "Paris, France",
          benefits: ["Daily breakfast"],
          images: [{ url: "https://cdn.example/bristol.jpg", thumbnail_url: "http://insecure.example/x.jpg" }],
        },
        room_types: [
          {
            name: "Deluxe",
            rates: [
              { total_to_book: 300, rate: 100, benefits: [], can_cancel: false, net: 10 },
              {
                total_to_book: 223.83,
                rate: 223.83,
                benefits: ["Priority upgrade at check-in"],
                can_cancel: true,
                cancellation_policy: "Free cancellation",
                net_rate: 50,
              },
            ],
          },
        ],
        lowest_rate: { rate: 10, total_to_book: 10 },
      },
    ],
    "Paris"
  );
  assert.equal(offers.length, 2);
  assert.deepEqual(
    offers.map((row) => row.proposed).sort(),
    [223.83, 300]
  );
  assert.ok(offers.every((row) => row.net == null && row.account === "little_emperors"));
  const state = new Map();
  mergeOffers(state, offers);
  assert.equal(state.size, 1);
  const stay = [...state.values()][0];
  assert.equal(stay.sellCents, 22383);
  assert.equal(stay.sellCents, amountToCents(223.83));
  assert.equal(stay.photoUrl, "https://cdn.example/bristol.jpg");
  assert.equal(stay.thumbUrl, null);
  assert.equal(stay.perks.breakfast, true);
  assert.equal(stay.perks.upgrade, true);
  assert.equal(stay.perks.freeCancellation, true);
});

test("la fiche reprend le lieu, les photos et les avantages, sans commission", () => {
  const offers = offersFromLeAvailability([
    {
      hotel_id: 15,
      hotel_name: "Ritz Paris",
      is_available: true,
      hotel_info: {
        location: "Paris, France",
        description: "Face à la place Vendôme.",
        coords: [48.868, 2.328],
        benefits: ["Complimentary breakfast"],
        images: [{ url: "https://cdn.example/ritz.jpg" }],
      },
      lowest_rate: { total_to_book_in_requested_currency: 223.83, requested_currency_code: "EUR" },
    },
  ]);
  assert.equal(offers[0]?.hotelId, 15);
  assert.equal(offers[0]?.coords?.lat, 48.868);
  assert.equal(offers[0]?.images?.[0], "https://cdn.example/ritz.jpg");
  assert.equal(coordsOf(["nope", 2]), null);
  const profile = profileFromLeHotel({
    name: "Ritz Paris",
    description: "Un hôtel.",
    address: "15 place Vendôme",
    latitude: 48.868,
    longitude: 2.328,
    amenities: ["Piscine"],
    benefits: ["Room upgrade"],
    short_info: { check_in_time: "15:00", check_out_time: "12:00" },
    hotel_information: [{ title: "Dining", description: ["Deux restaurants"] }],
  });
  assert.equal(profile.address, "15 place Vendôme");
  assert.equal(profile.coords?.lng, 2.328);
  assert.equal(profile.checkInTime, "15:00");
  assert.equal(profile.sections[0]?.title, "Dining");
  assert.equal(profile.amenities[0], "Piscine");
});

test("une réponse enveloppée reste une liste d’hôtels", () => {
  const offers = offersFromLeAvailability({
    data: [
      {
        hotel_id: 4,
        hotel_name: "La Mamounia",
        is_available: true,
        hotel_info: { location: "Marrakech, Morocco" },
        lowest_rate: { total_to_book: 400, currency_code: "EUR" },
      },
    ],
  });
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.hotelName, "La Mamounia");
  assert.equal(offers[0]?.city, "Marrakech");
});
