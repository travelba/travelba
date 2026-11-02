import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import type { CrmBookingItem } from "./types";

function flight(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "title" | "start_at">): CrmBookingItem {
  return {
    booking_id: "b1",
    kind: "flight",
    supplier: "Arkia",
    confirmation_ref: "14028540",
    end_at: null,
    amount: 5357.57,
    include_in_ledger: true,
    sort_order: 0,
    details: { amount_is_total: true, pnr: "14028540" },
    visible_to_client: true,
    source_document_id: null,
    lifecycle: "active",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

test("le carnet montre l’aller-retour Arkia en une carte", async () => {
  const outbound = flight({
    id: "out",
    title: "Tel Aviv → Paris",
    start_at: "2026-11-02T08:00:00",
    details: {
      amount_is_total: true,
      pnr: "14028540",
      airline: "Arkia",
      flight_number: "IZ611",
      from: "TLV",
      to: "CDG",
      city_from: "Tel Aviv",
      city_to: "Paris",
    },
  });
  const inbound = flight({
    id: "back",
    title: "Paris → Tel Aviv",
    start_at: "2026-11-09T14:00:00",
    sort_order: 1,
    details: {
      amount_is_total: true,
      pnr: "14028540",
      airline: "Arkia",
      flight_number: "IZ612",
      from: "CDG",
      to: "TLV",
      city_from: "Paris",
      city_to: "Tel Aviv",
    },
  });
  const html = renderToStaticMarkup(
    createElement(CarnetItinerary, {
      booking: {
        id: "b1",
        reference: "TB-2026-0108",
        title: "Tel Aviv",
        destination: "Tel Aviv",
        start_date: "2026-11-02",
        end_date: "2026-11-09",
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
        updated_at: "2026-10-28T00:00:00.000Z",
      },
      items: [outbound, inbound],
      docs: [],
    })
  );
  assert.match(html, /IZ611/);
  assert.match(html, /IZ612/);
  assert.equal((html.match(/aller-retour/g) || []).length, 1);
  assert.equal((html.match(/<summary/g) || []).length, 1);
});
