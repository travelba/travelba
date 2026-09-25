import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmBookingItem } from "./types";
import {
  clearLittleEmperorsContacts,
  extractHotelEmail,
  extractHotelPhone,
  extractHotelWebsite,
  hotelContact,
} from "./hotel-contact";

function hotel(details: Record<string, unknown>, supplier: string | null = null): CrmBookingItem {
  return {
    id: "h1",
    booking_id: "b1",
    kind: "hotel",
    title: "Maison Test",
    supplier,
    confirmation_ref: null,
    start_at: "2026-08-10",
    end_at: "2026-08-12",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details,
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

describe("extractHotelWebsite", () => {
  it("lit le site libellé et ignore Little Emperors", () => {
    const text = `
Website
https://www.maison-test.example/hotel
https://www.little-emperors.com/booking
`;
    assert.equal(extractHotelWebsite(text), "https://www.maison-test.example/hotel");
  });

  it("accepte un www sans schéma", () => {
    assert.equal(
      extractHotelWebsite("Site web : www.maison-test.example/sejour"),
      "https://www.maison-test.example/sejour"
    );
  });
});

describe("extractHotelPhone / email", () => {
  it("ne fabrique rien sans libellé", () => {
    const text = "Costa Rica Marriott\nHeredia\n+506 2222 1111\nstay@maison-test.example";
    assert.equal(extractHotelPhone(text), null);
    assert.equal(extractHotelEmail(text), null);
  });

  it("lit un téléphone et un e-mail libellés, pas le fournisseur", () => {
    const text = `
Phone: +506 2222 1111
Email: stay@maison-test.example
Email: reservations@little-emperors.com
`;
    assert.equal(extractHotelPhone(text), "+506 2222 1111");
    assert.equal(extractHotelEmail(text), "stay@maison-test.example");
  });
});

describe("hotelContact", () => {
  it("n’affiche que les champs présents", () => {
    const contact = hotelContact(
      hotel({
        hotel_name: "Maison Test",
        city: "Heredia",
        address: "700 Meters West",
      })
    );
    assert.equal(contact.name, "Maison Test");
    assert.equal(contact.city, "Heredia");
    assert.equal(contact.address, "700 Meters West");
    assert.equal(contact.phone, "");
    assert.equal(contact.email, "");
    assert.equal(contact.website, "");
  });

  it("masque téléphone et e-mail pour Little Emperors", () => {
    const contact = hotelContact(
      hotel({
        hotel_name: "Maison Test",
        city: "Heredia",
        address: "Rue du lac",
        website: "https://www.maison-test.example",
        phone: "+506 2222 1111",
        email: "stay@maison-test.example",
        source_family: "little_emperors",
      })
    );
    assert.equal(contact.website, "https://www.maison-test.example/");
    assert.equal(contact.phone, "");
    assert.equal(contact.email, "");
    assert.equal(contact.address, "Rue du lac");
  });

  it("garde le téléphone d’une confirmation qui l’imprime", () => {
    const contact = hotelContact(
      hotel({
        hotel_name: "Maison Test",
        phone: "+91 22 0000 0000",
        email: "stay@maison-test.example",
        website: "https://www.maison-test.example",
      })
    );
    assert.equal(contact.phone, "+91 22 0000 0000");
    assert.equal(contact.email, "stay@maison-test.example");
  });
});

describe("clearLittleEmperorsContacts", () => {
  it("retire téléphone et e-mail et marque la famille", () => {
    const [item] = clearLittleEmperorsContacts([
      {
        kind: "hotel",
        supplier: null as string | null,
        details: {
          hotel_name: "Maison Test",
          phone: "+506 2222 1111" as string | null,
          email: "stay@maison-test.example" as string | null,
          website: "https://www.maison-test.example",
          source_family: null as string | null,
        },
      },
    ]);
    assert.equal(item.details?.phone, null);
    assert.equal(item.details?.email, null);
    assert.equal(item.details?.website, "https://www.maison-test.example");
    assert.equal(item.details?.source_family, "little_emperors");
    assert.equal(item.supplier, "Little Emperors");
  });
});
