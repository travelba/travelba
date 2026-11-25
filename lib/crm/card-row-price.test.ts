import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { itemPriceLabel } from "./carnet";
import { formatMoney } from "./money";
import type { CrmBookingItem } from "./types";

function card(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "kind" | "title">): CrmBookingItem {
  return {
    booking_id: "b1",
    supplier: null,
    confirmation_ref: null,
    start_at: "2027-03-26T08:41:00+00:00",
    end_at: "2027-03-26T12:56:00+00:00",
    amount: 0,
    include_in_ledger: true,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    lifecycle: "active",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

/** Forme réelle : la colonne est restée « sans », le mode choisi est dans les détails. */
const rail = card({
  id: "rail",
  kind: "rail",
  title: "Paris → Moûtiers",
  supplier: "SNCF Connect",
  confirmation_ref: "G6ADUC",
  amount: "1715.00" as unknown as number,
  price_mode: "sans",
  details: {
    price_mode: "avec",
    document_amount: 1540,
    ticket_count: "7",
    city_from: "Paris",
    city_to: "Moûtiers",
    from: "Paris Gare de Lyon",
    to: "Moûtiers-Salins-Brides-les-Bains",
    flight_number: "TGV INOUI 6429",
    airline: "TGV INOUI",
    supplier_net: 1540,
  },
});

const transfer = card({
  id: "transfer",
  kind: "transfer",
  title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
  supplier: "AJS Transport",
  start_at: "2027-03-26T12:56:00+00:00",
  amount: "180.00" as unknown as number,
  price_mode: "sans",
  details: { price_mode: "avec", document_amount: 105, supplier_net: 105 },
});

const hotel = card({
  id: "hotel",
  kind: "hotel",
  title: "Hôtel Le Savoy",
  start_at: "2027-03-26T00:00:00+00:00",
  end_at: "2027-03-29T00:00:00+00:00",
  amount: "9206.00" as unknown as number,
  price_mode: "avec",
  include_in_ledger: false,
  details: { hotel_name: "Hôtel Le Savoy", city: "Méribel", document_amount: 7991, supplier_net: 7991 },
});

const flight = card({
  id: "flight",
  kind: "flight",
  title: "Paris → Genève",
  supplier: "Air France",
  amount: "640.00" as unknown as number,
  price_mode: "sans",
  details: {
    price_mode: "avec",
    document_amount: 500,
    ticket_count: 2,
    city_from: "Paris",
    city_to: "Genève",
    from: "CDG",
    to: "GVA",
  },
});

const sans = card({
  id: "sans",
  kind: "activity",
  title: "Forfait ski",
  amount: "400.00" as unknown as number,
  price_mode: "avec",
  details: { price_mode: "sans", document_amount: 300 },
});

const money = (amount: number) => formatMoney(amount, "EUR").replace(/[\u202f\u00a0]/g, " ");
const flat = (html: string) => html.replace(/[\u202f\u00a0]/g, " ");

test("le prix de vente s’affiche quel que soit le type, même si la colonne dit sans", () => {
  assert.equal(itemPriceLabel(rail, "EUR"), formatMoney(1715, "EUR"));
  assert.equal(itemPriceLabel(transfer, "EUR"), formatMoney(180, "EUR"));
  assert.equal(itemPriceLabel(hotel, "EUR"), formatMoney(9206, "EUR"));
  assert.equal(itemPriceLabel(flight, "EUR"), `2 × ${formatMoney(640, "EUR")}`);
  assert.equal(itemPriceLabel(sans, "EUR"), null);
  assert.equal(itemPriceLabel(rail, "EUR", null, true, "forfait"), null);
});

test("la ligne repliée de l’agence montre le prix de vente, pas le prix d’achat", async () => {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
  const load = Module._load;
  Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
    return load.call(this, request, parent, isMain);
  };
  let html = "";
  try {
    const { BookingItemsPanel } = await import("../../components/admin/BookingItemsPanel");
    html = flat(
      renderToStaticMarkup(
        createElement(BookingItemsPanel, {
          bookingId: "b1",
          items: [rail, transfer, hotel, flight, sans],
          currency: "EUR",
          stayPriceMode: "cartes",
          stayVisible: true,
        })
      )
    );
  } finally {
    Module._load = load;
  }
  assert.match(html, new RegExp(money(1715).replace(/\s/g, "\\s")));
  assert.match(html, new RegExp(money(180).replace(/\s/g, "\\s")));
  assert.match(html, new RegExp(money(9206).replace(/\s/g, "\\s")));
  assert.match(html, /2 ×/);
  assert.match(html, new RegExp(money(640).replace(/\s/g, "\\s")));
  assert.equal(html.includes(money(1540)), false);
  assert.equal(html.includes(money(105)), false);
  assert.equal(html.includes(money(7991)), false);
  assert.equal(html.includes(money(400)), false);
  assert.match(html, /Sans prix/);
});

test("le carnet client montre les mêmes prix de vente", async () => {
  const { CarnetItinerary } = await import("../../components/account/CarnetItinerary");
  const html = flat(
    renderToStaticMarkup(
      createElement(CarnetItinerary, {
        booking: {
          id: "b1",
          reference: "TB-2026-0136",
          title: "Méribel",
          destination: "Méribel",
          start_date: "2027-03-26",
          end_date: "2027-03-29",
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
          updated_at: "2026-11-25T00:00:00.000Z",
        },
        items: [rail, transfer, hotel, sans],
        docs: [],
        cardPrices: true,
        pricesVisible: true,
      })
    )
  );
  assert.match(html, new RegExp(money(1715).replace(/\s/g, "\\s")));
  assert.match(html, new RegExp(money(180).replace(/\s/g, "\\s")));
  assert.match(html, new RegExp(money(9206).replace(/\s/g, "\\s")));
  assert.equal(html.includes(money(1540)), false);
  assert.equal(html.includes(money(400)), false);
});
