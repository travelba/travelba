import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStatement, statementHolderLines } from "./statement";
import { shapeClientLedger } from "./client-ledger";
import { attachStatementWire, loadStatementWire, statementWireLines, type StatementWire } from "./statement-wire";
import type { CrmTransaction } from "./types";

const FR = "FR7630006000011234567890189";
const WIRE: StatementWire = { iban: ` ${FR.toLowerCase()} `, bic: "revofrp2", holder: "Travel Business Agency" };

test("le RIB du relevé reprend titulaire, IBAN, BIC et le nom du client", () => {
  const lines = statementWireLines(WIRE, "Camille Morel", "300,00 EUR");
  assert.deepEqual(lines, [
    "Montant à virer 300,00 EUR",
    "Titulaire Travel Business Agency",
    "IBAN FR76 3000 6000 0112 3456 7890 189",
    "BIC REVOFRP2",
    "Référence Camille Morel",
    "Indiquez cette référence sur l'ordre de virement. L'agence le rapproche dès réception sur son compte Revolut.",
  ]);
  assert.equal(lines.join(" ").includes("Stripe"), false);
});

test("sans reste à payer, le RIB reste et le montant disparaît", () => {
  const lines = statementWireLines({ iban: FR, bic: "", holder: "" }, "Camille Morel", null);
  assert.equal(lines.some((line) => line.startsWith("Montant")), false);
  assert.equal(lines.some((line) => line.startsWith("BIC")), false);
  assert.match(lines.join("\n"), /Titulaire Travel Business Agency/);
});

test("un IBAN illisible ne s’imprime pas", () => {
  const lines = statementWireLines({ iban: "123", bic: "REVOFRP2", holder: "Travel Business Agency" }, "Camille", null);
  assert.deepEqual(lines, ["Les coordonnées de virement sont confirmées par l'agence."]);
  assert.equal(lines.join(" ").includes("123"), false);
});

test("Revolut prime sur le réglage Facture", async () => {
  let settings = 0;
  const wire = await loadStatementWire({
    revolut: async () => WIRE,
    settings: async () => {
      settings += 1;
      return { iban: "FR7611111111111111111111111", bic: "AUTRE", holder: "Autre" };
    },
  });
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.bic, "REVOFRP2");
  assert.equal(settings, 0);
});

test("le réglage Facture ne s’imprime que si Revolut ne fournit pas d’IBAN", async () => {
  const wire = await loadStatementWire({
    revolut: async () => null,
    settings: async () => ({ iban: "fr76 3000 6000 0112 3456 7890 189", bic: "revofrp2", holder: "Travel Business Agency" }),
  });
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.holder, "Travel Business Agency");
});

test("le relevé de frais n’ajoute pas de virement", async () => {
  const view = shapeClientLedger({
    companyRole: "member",
    travelerBookingIds: ["b1"],
    walletBalance: 0,
    currency: "EUR",
    audience: "client",
    bookings: [],
    rows: [
      {
        id: "fee",
        customer_id: "c1",
        booking_id: "b1",
        currency: "EUR",
        occurred_on: "2026-10-06",
        label: "Train",
        source: "manual",
        external_id: null,
        status: "posted",
        created_at: "2026-10-06T00:00:00Z",
        updated_at: "2026-10-06T00:00:00Z",
        direction: "debit",
        kind: "booking",
        amount: 80,
      } as CrmTransaction,
    ],
  });
  const model = await attachStatementWire(
    buildStatement({
      view,
      holderName: "Camille Morel",
      holderLines: statementHolderLines({}),
      issuedAt: new Date("2026-10-06T12:00:00.000Z"),
    }),
    async () => WIRE
  );
  assert.deepEqual(model.wireLines, []);
});

test("les relevés passent par le PDF qui lit le RIB", () => {
  const files = [
    "lib/crm/statement-dispatch.ts",
    "app/api/client/ledger/releve/route.ts",
    "app/api/exemple/releve/route.ts",
    "lib/crm/concierge-space-live.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("renderAccountStatementPdf"), true, file);
    assert.equal(source.includes("renderStatementPdf"), false, file);
  }
});
