import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import { TravelerChips } from "../../components/crm/TravelerChips";
import type { TicketTravelerFace } from "./document-passengers";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";

function item(
  partial: Pick<CrmBookingItem, "id" | "kind" | "title" | "sort_order"> &
    Partial<Pick<CrmBookingItem, "start_at" | "end_at" | "details">>
): CrmBookingItem {
  return {
    id: partial.id,
    booking_id: "b1",
    kind: partial.kind,
    title: partial.title,
    supplier: null,
    confirmation_ref: null,
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
  reference: "TB-EXEMPLE",
  title: "Annecy",
  destination: "Annecy",
  start_date: "2026-12-20",
  end_date: "2026-12-20",
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

const party = [
  ["Camille", "Martin"],
  ["Inès", "Martin"],
  ["Léa", "Durand"],
  ["Noa", "Bernard"],
  ["Adam", "Petit"],
  ["Lina", "Robert"],
  ["Hugo", "Morel"],
];

test("une carte train à sept voyageurs montre des pastilles, pas une phrase", () => {
  const html = renderToStaticMarkup(
    createElement(CarnetItinerary, {
      booking,
      docs: [],
      items: [
        item({
          id: "train",
          kind: "rail",
          title: "Lyon → Annecy",
          sort_order: 0,
          start_at: "2026-12-20T08:41:00",
          end_at: "2026-12-20T12:56:00",
          details: {
            city_from: "Lyon",
            city_to: "Annecy",
            from: "Lyon Part-Dieu",
            to: "Annecy",
            passengers: party.map(([first, last], index) => ({
              first_name: first,
              last_name: last,
              ...(index === 0 ? { seat: "12", voiture: "2" } : {}),
              ...(index === 1 ? { seat: "17", voiture: "11" } : {}),
            })),
          },
        }),
      ],
    })
  );

  assert.match(html, /Voyageurs/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /voiture 2 · place 12/);
  assert.match(html, /Inès Martin/);
  assert.match(html, /voiture 11 · place 17/);
  assert.match(html, />CM</);
  assert.match(html, /\+3/);
  assert.match(html, /Afficher 3 voyageurs de plus : Adam Petit, Lina Robert, Hugo Morel/);
  assert.equal(html.includes("Camille Martin, Inès Martin"), false);
  assert.match(html, /Lyon → Annecy/);
  assert.match(html, /Lyon Part-Dieu → Annecy/);
});

test("au-delà de quatre noms, le reste est derrière +N", () => {
  const people: TicketTravelerFace[] = party.map(([first, last]) => ({
    name: `${first} ${last}`,
    initials: `${first[0]}${last[0]}`,
    detail: null,
  }));
  const html = renderToStaticMarkup(createElement(TravelerChips, { people }));
  assert.match(html, /data-voyageurs-action="ouvrir"/);
  assert.match(html, /\+3/);
  assert.match(html, /Noa Bernard/);
  assert.equal(html.includes(">Adam Petit<"), false);
  assert.equal(html.includes("Réduire"), false);
  assert.equal(html.includes("Camille Martin, Inès Martin, Léa Durand"), false);
});