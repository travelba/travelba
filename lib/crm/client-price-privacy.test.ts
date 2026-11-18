import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_MONEY_NOTICE,
  clientFacingMoney,
  clientHidesPrices,
  isClientInvoiceDocument,
  isClientMoneyFile,
  stayHidesPrices,
  stripClientMoneyItem,
} from "./client-price-privacy";

const payload = {
  total_amount: 1200,
  currency: "EUR",
  title: "Tel Aviv et les Seychelles",
  items: [
    {
      id: "vol",
      title: "Paris → Tel Aviv",
      amount: 400,
      details: { document_amount: 350, supplier_net: 300, flight_number: "AF132" },
    },
  ],
  ledger: {
    balance: -200,
    movements: [{ amount: 400, amountLabel: "400,00 €", title: "Vol" }],
  },
  paymentUrl: "https://buy.stripe.com/test_session",
  documents: [
    { kind: "ticket", file_name: "billet.pdf", storage_path: "bookings/1/billet.pdf" },
    { kind: "invoice", file_name: "facture.pdf", storage_path: "customers/1/mb3m/facture.pdf" },
    { kind: "pdf", file_name: "releve-de-compte.pdf", storage_path: "customers/1/releves/releve-de-compte.pdf" },
  ],
};

test("sans l’option, la réponse client garde les montants", () => {
  assert.equal(clientHidesPrices({ hide_client_prices: false }), false);
  assert.equal(clientHidesPrices(null), false);
  const shown = clientFacingMoney(payload, false);
  assert.equal(shown.total_amount, 1200);
  assert.equal(shown.items[0]?.amount, 400);
  assert.equal(shown.documents.length, 3);
});

test("avec l’option, la réponse client n’a plus aucun montant ni facture", () => {
  assert.equal(clientHidesPrices({ hide_client_prices: true }), true);
  const hidden = clientFacingMoney(payload, true);
  const text = JSON.stringify(hidden);
  assert.equal(text.includes("1200"), false);
  assert.equal(text.includes("400"), false);
  assert.equal(text.includes("350"), false);
  assert.equal(text.includes("300"), false);
  assert.equal(text.includes("-200"), false);
  assert.equal(text.includes("stripe"), false);
  assert.equal(text.includes("amount"), false);
  assert.equal(text.includes("balance"), false);
  assert.equal(hidden.title, "Tel Aviv et les Seychelles");
  assert.equal(hidden.currency, "EUR");
  assert.equal(hidden.items[0]?.title, "Paris → Tel Aviv");
  assert.equal((hidden.items[0]?.details as { flight_number?: string }).flight_number, "AF132");
  assert.equal("amount" in (hidden.items[0] || {}), false);
  assert.deepEqual(
    hidden.documents.map((doc) => doc.file_name),
    ["billet.pdf"]
  );
  assert.equal(CLIENT_MONEY_NOTICE.includes("€"), false);
});

test("une carte vol perd son prix et son net, pas le numéro de vol", () => {
  const card = stripClientMoneyItem({
    id: "h",
    title: "Hôtel",
    amount: 890,
    details: { supplier_net_eur: 740, room: "Deluxe" },
  });
  assert.equal("amount" in card, false);
  assert.equal((card.details as { room?: string }).room, "Deluxe");
  assert.equal("supplier_net_eur" in (card.details as object), false);
});

test("le relevé, la pro forma et la facture sont des fichiers d’argent", () => {
  assert.equal(isClientMoneyFile("customers/1/releves/releve-de-compte.pdf"), true);
  assert.equal(isClientMoneyFile("customers/1/mb3m/facture-12.pdf"), true);
  assert.equal(isClientMoneyFile("bookings/1/Facture-pro-forma.pdf"), true);
  assert.equal(isClientMoneyFile("customers/1/documents/passeport.jpg"), false);
  assert.equal(isClientMoneyFile("bookings/1/billet.pdf"), false);
  assert.equal(isClientInvoiceDocument({ kind: "invoice", file_name: "amadeus.pdf", storage_path: "bookings/1/a.pdf" }), true);
  assert.equal(isClientInvoiceDocument({ kind: "ticket", file_name: "e-ticket.pdf", storage_path: "bookings/1/e.pdf" }), false);
});

test("un dossier du client masqué l’est aussi pour un autre regard", () => {
  const hidden = new Set(["owner"]);
  assert.equal(stayHidesPrices({ hide_client_prices: false }, "owner", hidden), true);
  assert.equal(stayHidesPrices({ hide_client_prices: true }, "other", new Set()), true);
  assert.equal(stayHidesPrices({ hide_client_prices: false }, "other", new Set()), false);
});
