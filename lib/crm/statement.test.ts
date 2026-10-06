import assert from "node:assert/strict";
import test from "node:test";
import { shapeClientLedger } from "./client-ledger";
import { pdfPlainText } from "./pdf-raster";
import {
  buildStatement,
  formatStatementMoney,
  statementAmountLabel,
  statementHolderLines,
  statementNumber,
  statementObjectPath,
  statementWhatsappBody,
  statementWhatsappFailure,
  type StatementHolder,
} from "./statement";
import { renderStatementPdf } from "./statement-pdf";
import type { CrmTransaction } from "./types";

const ISSUED = new Date("2026-10-06T12:00:00.000Z");

function tx(partial: Partial<CrmTransaction> & Pick<CrmTransaction, "id" | "direction" | "kind" | "amount">): CrmTransaction {
  return {
    customer_id: "c1",
    booking_id: null,
    currency: "EUR",
    occurred_on: "2026-10-06",
    label: "Mouvement",
    source: "manual",
    external_id: null,
    status: "posted",
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
    ...partial,
  };
}

const holder: StatementHolder = {
  company_name: "Atelier Exemple",
  email: "camille.morel@exemple.invalid",
  address_line: "1 place de l'Exemple",
  postal_code: "69002",
  city: "Lyon",
  country: "FR",
};

function ledger() {
  return shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -300,
    currency: "EUR",
    audience: "client",
    bookings: [
      {
        id: "b1",
        title: "Rome",
        destination: "Rome",
        reference: "TB-2026-0038",
        start_date: "2026-10-12",
        end_date: "2026-10-18",
        visible_to_client: true,
      },
    ],
    rows: [
      tx({ id: "debit", direction: "debit", kind: "booking", amount: 500, booking_id: "b1", label: "Séjour Rome" }),
      tx({ id: "credit", direction: "credit", kind: "transfer", amount: 200, label: "Virement" }),
    ],
  });
}

test("le relevé reprend l’encours signé et les mouvements visibles", () => {
  const model = buildStatement({
    view: ledger(),
    holderName: "Camille Morel",
    holderLines: statementHolderLines(holder),
    issuedAt: ISSUED,
  });
  assert.equal(model.title, "Relevé de compte");
  assert.equal(model.number, "REL-20261006");
  assert.match(model.issuedOn, /6 octobre 2026/);
  assert.equal(model.holderName, "Camille Morel");
  assert.deepEqual(model.holderLines, [
    "Atelier Exemple",
    "1 place de l'Exemple",
    "69002 Lyon",
    "camille.morel@exemple.invalid",
  ]);
  assert.equal(model.summaries[0]?.value, "-300,00 EUR");
  assert.match(model.summaries[0]?.hint || "", /Reste à régler/);
  assert.equal(model.summaries[1]?.value, "500,00 EUR");
  assert.equal(model.summaries[2]?.value, "200,00 EUR");
  assert.equal(model.emptyNote, null);
  const rows = model.sections.flatMap((section) => section.rows);
  assert.equal(rows.some((row) => row.title === "Séjour" && row.debit.includes("500,00")), true);
  assert.equal(rows.some((row) => row.title === "Virement" && row.credit.includes("200,00")), true);
  assert.match(rows.map((row) => row.meta).join(" "), /TB-2026-0038/);
});

test("un collaborateur reçoit un relevé de frais, pas l’encours société", () => {
  const view = shapeClientLedger({
    companyRole: "member",
    travelerBookingIds: ["b1"],
    walletBalance: 4000,
    currency: "EUR",
    audience: "client",
    bookings: [],
    rows: [tx({ id: "fee", direction: "debit", kind: "booking", amount: 80, booking_id: "b1", label: "Train" })],
  });
  const model = buildStatement({
    view,
    holderName: "Camille Morel",
    holderLines: [],
    issuedAt: ISSUED,
  });
  assert.equal(model.title, "Relevé de frais");
  assert.equal(model.summaries.length, 1);
  assert.equal(model.summaries[0]?.label, "Total de vos dossiers");
  assert.equal(model.summaries[0]?.value, "80,00 EUR");
  assert.equal(model.sections[0]?.heading, "Frais de voyage");
});

test("sans mouvement, le relevé le dit", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: 0,
    currency: "EUR",
    audience: "client",
    bookings: [],
    rows: [],
  });
  const model = buildStatement({
    view,
    holderName: "Camille Morel",
    holderLines: [],
    issuedAt: ISSUED,
  });
  assert.equal(model.emptyNote, "Aucun mouvement comptabilisé à cette date.");
});

test("montants, chemin et message WhatsApp", () => {
  assert.equal(formatStatementMoney(-20036.04, "EUR"), "-20 036,04 EUR");
  assert.equal(statementAmountLabel("+1\u202f234,50\u00a0€"), "1 234,50 EUR");
  assert.equal(statementNumber(ISSUED), "REL-20261006");
  assert.equal(statementObjectPath("exemple-client"), null);
  assert.equal(
    statementObjectPath("11111111-1111-4111-8111-111111111111"),
    "customers/11111111-1111-4111-8111-111111111111/releves/releve-de-compte.pdf"
  );
  const body = statementWhatsappBody("Camille\nMorel", false);
  assert.match(body, /^Bonjour Camille Morel,/);
  assert.match(body, /Voici votre relevé de compte/);
  assert.doesNotMatch(body, /336/);
  assert.match(statementWhatsappFailure("no_phone", "client"), /Ajoutez un téléphone/);
  assert.match(statementWhatsappFailure("not_configured", "staff"), /n’est pas disponible/);
  assert.equal(statementHolderLines({ country: "France", city: "Lyon" }).includes("France"), false);
});

test("le PDF porte l’agence, le titulaire et les mouvements", async () => {
  const model = buildStatement({
    view: ledger(),
    holderName: "Camille Morel",
    holderLines: statementHolderLines(holder),
    issuedAt: ISSUED,
  });
  const bytes = await renderStatementPdf(model);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("utf8"), "%PDF-");
  const { text, pages } = await pdfPlainText(bytes);
  assert.equal(pages, 1);
  assert.match(text, /TRAVEL BUSINESS AGENCY/);
  assert.match(text, /RELEVÉ DE COMPTE/);
  assert.match(text, /Camille Morel/);
  assert.match(text, /Atelier Exemple/);
  assert.match(text, /69002 Lyon/);
  assert.match(text, /REL-20261006/);
  assert.match(text, /-300,00 EUR/);
  assert.match(text, /Séjour/);
  assert.match(text, /TB-2026-0038/);
  assert.match(text, /Virement/);
  assert.match(text, /991 614 694 00016/);
  assert.match(text, /pas une facture/);
});

test("un long relevé tient sur plusieurs pages", async () => {
  const rows = Array.from({ length: 40 }, (_, index) =>
    tx({
      id: `row-${index}`,
      direction: "debit",
      kind: "adjustment",
      amount: 10 + index,
      label: `Ligne ${String(index + 1).padStart(2, "0")}`,
      external_id: `line-${index}`,
    })
  );
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -1000,
    currency: "EUR",
    audience: "client",
    bookings: [],
    rows,
  });
  const bytes = await renderStatementPdf(
    buildStatement({
      view,
      holderName: "Camille Morel",
      holderLines: statementHolderLines(holder),
      issuedAt: ISSUED,
    })
  );
  const { text, pages } = await pdfPlainText(bytes);
  assert.ok(pages >= 2);
  assert.match(text, /Ligne 01/);
  assert.match(text, /Ligne 40/);
  assert.match(text, /2 \/ /);
});
