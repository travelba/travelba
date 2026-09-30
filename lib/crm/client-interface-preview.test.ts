import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientInterfacePreview } from "../../components/account/ClientInterfacePreview";
import { exampleLedgerView, exampleSession } from "./example-session";
import type { CrmTransaction } from "./types";

function tx(): CrmTransaction {
  return {
    id: "tx1",
    customer_id: "exemple-client",
    booking_id: "exemple-sejour",
    direction: "debit",
    kind: "booking",
    amount: 120,
    currency: "EUR",
    occurred_on: "2026-08-01",
    label: "Frais d’agence 10 %",
    source: "manual",
    external_id: null,
    status: "posted",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

test("l’aperçu Interface client montre l’onglet Transactions et le grand livre", () => {
  const session = exampleSession();
  const html = renderToStaticMarkup(
    createElement(ClientInterfacePreview, {
      booking: session.booking,
      items: session.items,
      documents: [],
      travelers: session.travelers,
      identityDocs: session.holderDocuments,
      companions: session.companions,
      customer: session.customer,
      visaRequests: [],
      refusals: [],
      pliantReady: false,
      shareUrl: null,
      shareCompanions: [],
      ledger: exampleLedgerView([tx()]),
      initialScreen: "transactions",
    })
  );
  assert.match(html, /Navigation du client/);
  assert.match(html, />Transactions</);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Mouvements/);
  assert.match(html, /Séjour/);
  assert.match(html, /120,00/);
});
