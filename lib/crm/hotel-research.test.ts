import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HotelGallery } from "../../components/crm/HotelGallery";
import { HotelStayFacts } from "../../components/crm/HotelStayFacts";
import { withoutHotelRoster } from "./hotel-contact";
import { storedHotelPhotos } from "./hotel-gallery";
import {
  detailsWithHotelResearch,
  hotelPhotoPublicUrl,
  hotelPhotoStoragePath,
  hotelResearchNotice,
  mergeHotelResearch,
  parseResearchJson,
  reviewHotelResearch,
} from "./hotel-research";
import type { CrmBookingItem } from "./types";

const PAGE = {
  url: "https://www.hotel-negresco.com/contact",
  text: "Le Negresco, 37 promenade des Anglais, 06000 Nice. Concierge : concierge@hotel-negresco.com. Téléphone 04 93 16 64 00. La coupole rose domine la Promenade des Anglais. Photos https://cdn.example/pool.jpg https://cdn.example/facade.jpg.",
};

const DRAFT = {
  hotel_name: "Le Negresco",
  city: "Nice",
  country: "France",
  description:
    "Le Negresco est un palace face à la baie des Anges, à Nice. Sa coupole rose et ses salons dominent la Promenade des Anglais.",
  preuves: ["La coupole rose domine la Promenade des Anglais"],
  address: "37 promenade des Anglais, 06000 Nice",
  website: "https://www.hotel-negresco.com/contact",
  phone: "+33 4 93 16 64 00",
  contacts: [
    { type: "Concierge", first_name: "", last_name: "", email: "concierge@hotel-negresco.com", phone: "" },
    { type: "Reservations", first_name: "", last_name: "", email: "reservations@example.com", phone: "" },
  ],
  photos: [
    { url: "https://cdn.example/pool.jpg", caption: "Piscine" },
    { url: "https://facebook.com/photo.jpg", caption: "Facade" },
    { url: "https://cdn.example/invented.jpg", caption: "Facade" },
    { url: "https://cdn.example/facade.jpg", caption: "Facade" },
  ],
};

function card(details: Record<string, unknown>, supplier: string | null = null): Parameters<typeof detailsWithHotelResearch>[0] {
  return { kind: "hotel", title: "Le Negresco", supplier, details };
}

describe("fiche hôtel hors Little Emperors", () => {
  it("ignore un hôtel Little Emperors et une carte déjà complète", () => {
    const little = detailsWithHotelResearch(card({}, "Little Emperors"));
    assert.equal(little.hotel_research, undefined);
    const known = detailsWithHotelResearch(card({ le_hotel_id: 42, source_family: "little_emperors" }));
    assert.equal(known.hotel_research, undefined);
    const full = detailsWithHotelResearch(
      card({
        hotel_contacts: [{ type: "Concierge", email: "desk@hotel.test", phone: "", first_name: "", last_name: "" }],
        photos: [{ url: "https://cdn.example/a.jpg", caption: "Facade", kind: "hotel" }],
        description: "Un palace face à la mer, à Nice. Ses salons donnent sur la baie.",
      })
    );
    assert.equal(full.hotel_research, undefined);
  });

  it("met une carte vide en attente", () => {
    const next = detailsWithHotelResearch(card({ hotel_name: "Le Negresco", city: "Nice" }));
    assert.equal(next.hotel_research, "attente");
  });

  it("rejette un autre hôtel et un e-mail absent des pages", () => {
    const other = reviewHotelResearch({
      hotelName: "Negresco",
      city: "Nice",
      draft: { ...DRAFT, hotel_name: "Carlton" },
      pages: [PAGE],
    });
    assert.equal(other.outcome, "nom");
    const reviewed = reviewHotelResearch({ hotelName: "Negresco", city: "Nice", draft: DRAFT, pages: [PAGE] });
    assert.equal(reviewed.outcome, "prete");
    if (reviewed.outcome !== "prete") return;
    assert.equal(reviewed.fields.contacts.length, 1);
    assert.equal(reviewed.fields.contacts[0]?.email, "concierge@hotel-negresco.com");
    assert.equal(reviewed.fields.contacts.some((row) => row.email.includes("example.com")), false);
    assert.match(reviewed.fields.description, /coupole/);
    assert.equal(reviewed.fields.photos[0]?.url, "https://cdn.example/facade.jpg");
    assert.equal(reviewed.fields.photos.some((row) => row.url.includes("facebook") || row.url.includes("invented")), false);
    assert.equal(reviewed.fields.address.includes("Anglais"), true);
  });

  it("n’écrit rien si le nom ne correspond pas, et ne recouvre pas une photo saisie", () => {
    const kept = mergeHotelResearch(
      {
        hotel_name: "Negresco",
        photos: [{ url: "https://photos.example/deja.jpg", caption: "Suite", kind: "hotel" }],
        hotel_contacts: [{ type: "Concierge", email: "deja@hotel.test", phone: "", first_name: "", last_name: "" }],
      },
      {
        description: "Un palace face à la mer, à Nice. Ses salons donnent sur la baie.",
        address: "",
        website: "",
        phone: "",
        city: "",
        country: "",
        contacts: [{ type: "Reservations", email: "autre@hotel.test", phone: "", first_name: "", last_name: "" }],
        photos: [{ url: "/api/hotels/photos/11111111-1111-1111-1111-111111111111/0", caption: "Facade" }],
      },
      "prete"
    );
    assert.equal((kept.photos as { url: string }[])[0]?.url, "https://photos.example/deja.jpg");
    assert.equal((kept.hotel_contacts as { email: string }[])[0]?.email, "deja@hotel.test");
    assert.match(String(kept.description), /palace/);
    const hidden = withoutHotelRoster({
      kind: "hotel",
      details: {
        ...kept,
        hotel_research: "prete",
        hotel_contacts: [{ type: "Concierge", email: "deja@hotel.test", phone: "", first_name: "", last_name: "" }],
      } as Record<string, unknown>,
    });
    assert.equal(hidden.details?.hotel_research, undefined);
    assert.equal(hidden.details?.hotel_contacts, undefined);
    assert.equal(JSON.stringify(hidden).includes("deja@hotel.test"), false);
    assert.match(String(hidden.details?.description), /palace/);
  });

  it("affiche la description et la photo, pas la ligne de recherche", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    assert.equal(hotelPhotoStoragePath(id, 0), `hotels/${id}/0.webp`);
    assert.equal(hotelPhotoStoragePath(id, 8), "");
    assert.equal(hotelPhotoPublicUrl("../x", 0), "");
    const photo = `/api/hotels/photos/${id}/0`;
    const item = {
      kind: "hotel",
      title: "Le Negresco",
      details: {
        hotel_name: "Le Negresco",
        city: "Nice",
        description: "Le Negresco est un palace face à la mer, à Nice. Ses salons donnent sur la baie.",
        photos: [{ url: photo, thumb: photo, caption: "Facade", kind: "hotel" }],
        hotel_research: "attente",
        hotel_contacts: [{ type: "Concierge", email: "desk@hotel.test", phone: "", first_name: "", last_name: "" }],
      },
    } as unknown as CrmBookingItem;
    assert.equal(storedHotelPhotos(item.details)[0]?.url, photo);
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(HotelGallery, { photos: storedHotelPhotos(item.details), title: "Le Negresco" }),
        createElement(HotelStayFacts, { item })
      )
    );
    assert.match(html, new RegExp(photo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /palace face à la mer/);
    assert.equal(html.includes("desk@hotel.test"), false);
    assert.equal(html.includes("Recherche de l’hôtel"), false);
    assert.equal(hotelResearchNotice(item.details), "Recherche de l’hôtel…");
    assert.equal(hotelResearchNotice({ hotel_research: "vide" }), "Aucun contact public trouvé.");
    assert.deepEqual(parseResearchJson("```json\n{\"hotel_name\":\"Negresco\"}\n```"), { hotel_name: "Negresco" });
  });
});
