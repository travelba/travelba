import assert from "node:assert/strict";
import test from "node:test";
import { invoiceDocument } from "./invoice-document";
import type { InvoiceSnapshot } from "./invoice-context";
import { deliverInvoice, invoicePreview, invoiceSendBlocked } from "./invoice-send";

function snapshot(extra?: Partial<InvoiceSnapshot>): InvoiceSnapshot {
  const document = invoiceDocument({
    number: "4531",
    reference: "TB-2026-0034",
    title: "Marrakech",
    dates: "",
    billTo: ["Ada Lovelace"],
    lines: [{ label: "Hôtel", amount: 100 }],
    payerFirstName: "Ada",
    wire: { iban: "FR7630006000011234567890189", bic: "REVOFRP2", holder: "Travel Business Agency", source: "reglage" },
    now: new Date("2026-10-01T10:00:00.000Z"),
  });
  return {
    bookingId: "11111111-1111-4111-8111-111111111111",
    customerId: "22222222-2222-4222-8222-222222222222",
    document,
    email: "ada@exemple.fr",
    phone: "+33600000000",
    whatsappOptOut: false,
    windowOpen: true,
    templateSid: null,
    previewBlocked: false,
    ...extra,
  };
}

test("l’aperçu n’envoie rien et dit si le RIB est là", () => {
  const preview = invoicePreview(snapshot(), false);
  assert.equal(preview.envoye, false);
  assert.equal(preview.rib, "present");
  assert.equal(preview.email.pret, true);
  assert.equal(preview.whatsapp.pret, true);
  assert.match(preview.apercu, /Reste à payer/);
  assert.equal(preview.apercu.includes("MB3M"), false);
});

test("hors fenêtre sans modèle, WhatsApp n’est pas prêt", () => {
  const preview = invoicePreview(snapshot({ windowOpen: false, templateSid: null }), false);
  assert.equal(preview.whatsapp.pret, false);
  assert.match(preview.modele || "", /facture_paiement/);
  assert.match(preview.modele || "", /TWILIO_CONTENT_FACTURE/);
});

test("un envoi réussi récent bloque, un refus non", () => {
  assert.equal(invoiceSendBlocked(["Facture pro forma n° 1 : e-mail envoyé, par Ada."], false), true);
  assert.equal(invoiceSendBlocked(["Facture pro forma n° 1 : e-mail refusé, par Ada."], false), false);
  assert.equal(invoiceSendBlocked(["Facture pro forma n° 1 : e-mail envoyé, par Ada."], true), false);
});

test("confirmer envoie l’e-mail et WhatsApp, et prépare le journal", async () => {
  const calls: string[] = [];
  const result = await deliverInvoice(snapshot(), ["email", "whatsapp"], {
    pdf: new Uint8Array([1]),
    sendEmail: async () => {
      calls.push("email");
      return { ok: true };
    },
    sendSession: async () => {
      calls.push("session");
      return { ok: true, sid: "SM1" };
    },
    sendTemplate: async () => {
      calls.push("template");
      return { ok: true, sid: "SM2" };
    },
    upload: async () => {
      calls.push("upload");
    },
    objectPath: "customers/x/factures/y.pdf",
    mediaPath: "token/facture.pdf",
    mediaUrl: "https://travelba.fr/api/whatsapp/factures/token/facture.pdf",
    sessionTo: "whatsapp:+33600000000",
  });
  assert.deepEqual(calls, ["email", "upload", "session"]);
  assert.equal(result.ok, true);
  assert.equal(result.email, "envoye");
  assert.equal(result.whatsapp, "envoye");
  assert.equal(result.twilio_sid, "SM1");
  assert.match(result.journal, /envoyé/);
  assert.equal(result.journal.includes("FR76"), false);
});
