import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";

function item(
  partial: Pick<CrmBookingItem, "id" | "kind" | "title" | "sort_order"> &
    Partial<Pick<CrmBookingItem, "start_at" | "end_at" | "supplier" | "confirmation_ref" | "details">>
): CrmBookingItem {
  return {
    id: partial.id,
    booking_id: "b1",
    kind: partial.kind,
    title: partial.title,
    supplier: partial.supplier ?? null,
    confirmation_ref: partial.confirmation_ref ?? null,
    start_at: partial.start_at ?? null,
    end_at: partial.end_at ?? null,
    amount: null,
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
  reference: "EVPP6FP5",
  title: "Majorque",
  destination: "Majorque",
  start_date: "2026-12-20",
  end_date: "2026-12-27",
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

describe("lecture de l’itinéraire", () => {
  it("prend la voiture, la garde en ligne, et la rend avant le vol", () => {
    const html = renderToStaticMarkup(
      createElement(CarnetItinerary, {
        booking,
        docs: [],
        items: [
          item({
            id: "aller",
            kind: "flight",
            title: "Paris → Palma",
            sort_order: 0,
            start_at: "2026-12-20T09:00:00",
            end_at: "2026-12-20T10:55:00",
          }),
          item({
            id: "voiture",
            kind: "car",
            title: "PEUGEOT 3008 AUTOMATICO ou similaire",
            supplier: "Expedia TAAP",
            confirmation_ref: "1209347615",
            sort_order: 1,
            start_at: "2026-12-20T09:30:00",
            end_at: "2026-12-27T09:30:00",
            details: {
              vehicle: "PEUGEOT 3008 AUTOMATICO ou similaire",
              pickup: "Palma de Majorque (PMI)",
              dropoff: "Palma de Majorque (PMI)",
            },
          }),
          item({
            id: "hotel",
            kind: "hotel",
            title: "Can Verí Suites",
            sort_order: 2,
            start_at: "2026-12-21",
            end_at: "2026-12-28",
            details: {
              hotel_name: "Can Verí Suites",
              city: "Sóller",
              board: "Petit-déjeuner inclus",
              photos: [{ url: "https://photos.example/canveri.jpg", thumb: "https://photos.example/canveri.jpg", caption: "Suite", kind: "room" }],
            },
          }),
          item({
            id: "retour",
            kind: "flight",
            title: "Palma → Paris",
            sort_order: 0,
            start_at: "2026-12-27T11:40:00",
            end_at: "2026-12-27T13:45:00",
          }),
        ],
      })
    );

    assert.match(html, /prise en charge 09h30/);
    assert.match(html, /Peugeot 3008 automatique ou similaire/);
    assert.match(html, /Aéroport de Palma \(PMI\)/);
    assert.match(html, /avec vous jusqu’au 27 décembre/);
    assert.match(html, /restitution 09h30/);
    assert.match(html, /Hôtel · 7 nuits/);
    assert.match(html, /Sóller · Petit-déjeuner inclus/);
    assert.match(html, /nuit 2 sur 7/);
    assert.equal(html.includes("09h30 → 09h30"), false);
    assert.equal(html.includes("Expedia"), false);
    const back = html.slice(html.lastIndexOf("dimanche 27 décembre"));
    const carAt = back.indexOf("restitution 09h30");
    const flightAt = back.indexOf("Palma → Paris");
    assert.ok(carAt >= 0 && flightAt >= 0 && carAt < flightAt);
  });
});
