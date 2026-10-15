import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { exampleLedgerView, exampleSession } from "./example-session";
import type { CrmTransaction } from "./types";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ refresh() {}, push() {} }) };
  }
  return load.call(this, request, parent, isMain);
};

const previewModule = import("../../components/account/ClientInterfacePreview");

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

test("l’aperçu Interface client montre l’onglet Transactions et le grand livre", async () => {
  const { ClientInterfacePreview } = await previewModule;
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

test("Interface client envoie le lien WhatsApp, l’aperçu local non", async () => {
  const { ClientInterfacePreview } = await previewModule;
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
      shareUrl: "https://travelba.fr/v/ABCDEFGH",
      shareCompanions: [
        {
          travelerId: "voyageur-1",
          companionId: "compagnon-1",
          firstName: "Inès",
          lastName: "Morel",
          hasPhone: true,
        },
      ],
    })
  );
  assert.match(html, /Envoyer à Inès par WhatsApp/);
  assert.match(html, /data-partage="\/api\/admin\/bookings\/exemple-sejour\/partage"/);
  assert.doesNotMatch(html, /aucun message n’est envoyé/);
});
