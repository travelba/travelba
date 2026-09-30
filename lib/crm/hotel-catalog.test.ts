import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMatchedCatalog, hotelContact } from "./hotel-contact";
import { hotelDeskRecipients } from "./hotel-desk";
import { matchHotelDirectory, type HotelDirectoryEntry } from "./hotel-catalog";
import type { CrmBookingItem } from "./types";

function hotel(details: Record<string, unknown>, title = ""): CrmBookingItem {
  return {
    id: "h1",
    booking_id: "b1",
    kind: "hotel",
    title: title || String(details.hotel_name || "Hôtel"),
    supplier: "Little Emperors",
    confirmation_ref: null,
    start_at: "2026-10-29",
    end_at: "2026-11-03",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details,
    visible_to_client: false,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

const directory: HotelDirectoryEntry[] = [
  { hotel_id: 9882, hotel_name: "The NoMad Hotel, London", city: "London", country: "United Kingdom" },
  { hotel_id: 11973, hotel_name: "The Ned NoMad", city: "New York", country: "United States" },
  { hotel_id: 14787, hotel_name: "NoMad Singapore", city: "Singapore", country: "Singapore" },
  { hotel_id: 803, hotel_name: "The Miami Beach EDITION", city: "Miami", country: "United States" },
  { hotel_id: 8360, hotel_name: "The New York EDITION", city: "New York", country: "United States" },
  { hotel_id: 328, hotel_name: "Six Senses Douro Valley", city: "Lamego", country: "Portugal" },
  { hotel_id: 10664, hotel_name: "Casa Cipriani New York", city: "New York", country: "United States" },
  { hotel_id: 11691, hotel_name: "Casa Cipriani Milano", city: "Milan", country: "Italy" },
];

describe("matchHotelDirectory", () => {
  it("relie NoMad London à The NoMad Hotel, même si la ville est écrite Londres", () => {
    const hit = matchHotelDirectory(hotel({ hotel_name: "NoMad London", city: "Londres" }), directory);
    assert.equal(hit?.hotel_id, 9882);
  });

  it("ne confond pas The Ned NoMad avec The NoMad Hotel", () => {
    const hit = matchHotelDirectory(hotel({ hotel_name: "The Ned NoMad", city: "New York" }), directory);
    assert.equal(hit?.hotel_id, 11973);
  });

  it("accepte le nom exact du catalogue", () => {
    const hit = matchHotelDirectory(
      hotel({ hotel_name: "The NoMad Hotel, London", city: "London" }),
      directory
    );
    assert.equal(hit?.hotel_id, 9882);
  });

  it("relie Miami Beach au EDITION dont le catalogue dit Miami", () => {
    const hit = matchHotelDirectory(
      hotel({ hotel_name: "The Miami Beach EDITION", city: "Miami Beach" }),
      directory
    );
    assert.equal(hit?.hotel_id, 803);
  });

  it("relie Four Seasons Hotel Milano au catalogue Four Seasons Hotel Milan", () => {
    const milan: HotelDirectoryEntry[] = [
      { hotel_id: 89, hotel_name: "Four Seasons Hotel Milan", city: "Milan", country: "Italy" },
      { hotel_id: 90, hotel_name: "Four Seasons Hotel Firenze", city: "Florence", country: "Italy" },
    ];
    assert.equal(
      matchHotelDirectory(hotel({ hotel_name: "Four Seasons Hotel Milano", city: "Milano" }), milan)?.hotel_id,
      89
    );
    assert.equal(
      matchHotelDirectory(hotel({ hotel_name: "Four Seasons Hotel Milano", city: "Milan" }), milan)?.hotel_id,
      89
    );
  });

  it("laisse un hôtel absent du catalogue sans contact", () => {
    const hit = matchHotelDirectory(
      hotel({ hotel_name: "Résidence Pierre & Vacances Premium L'Amara", city: "Avoriaz" }),
      directory
    );
    assert.equal(hit, null);
  });

  it("ne choisit pas quand deux hôtels portent le même nom dans la même ville", () => {
    const doubled: HotelDirectoryEntry[] = [
      { hotel_id: 1, hotel_name: "Cavo Tagoo", city: "Mykonos", country: "Greece" },
      { hotel_id: 2, hotel_name: "Cavo Tagoo Mykonos", city: "Mykonos", country: "Greece" },
    ];
    const hit = matchHotelDirectory(hotel({ hotel_name: "Cavo Tagoo Hotel", city: "Mykonos" }), doubled);
    assert.equal(hit, null);
  });
});

describe("applyMatchedCatalog", () => {
  it("pose tous les contacts du catalogue sur chaque courrier", () => {
    const [item] = applyMatchedCatalog(
      [hotel({ hotel_name: "NoMad London", city: "Londres", address: "28 Bow Street" })],
      [
        {
          hotel_id: 9882,
          hotel_name: "The NoMad Hotel, London",
          city: "London",
          country: "United Kingdom",
          website: null,
          contacts: [
            { type: "Concierge", first_name: "", last_name: "", email: "concierge@nomad.test", phone: "" },
            { type: "Reservations", first_name: "", last_name: "", email: "reservations@nomad.test", phone: "" },
            { type: "Hilton", first_name: "Ada", last_name: "Test", email: "ada@hilton.test", phone: "" },
          ],
        },
      ]
    );
    const contact = hotelContact(item);
    assert.equal(item.details?.le_hotel_id, 9882);
    assert.equal(contact.country, "United Kingdom");
    assert.equal(contact.address, "28 Bow Street");
    assert.equal(contact.people.length, 3);
    assert.deepEqual(hotelDeskRecipients(contact, "payment_link"), [
      "concierge@nomad.test",
      "reservations@nomad.test",
      "ada@hilton.test",
    ]);
    assert.deepEqual(hotelDeskRecipients(contact, "concierge"), [
      "concierge@nomad.test",
      "reservations@nomad.test",
      "ada@hilton.test",
    ]);
  });
});
