import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmBookingItem } from "./types";
import {
  applyStoredHotelSources,
  clearLittleEmperorsContacts,
  contactsFromLeHotelPayload,
  extractHotelEmail,
  extractHotelPhone,
  extractHotelWebsite,
  fillLeHotelDetails,
  hotelCatalogFromLePayload,
  hotelContact,
  rowsFromHotelCatalog,
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
    assert.equal(contact.country, "");
    assert.deepEqual(contact.people, []);
  });

  it("montre le site, le téléphone et l’e-mail déjà sur la fiche, y compris Little Emperors", () => {
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
    assert.equal(contact.phone, "+506 2222 1111");
    assert.equal(contact.email, "stay@maison-test.example");
    assert.equal(contact.address, "Rue du lac");
  });

  it("lit un hôtel imbriqué et ignore l’e-mail du fournisseur", () => {
    const contact = hotelContact(
      hotel({
        hotel_name: "Maison Test",
        hotel: {
          website: "www.maison-test.example/hotel",
          phone: "+33 1 00 00 00 00",
          email: "reservations@little-emperors.com",
          reservations_email: "stay@maison-test.example",
        },
      })
    );
    assert.equal(contact.website, "https://www.maison-test.example/hotel");
    assert.equal(contact.phone, "+33 1 00 00 00 00");
    assert.equal(contact.email, "stay@maison-test.example");
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

describe("sources déjà stockées et détail Little Emperors", () => {
  it("recopie le site stocké sans inventer téléphone ni e-mail", () => {
    const [item] = applyStoredHotelSources(
      [hotel({ hotel_name: "Maison Test", city: "Megève", address: "Rue du lac" })],
      [{ hotel_id: 8481, hotel_name: "Maison Test", website: "https://www.maison-test.example" }]
    );
    const contact = hotelContact(item);
    assert.equal(contact.website, "https://www.maison-test.example/");
    assert.equal(contact.phone, "");
    assert.equal(contact.email, "");
    assert.equal(item.details?.le_hotel_id, 8481);
  });

  it("ne colle pas le site d’un autre hôtel", () => {
    const [item] = applyStoredHotelSources(
      [hotel({ hotel_name: "Les Fermes de Marie", city: "Megève" })],
      [{ hotel_id: 7327, hotel_name: "Four Seasons Resort Megeve", website: "https://www.autre-hotel.example" }]
    );
    assert.equal(hotelContact(item).website, "");
    assert.equal(item.details?.le_hotel_id, undefined);
  });

  it("montre un téléphone déjà stocké à côté, et rien d’autre", () => {
    const [item] = applyStoredHotelSources(
      [hotel({ hotel_name: "Maison Test" })],
      [
        {
          hotel_id: 12,
          hotel_name: "Maison Test",
          website: null,
          phone: "+33 1 00 00 00 00",
          email: null,
        },
      ]
    );
    const contact = hotelContact(item);
    assert.equal(contact.phone, "+33 1 00 00 00 00");
    assert.equal(contact.email, "");
    assert.equal(contact.website, "");
  });

  it("le détail hôtel donne le site et laisse téléphone et e-mail absents", () => {
    const contact = contactsFromLeHotelPayload({
      id: 8481,
      name: "Maison Test",
      website: "https://www.maison-test.example",
      reservations_email: null,
      hotel_contact_email: null,
      concierge_email: null,
      enquiries_email: null,
      whatsapp: null,
      country: { phone_code: "+33" },
      contact_details: [],
    });
    assert.equal(contact.website, "https://www.maison-test.example/");
    assert.equal(contact.phone, "");
    assert.equal(contact.email, "");
  });

  it("prend l’e-mail du détail seulement s’il est renseigné", () => {
    const contact = contactsFromLeHotelPayload({
      website: "https://www.little-emperors.com/hotels/1",
      reservations_email: "stay@maison-test.example",
      phone: "+44 20",
    });
    assert.equal(contact.website, "");
    assert.equal(contact.email, "stay@maison-test.example");
    assert.equal(contact.phone, "");
  });

  it("complète la fiche depuis l’API sans écraser un téléphone déjà noté", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      assert.match(String(input), /\/api\/hotels\/8481$/);
      return new Response(
        JSON.stringify({
          website: "https://www.maison-test.example",
          reservations_email: null,
          hotel_contact_email: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const [item] = await fillLeHotelDetails(
      [hotel({ hotel_name: "Maison Test", le_hotel_id: 8481, phone: "+33 1 00 00 00 00" })],
      fetchImpl
    );
    const contact = hotelContact(item);
    assert.equal(contact.website, "https://www.maison-test.example/");
    assert.equal(contact.phone, "+33 1 00 00 00 00");
    assert.equal(contact.email, "");
  });

  it("n’appelle pas l’API sans identifiant hôtel", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    const [item] = await fillLeHotelDetails([hotel({ hotel_name: "Maison Test", city: "Megève" })], fetchImpl);
    assert.equal(called, false);
    assert.equal(hotelContact(item).website, "");
  });
});

describe("catalogue Little Emperors — contacts typés", () => {
  const sample = {
    id: 7142,
    name: "Four Seasons Resort Sharm El Sheikh",
    location: "Sharm El Sheikh, Egypt",
    website: "https://www.fourseasons.com/sharmelsheikh/",
    reservations_email: "res.sharmelsheikh@fourseasons.com",
    concierge_email: "concierge.sharmelsheikh@fourseasons.com",
    hotel_contact_email: "gihan.mekky@fourseasons.com",
    contact_details: [
      { type: "Concierge", email: "concierge.sharmelsheikh@fourseasons.com" },
      { type: "Hotel contact", name: "Omar Ezz El Din", email: "omar.ezzeldin@fourseasons.com" },
      { type: "Hotel contact", first_name: "Gihan", last_name: "Mekky", email: "gihan.mekky@fourseasons.com" },
      { type: "Four Seasons", name: "Vanessa Green", email: "vanessa.green@fourseasons.com" },
      { email: "omar.ezzeldin@fourseasons.com" },
    ],
  };

  it("lit type, nom, prénom, e-mail, ville et pays", () => {
    const catalog = hotelCatalogFromLePayload(sample);
    assert.equal(catalog.hotel_id, 7142);
    assert.equal(catalog.hotel_name, "Four Seasons Resort Sharm El Sheikh");
    assert.equal(catalog.city, "Sharm El Sheikh");
    assert.equal(catalog.country, "Egypt");
    const omar = catalog.contacts.find((row) => row.email === "omar.ezzeldin@fourseasons.com");
    assert.ok(omar);
    assert.equal(omar?.type, "Hotel contact");
    assert.equal(omar?.first_name, "Omar");
    assert.equal(omar?.last_name, "Ezz El Din");
    const gihan = catalog.contacts.find((row) => row.email === "gihan.mekky@fourseasons.com" && row.type === "Hotel contact");
    assert.equal(gihan?.first_name, "Gihan");
    assert.equal(gihan?.last_name, "Mekky");
    assert.ok(catalog.contacts.some((row) => row.type === "Reservations" && row.email === "res.sharmelsheikh@fourseasons.com"));
    assert.ok(catalog.contacts.some((row) => row.type === "Concierge" && row.email === "concierge.sharmelsheikh@fourseasons.com"));
    assert.equal(
      catalog.contacts.some((row) => row.email === "omar.ezzeldin@fourseasons.com" && !row.type),
      false
    );
  });

  it("enregistre une ligne par contact, ré-import identique", () => {
    const catalog = hotelCatalogFromLePayload(sample);
    const first = rowsFromHotelCatalog(catalog);
    const second = rowsFromHotelCatalog(catalog);
    assert.ok(first.length >= 4);
    assert.deepEqual(first, second);
    assert.ok(first.every((row) => row.le_hotel_id === 7142 && row.country === "Egypt"));
  });

  it("colle les contacts stockés sur la fiche hôtel", () => {
    const catalog = hotelCatalogFromLePayload(sample);
    const [item] = applyStoredHotelSources(
      [hotel({ hotel_name: "Four Seasons Resort Sharm El Sheikh", le_hotel_id: 7142 })],
      [
        {
          hotel_id: 7142,
          hotel_name: catalog.hotel_name,
          website: catalog.website,
          city: catalog.city,
          country: catalog.country,
          contacts: catalog.contacts,
        },
      ]
    );
    const contact = hotelContact(item);
    assert.equal(contact.country, "Egypt");
    assert.ok(contact.people.some((row) => row.last_name === "Ezz El Din" && row.first_name === "Omar"));
    assert.equal(contact.people.length, catalog.contacts.length);
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
