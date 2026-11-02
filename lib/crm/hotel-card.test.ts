import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";

const CDN = "https://photos.example/anantara";

function item(
  partial: Pick<CrmBookingItem, "id" | "kind" | "title" | "sort_order"> &
    Partial<Pick<CrmBookingItem, "start_at" | "end_at" | "amount" | "supplier" | "details">>
): CrmBookingItem {
  return {
    id: partial.id,
    booking_id: "b1",
    kind: partial.kind,
    title: partial.title,
    supplier: partial.supplier ?? null,
    confirmation_ref: null,
    start_at: partial.start_at ?? null,
    end_at: partial.end_at ?? null,
    amount: partial.amount ?? null,
    include_in_ledger: false,
    sort_order: partial.sort_order,
    details: partial.details ?? {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

const booking = {
  id: "b1",
  reference: "TB-APERCU",
  title: "Nice",
  destination: "Nice",
  start_date: "2026-11-12",
  end_date: "2026-11-14",
  currency: "EUR",
  status: "confirmed",
  cover_image_path: null,
  cover_credit: null,
  notes_client: null,
  prices_visible: true,
  visible_to_client: true,
  offer_chauffeur: false,
  offer_greeter: false,
  offer_checkin: false,
  offer_visa: false,
  updated_at: "2026-09-01T12:00:00.000Z",
} as PublicBooking;

function photos(captions: string[]) {
  return captions.map((caption, index) => ({
    url: `${CDN}/${index}.jpg`,
    thumb: `${CDN}/${index}-thumb.jpg`,
    caption,
    kind: index === 0 ? "room" : "hotel",
  }));
}

describe("carte hôtel horizontale", () => {
  it("aligne la chambre, le prix et la pastille, sans la bande de miniatures", () => {
    const html = renderToStaticMarkup(
      createElement(CarnetItinerary, {
        booking,
        docs: [],
        items: [
          item({
            id: "vol",
            kind: "flight",
            title: "Paris → Nice",
            supplier: "Air France",
            sort_order: 0,
            start_at: "2026-11-12T13:50:00",
            end_at: "2026-11-12T15:25:00",
            amount: 420,
            details: {
              airline: "Air France",
              from: "CDG",
              to: "NCE",
              city_from: "Paris",
              city_to: "Nice",
              passengers: [{ first_name: "Camille", last_name: "Morel" }],
            },
          }),
          item({
            id: "hotel",
            kind: "hotel",
            title: "Anantara Plaza Nice Hotel",
            sort_order: 1,
            start_at: "2026-11-12",
            end_at: "2026-11-14",
            amount: 1452.52,
            details: {
              hotel_name: "Anantara Plaza Nice Hotel",
              city: "Nice",
              rooms: [{ room: "Grand Premium Garden View Room with Balcony" }],
              photos: photos(["Chambre", "Façade", "Jardin", "Salon", "Piscine", "Suite"]),
            },
          }),
          item({
            id: "autre",
            kind: "hotel",
            title: "Maison Horizon",
            sort_order: 2,
            start_at: "2026-11-12",
            end_at: "2026-11-13",
            amount: 980,
            details: { hotel_name: "Maison Horizon", city: "New York" },
          }),
        ],
      })
    );

    assert.match(html, /Paris → Nice/);
    assert.match(html, /CDG → NCE/);
    assert.match(html, /Anantara Plaza Nice Hotel/);
    assert.match(html, /Hôtel · Nice/);
    assert.match(html, /Grand Premium Garden View Room with Balcony/);
    assert.match(html, /6 photos/);
    assert.match(html, /Voir les 6 photos de Anantara Plaza Nice Hotel/);
    assert.match(html, /Voir l’hôtel/);
    assert.match(html, /1[\s\u202f\u00a0]452,52/);
    assert.equal(html.includes("h-12 w-16"), false);
    assert.equal(html.includes("ring-offset-[#0B192C]"), false);
    // Pastille et libellé du bouton, une seule fois : la nuit suivante n’a pas la photo.
    assert.equal(html.split("6 photos").length - 1, 2);
    assert.match(html, /Maison Horizon/);
    assert.equal(html.includes("Voir les"), true);
    const other = html.slice(html.indexOf("Maison Horizon"));
    assert.equal(other.includes("photos de Maison Horizon"), false);
  });
});
