import assert from "node:assert/strict";
import test from "node:test";
import { shapeClientLedger } from "./client-ledger";
import { ledgerTravelerLabel } from "./ledger-travelers";
import { pdfPlainText } from "./pdf-raster";
import {
  buildStatement,
  formatStatementMoney,
  statementAmountLabel,
  statementHolderLines,
  statementNumber,
  statementObjectPath,
  statementWhatsappBody,
  statementWireAmount,
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
  assert.equal(model.includeWire, true);
  assert.equal(model.wireAmount, "300,00 EUR");
  const rows = model.sections.flatMap((section) => section.rows);
  assert.equal(rows.some((row) => row.title === "Séjour" && row.debit.includes("500,00")), true);
  assert.equal(rows.some((row) => row.title === "Virement" && row.credit.includes("200,00")), true);
  assert.match(rows.map((row) => row.meta).join(" "), /TB-2026-0038/);
});

test("le relevé imprime les voyageurs du débit", async () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -2190,
    currency: "EUR",
    audience: "client",
    bookings: [
      {
        id: "b1",
        title: "Milan",
        destination: "Milan",
        reference: "TB-2026-0145",
        start_date: "2027-02-03",
        end_date: "2027-02-08",
        visible_to_client: true,
      },
    ],
    parties: {
      cards: [
        {
          id: "viu",
          booking_id: "b1",
          details: { rooms: [{ guests: "Sid Ahmed Badsi" }] },
        },
      ],
    },
    rows: [
      tx({
        id: "hotel",
        direction: "debit",
        kind: "booking",
        amount: 2190,
        booking_id: "b1",
        external_id: "booking:b1:item:viu",
        label: "Hôtel · VIU Milan",
      }),
    ],
  });
  const model = buildStatement({
    view,
    holderName: "Benjamin Amar",
    holderLines: [],
    issuedAt: ISSUED,
  });
  const row = model.sections.flatMap((section) => section.rows)[0];
  assert.equal(ledgerTravelerLabel(view.movements[0]?.travelerNames, 0), "Voyageur : Sid Ahmed Badsi");
  assert.match(row?.meta || "", /Voyageur : Sid Ahmed Badsi/);
  assert.match(row?.meta || "", /TB-2026-0145/);
  const bytes = await renderStatementPdf(model);
  const { text } = await pdfPlainText(bytes);
  assert.match(text, /Sid Ahmed Badsi/);
  assert.match(text, /VIU Milan|Hôtel/);
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
  assert.equal(model.includeWire, false);
  assert.equal(model.wireAmount, null);
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
  assert.equal(model.includeWire, true);
  assert.equal(model.wireAmount, null);
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
  // Le badge TBA est embarqué en image dans l’en-tête, pas un carré tracé.
  assert.match(Buffer.from(bytes).toString("latin1"), /\/Subtype \/Image/);
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
  assert.equal(text.includes("IBAN"), false);
});

test("le PDF imprime le RIB pour le virement", async () => {
  const model = buildStatement({
    view: ledger(),
    holderName: "Camille Morel",
    holderLines: statementHolderLines(holder),
    issuedAt: ISSUED,
  });
  const bytes = await renderStatementPdf({
    ...model,
    wireLines: [
      "Montant à virer 300,00 EUR",
      "Titulaire Travel Business Agency",
      "IBAN FR76 3000 6000 0112 3456 7890 189",
      "BIC REVOFRP2",
      "Référence Camille Morel",
      "Indiquez cette référence sur l'ordre de virement. L'agence le rapproche dès réception sur son compte Revolut.",
    ],
  });
  const { text, pages } = await pdfPlainText(bytes);
  assert.equal(pages, 1);
  assert.match(text, /Virement/);
  assert.match(text, /Montant à virer 300,00 EUR/);
  assert.match(text, /Titulaire Travel Business Agency/);
  assert.match(text, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(text, /REVOFRP2/);
  assert.match(text, /Référence Camille Morel/);
  assert.match(text, /compte Revolut/);
  assert.equal(text.includes("Stripe"), false);
});

test("le montant à virer suit le seul encours en euros", () => {
  const due = statementWireAmount({
    member: false,
    pockets: null,
    wallets: [{ currency: "EUR", balanceValue: -300, debits: 500, remaining: 300, remainingPct: 40, creditCount: 1 }],
  });
  assert.equal(due, "300,00 EUR");
  assert.equal(
    statementWireAmount({
      member: false,
      pockets: [{ label: "Crédit", name: "Crédit", balance: -10, debits: 10, due: 10, funding: "advance", companyId: "a", creditCount: 0, remainingPct: null }],
      wallets: [{ currency: "EUR", balanceValue: -10, debits: 10, remaining: 10, remainingPct: null, creditCount: 0 }],
    }),
    null
  );
  assert.equal(
    statementWireAmount({
      member: false,
      pockets: null,
      wallets: [
        { currency: "EUR", balanceValue: -10, debits: 10, remaining: 10, remainingPct: null, creditCount: 0 },
        { currency: "USD", balanceValue: -5, debits: 5, remaining: 5, remainingPct: null, creditCount: 0 },
      ],
    }),
    "10,00 EUR"
  );
  assert.equal(
    statementWireAmount({
      member: true,
      pockets: null,
      wallets: [{ currency: "EUR", balanceValue: -10, debits: 10, remaining: 10, remainingPct: null, creditCount: 0 }],
    }),
    null
  );
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
