import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";
import { transferOpenedLine, transferProviderPhone } from "./transfer-contact";

test("le détail ouvert donne le nom et le numéro, pas la carte cachée", () => {
  assert.equal(transferProviderPhone({ phone: "+33612345678" }), "+33 6 12 34 56 78");
  assert.equal(
    transferOpenedLine({
      supplier: "Alpine Transfers",
      visible_to_client: true,
      details: { phone: "+33612345678", driver: "Marc", document_amount: 987654, notes: "NOTE-INTERNE" },
    }),
    "Alpine Transfers · +33 6 12 34 56 78"
  );
  assert.equal(
    transferOpenedLine({ supplier: "Alpine Transfers", visible_to_client: false, details: { phone: "+33612345678" } }),
    ""
  );
  assert.equal(transferOpenedLine({ supplier: "", visible_to_client: true, details: {} }), "");
});

test("la carte fermée ne montre ni le nom ni le numéro", () => {
  const item = {
    id: "transfert",
    booking_id: "b1",
    kind: "transfer" as const,
    title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
    supplier: "Alpine Transfers",
    confirmation_ref: "TR-9",
    start_at: "2026-12-20T12:56:00",
    end_at: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    details: {
      pickup: "Gare de Moûtiers",
      dropoff: "Hôtel Le Savoy Méribel",
      phone: "+33612345678",
      pickup_note: "2 h avant le vol",
      driver: "Marc",
      document_amount: 987654,
      notes: "NOTE-INTERNE-XYZ",
    },
  } satisfies CrmBookingItem;
  const hidden = {
    ...item,
    id: "cache",
    title: "Transfert caché",
    supplier: "Secret Transfer",
    confirmation_ref: null,
    visible_to_client: false,
    details: { phone: "+33699999999", pickup: "Lieu secret" },
  };
  const html = renderToStaticMarkup(
    createElement(CarnetItinerary, {
      booking: {
        id: "b1",
        reference: "TB-2026-0159",
        title: "Méribel",
        destination: "Méribel",
        start_date: "2026-12-20",
        end_date: "2026-12-27",
        currency: "EUR",
        status: "confirmed",
        cover_image_path: null,
        cover_credit: null,
        notes_client: null,
        prices_visible: false,
        visible_to_client: true,
        offer_chauffeur: false,
        offer_greeter: false,
        updated_at: "2026-12-01T12:00:00.000Z",
      } as PublicBooking,
      docs: [],
      items: [item, hidden],
    })
  );
  const closed = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  const opened = html.slice(html.indexOf("</summary>"), html.indexOf("<summary", html.indexOf("</summary>")));
  assert.equal(closed.includes("Alpine"), false);
  assert.equal(closed.includes("+33"), false);
  assert.match(closed, /TR-9/);
  assert.match(opened, /Alpine Transfers · \+33 6 12 34 56 78/);
  assert.match(opened, /2 h avant le vol/);
  assert.equal(html.includes("+33699999999"), false);
  assert.equal(html.includes("Secret Transfer"), false);
  assert.equal(html.includes("Marc"), false);
  assert.equal(html.includes("987654"), false);
  assert.equal(html.includes("NOTE-INTERNE-XYZ"), false);
  assert.equal(html.includes("Appeler"), false);
  assert.equal(html.includes("wa.me"), false);
});
