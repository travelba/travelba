import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import { IngestItemCard } from "../../components/crm/IngestItemCard";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";
import { transferDescription, transferProviderPhone } from "./transfer-contact";

test("la description du transfert reprend le nom et le numéro, rien d’autre", () => {
  assert.equal(transferProviderPhone({ phone: "+33612345678" }), "+33 6 12 34 56 78");
  assert.equal(transferProviderPhone({ phone: "  " }), "");
  assert.equal(
    transferDescription({
      supplier: "Alpine Transfers",
      confirmation_ref: "TR-9",
      visible_to_client: true,
      details: { phone: "+33612345678", driver: "Marc", document_amount: 987654, notes: "NOTE-INTERNE" },
    }),
    "Alpine Transfers · +33 6 12 34 56 78 · TR-9"
  );
  assert.equal(
    transferDescription({
      supplier: "Alpine Transfers",
      visible_to_client: false,
      details: { phone: "+33612345678" },
    }),
    "Alpine Transfers"
  );
  assert.equal(transferDescription({ supplier: "Alpine Transfers", visible_to_client: true, details: {} }), "Alpine Transfers");
});

test("le carnet écrit le numéro dans la description, sans bouton", () => {
  const item = {
    id: "transfert",
    booking_id: "b1",
    kind: "transfer" as const,
    title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
    supplier: "Alpine Transfers",
    confirmation_ref: null,
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
      driver: "Marc",
      document_amount: 987654,
      notes: "NOTE-INTERNE-XYZ",
    },
  } satisfies CrmBookingItem;
  const hidden = { ...item, id: "cache", visible_to_client: false, supplier: "Secret Transfer", details: { phone: "+33699999999" } };
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
  assert.match(html, /Alpine Transfers · \+33 6 12 34 56 78/);
  assert.equal(html.includes("Appeler"), false);
  assert.equal(html.includes("wa.me"), false);
  assert.equal(html.includes("Marc"), false);
  assert.equal(html.includes("+33699999999"), false);
  assert.equal(html.includes("987654"), false);
  assert.equal(html.includes("NOTE-INTERNE-XYZ"), false);

  const editor = renderToStaticMarkup(
    createElement(IngestItemCard, {
      item: {
        kind: "transfer",
        title: item.title,
        supplier: "Alpine Transfers",
        confirmation_ref: null,
        start_at: item.start_at,
        end_at: null,
        amount: null,
        details: { pickup: "Gare de Moûtiers", dropoff: "Hôtel", pickup_note: "2 h avant" },
      },
      onChange: () => {},
      onRemove: () => {},
    })
  );
  assert.match(editor, /Fournisseur/);
  assert.match(editor, /Note sans heure/);
  assert.equal(editor.includes("Téléphone du prestataire"), false);
  assert.equal(editor.includes("Chauffeur"), false);
  assert.equal(editor.includes(">Prestataire<"), false);
});
