import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrmEmailIngest } from "./types";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ refresh() {}, push() {} }) };
  }
  return load.call(this, request, parent, isMain);
};

const inboxModule = import("../../components/admin/EmailIngestInbox");

const row: CrmEmailIngest = {
  id: "mail-1",
  gmail_message_id: "gmail-1",
  gmail_thread_id: null,
  label: "reservations-tba",
  from_email: "reservations@travelba.fr",
  subject: null,
  received_at: "2026-10-21T13:05:09.000Z",
  body_text: "",
  body_html: '<div dir="ltr"><br></div>',
  status: "matched",
  extract: {
    document_status: "confirmed",
    title: "Dubaï · Paris",
    start_date: "2027-08-25",
    end_date: "2027-08-25",
    currency: "EUR",
    items: [
      {
        kind: "flight",
        title: "Emirates - EK 706",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T08:25:00",
        details: { document_amount: 5235, document_currency: "EUR", flight_number: "EK 706" },
      },
      {
        kind: "flight",
        title: "Emirates - EK 75",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T14:40:00",
        details: { document_amount: 5235, document_currency: "EUR", flight_number: "EK 75" },
      },
    ],
    travelers: [],
  },
  candidates: [],
  attachments: [],
  warnings: [],
  suggested_customer_id: "client-1",
  suggested_booking_id: null,
  created_booking_id: null,
  error: null,
  created_at: "2026-10-21T13:05:09.000Z",
  updated_at: "2026-10-21T13:05:09.000Z",
};

test("le mail Emirates n’affiche ni le choix de carte, ni la date deux fois, ni le total deux fois", async () => {
  const { EmailIngestInbox } = await inboxModule;
  const html = renderToStaticMarkup(
    createElement(EmailIngestInbox, {
      rows: [row],
      initialOpenId: "mail-1",
      customers: [
        {
          id: "client-1",
          first_name: "Camille",
          last_name: "Martin",
          company_name: null,
          email: "",
          phone: null,
        },
      ],
    })
  );
  assert.equal(html.includes("Choisissez la carte à remplacer"), false);
  assert.equal(html.includes("25 — 25"), false);
  assert.match(html, /25 août 2027/);
  assert.match(html, /Ce mail n’a pas de texte/);
  assert.match(html, /Sans objet/);
  assert.match(html, /n’est pas répété/);
  assert.match(html, /Total du billet, une fois pour ces vols/);
  assert.match(html, /Déposer les pièces/);
  assert.equal(html.includes("Mettre à jour les cartes"), false);
  assert.equal(html.includes("Rattacher au voyage"), false);
  assert.equal(html.includes("Ignorer"), false);
  assert.equal(html.includes("Refuser"), false);
  assert.match(html, /Classer/);
  assert.match(html, /Aucune étape n’est créée ni modifiée/);
  assert.equal(html.split("Prix imprimé sur le document").length - 1, 1);
});
