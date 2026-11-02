import assert from "node:assert/strict";
import test from "node:test";
import {
  invoiceDocument,
  invoiceTemplatePreview,
  pickStripePayUrl,
  stripePayUrlOf,
} from "./invoice-document";
import { renderInvoicePdf } from "./invoice-pdf";

const base = {
  number: "4531",
  reference: "TB-2026-0034",
  title: "Marrakech",
  dates: "8 oct. 2026 — 11 oct. 2026",
  billTo: ["Ada Lovelace", "1 rue du Test", "75001 Paris"],
  lines: [{ label: "Hôtel Mamounia", amount: 1050 }],
  deposits: [{ amount: 200, currency: "EUR" }, { amount: 50, currency: "MAD" }],
  now: new Date("2026-10-01T10:00:00.000Z"),
  payerFirstName: "Ada",
  wire: {
    iban: "FR7630006000011234567890189",
    bic: "REVOFRP2",
    holder: "Travel Business Agency",
    source: "revolut" as const,
  },
};

test("la facture pro forma porte l’agence, le RIB et le reste à payer, sans logiciel de facturation", () => {
  const doc = invoiceDocument(base);
  assert.equal(doc.kicker, "Facture pro forma");
  assert.equal(doc.vatMode, "marge");
  assert.equal(doc.deposits, 200);
  assert.equal(doc.balance, 850);
  assert.equal(doc.foreignDeposits, true);
  assert.equal(doc.dueLabel, "À réception");
  assert.equal(doc.paymentMissing, false);
  assert.match(doc.message, /Reste à payer/);
  assert.match(doc.message, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(doc.message, /REVOFRP2/);
  assert.equal(doc.message.includes("MB3M"), false);
  assert.equal(doc.legal.join(" ").includes("MB3M"), false);
  assert.equal(doc.issuer.some((line) => line.includes("43865")), true);
  assert.equal(doc.issuer.some((line) => line.includes("IM092260002")), true);
  assert.equal(doc.issuer.some((line) => line.includes("07 72 15 82 57")), true);
  assert.equal(doc.missing.some((line) => line.includes("hors euros")), true);
});

test("un délai d’échéance et un taux de TVA suivent les données", () => {
  const doc = invoiceDocument({
    ...base,
    dueDays: 15,
    deposits: [],
    lines: [{ label: "Visa", amount: 120, vatRate: 20 }],
  });
  assert.equal(doc.vatMode, "detail");
  assert.equal(doc.htLabel?.includes("100"), true);
  assert.equal(doc.dueLabel.includes("2026"), true);
  assert.equal(doc.balance, 120);
});

test("sans RIB, la facture le dit et n’invente pas d’IBAN", () => {
  const doc = invoiceDocument({ ...base, wire: null, deposits: [], stripeUrl: "https://buy.stripe.com/test_exemple" });
  assert.equal(doc.paymentMissing, true);
  assert.equal(doc.paymentLines.length, 0);
  assert.match(doc.message, /coordonnées de virement/);
  assert.equal(doc.stripeUrl, "https://buy.stripe.com/test_exemple");
  assert.match(doc.message, /buy\.stripe\.com/);
});

test("un lien qui n’est pas Stripe est ignoré", () => {
  assert.equal(stripePayUrlOf("https://example.com/pay"), null);
  assert.equal(stripePayUrlOf("http://buy.stripe.com/abc"), null);
  assert.equal(
    pickStripePayUrl(
      [{ url: "https://buy.stripe.com/abc", active: true, metadata: { crm_booking_id: "b1" } }],
      "b1",
      "TB-1"
    ),
    "https://buy.stripe.com/abc"
  );
  assert.equal(
    pickStripePayUrl([{ url: "https://buy.stripe.com/abc", metadata: { reference: "autre" } }], "b1", "TB-1"),
    null
  );
});

test("le modèle WhatsApp décrit le reste à payer", () => {
  const doc = invoiceDocument(base);
  const preview = invoiceTemplatePreview(doc);
  assert.match(preview || "", /Reste à payer/);
  assert.match(preview || "", /IBAN/);
  assert.equal((preview || "").includes("MB3M"), false);
});

test("le PDF ne contient pas le nom du logiciel de facturation", async () => {
  const pdf = Buffer.from(await renderInvoicePdf(base));
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.equal(pdf.toString("latin1").includes("MB3M"), false);
});
