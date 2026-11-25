import assert from "node:assert/strict";
import test from "node:test";
import { appendSharedStays, sharedStatementStays } from "./twin-statement";
import { statementExportName } from "./statement-filename";
import type { StatementModel } from "./statement";

const empty: StatementModel = {
  title: "Relevé de compte",
  issuedOn: "19 novembre 2026",
  number: "REL-20261119",
  holderName: "Guy Boukris",
  holderLines: [],
  summaries: [{ label: "Encours", value: "0,00 EUR", hint: null }],
  allowances: [],
  sections: [{ heading: "Mouvements", stays: [], rows: [] }],
  emptyNote: "Aucun mouvement comptabilisé à cette date.",
  transfer: null,
};

test("le relevé d’un jumeau reprend les dossiers montrés sans changer l’encours ni le nom", () => {
  const stays = sharedStatementStays(
    [
      {
        id: "b1",
        title: "Tel Aviv",
        destination: "Tel Aviv",
        reference: "TB-2026-0232",
        start_date: "2026-11-01",
        end_date: "2026-11-08",
        visible_to_client: true,
        status: "confirmed",
        currency: "EUR",
      },
      {
        id: "hidden",
        title: "Caché",
        destination: null,
        reference: "TB-2026-0099",
        start_date: null,
        end_date: null,
        visible_to_client: false,
        currency: "EUR",
      },
    ],
    [
      {
        booking_id: "b1",
        customer_id: "beatrice",
        direction: "debit",
        amount: 1200,
        currency: "EUR",
        label: "Séjour",
        occurred_on: "2026-10-01",
        status: "posted",
      },
      {
        booking_id: "b1",
        customer_id: "guy",
        direction: "debit",
        amount: 50,
        currency: "EUR",
        label: "Déjà sur Guy",
        occurred_on: "2026-10-02",
        status: "posted",
      },
    ],
    "guy"
  );
  assert.equal(stays.length, 1);
  assert.match(stays[0].meta, /TB-2026-0232/);
  assert.equal(stays[0].rows.length, 1);
  assert.equal(stays[0].rows[0].title, "Séjour");
  const model = appendSharedStays(empty, stays);
  assert.equal(model.summaries[0].value, "0,00 EUR");
  assert.equal(model.sections.at(-1)?.heading, "Dossiers partagés");
  assert.equal(model.emptyNote, null);
  const name = statementExportName({ last_name: "Boukris" }, { issuedAt: new Date("2026-11-19T12:00:00Z") });
  assert.match(name, /^Relevé de compte TBA - Boukris - Novembre 2026\.pdf$/);
});
