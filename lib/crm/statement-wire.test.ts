import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStatement, statementHolderLines, type StatementSection } from "./statement";
import {
  statementTransfer,
  statementTransferReference,
  statementWireFromParts,
} from "./statement-wire";
import { shapeClientLedger } from "./client-ledger";
import type { CrmTransaction } from "./types";

const FR = "FR7630006000011234567890189";
const ISSUED = new Date("2026-10-06T12:00:00.000Z");

function section(metas: Array<string | null>, stayMeta = ""): StatementSection {
  return {
    heading: "Mouvements",
    stays: stayMeta
      ? [{ title: "Séjour", meta: stayMeta, amount: "", rows: [] }]
      : [],
    rows: metas.map((meta) => ({ date: "", title: "Ligne", meta, debit: "", credit: "" })),
  };
}

test("le module ne contient pas d’IBAN, ni IATA, ni APST", () => {
  const source = readFileSync(new URL("./statement-wire.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
  assert.doesNotMatch(source, /IATA|APST/);
});

test("Revolut prime sur le réglage et les variables", () => {
  const wire = statementWireFromParts(
    { holder: " Travel Business Agency ", iban: ` ${FR.toLowerCase()} `, bic: " revofrp2 " },
    { iban: "FR7611111111111111111111111", bic: "BNPAFRPP", holder: "Réglage" },
    { iban: "DE89370400440532013000", bic: "COBADEFFXXX", holder: "Environnement", bank: "" }
  );
  assert.equal(wire?.source, "revolut");
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.bic, "REVOFRP2");
  assert.equal(wire?.holder, "Travel Business Agency");
  assert.equal(wire?.bank, "Revolut");
});

test("TBA_RIB_BANK remplace le libellé de banque, sans inventer l’IBAN", () => {
  const wire = statementWireFromParts(
    { iban: FR, bic: "REVOFRP2", holder: "" },
    null,
    { bank: "Revolut Bank UAB" }
  );
  assert.equal(wire?.source, "revolut");
  assert.equal(wire?.holder, "TRAVEL BUSINESS AGENCY");
  assert.equal(wire?.bank, "Revolut Bank UAB");
  assert.equal(statementWireFromParts({ iban: "FR76" }, { iban: " " }, { holder: "X" }), null);
});

test("sans Revolut, le réglage Facture prime sur les variables", () => {
  const wire = statementWireFromParts(
    { iban: "compte principal" },
    { iban: FR, bic: "REVOFRP2", holder: "Travel Business Agency" },
    { iban: "DE89370400440532013000", bic: "COBADEFFXXX", bank: "Banque saisie" }
  );
  assert.equal(wire?.source, "reglage");
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.bank, "Banque saisie");
});

test("les variables seules n’affichent pas de banque si TBA_RIB_BANK est vide", () => {
  const wire = statementWireFromParts(null, { iban: null }, {
    holder: "Travel Business Agency",
    iban: "FR76 3000 6000 0112 3456 7890 189",
    bic: "REVOFRP2",
  });
  assert.equal(wire?.source, "env");
  assert.equal(wire?.bank, "");
  const block = statementTransfer(wire, "REL-20261006");
  assert.equal(block?.iban, "FR76 3000 6000 0112 3456 7890 189");
  assert.equal(block?.bic, "REVOFRP2");
  assert.equal(block?.bank, "");
  assert.equal(block?.reference, "REL-20261006");
  assert.doesNotMatch(`${block?.holder} ${block?.iban} ${block?.bic} ${block?.bank} ${block?.reference}`, /IATA|APST/);
});

test("la référence est le dossier unique, sinon le numéro du relevé", () => {
  assert.equal(
    statementTransferReference({
      number: "REL-20261006",
      sections: [section(["Rome · tb-2026-0038"])],
    }),
    "TB-2026-0038"
  );
  assert.equal(
    statementTransferReference({
      number: "REL-20261006",
      sections: [section([], "12 oct. · TB-2026-0145")],
    }),
    "TB-2026-0145"
  );
  assert.equal(
    statementTransferReference({
      number: "REL-20261006",
      sections: [section(["TB-2026-0038", "TB-2026-0040"])],
    }),
    "REL-20261006"
  );
  assert.equal(
    statementTransferReference({ number: "REL-20261006", sections: [section([null])] }),
    "REL-20261006"
  );
});

test("le relevé de compte à un seul dossier reprend cette référence", () => {
  const view = shapeClientLedger({
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
      {
        id: "debit",
        customer_id: "c1",
        booking_id: "b1",
        currency: "EUR",
        occurred_on: "2026-10-06",
        label: "Séjour Rome",
        source: "manual",
        external_id: null,
        status: "posted",
        created_at: "2026-10-06T00:00:00Z",
        updated_at: "2026-10-06T00:00:00Z",
        direction: "debit",
        kind: "booking",
        amount: 500,
      } satisfies CrmTransaction,
    ],
  });
  const model = buildStatement({
    view,
    holderName: "Camille Morel",
    holderLines: statementHolderLines({}),
    issuedAt: ISSUED,
  });
  assert.equal(model.transfer, null);
  assert.equal(statementTransferReference(model), "TB-2026-0038");
});
