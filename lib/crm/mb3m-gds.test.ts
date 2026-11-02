import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mb3mAmadeusSentence } from "./mb3m-prep";
import { chargesWithoutGdsFlights, gdsFlightsFromStay, planGdsFlights, type GdsFlight, type GdsRemoteInvoice } from "./mb3m-gds";

function flight(patch: Partial<GdsFlight> = {}): GdsFlight {
  return {
    itemId: "item-1",
    label: "Rome → Paris",
    pnrs: ["ABC123"],
    amount: 420,
    startAt: "2026-11-02T09:00:00",
    passengers: [{ firstName: "Ada", lastName: "Lovelace" }],
    transactionId: "tx-flight",
    countsInStay: true,
    ...patch,
  };
}

function invoice(patch: Partial<GdsRemoteInvoice> = {}): GdsRemoteInvoice {
  return {
    number: "3001",
    refCommand: " abc123 ",
    folderId: null,
    cancelled: false,
    amount: 420,
    date: "2026-11-02",
    activityIds: [2],
    travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    ...patch,
  };
}

describe("vols déjà dans MB3M via Amadeus", () => {
  it("reconnaît le PNR sans tenir compte de la casse ni des espaces", () => {
    const plan = planGdsFlights({
      flights: [flight()],
      invoices: [invoice({ folderId: "01-0009" })],
      dossierFolderId: "01-0009",
    });
    assert.equal(plan.error, null);
    assert.equal(plan.covered[0]?.invoiceNumber, "3001");
    assert.equal(plan.covered[0]?.placement, "here");
    assert.equal(plan.suggestions.length, 0);
  });

  it("refuse quand deux factures portent le même PNR", () => {
    const plan = planGdsFlights({
      flights: [flight()],
      invoices: [invoice(), invoice({ number: "3002", folderId: "autre" })],
      dossierFolderId: "01-0009",
    });
    assert.match(plan.error || "", /ABC123/);
    assert.match(plan.error || "", /3001/);
    assert.match(plan.error || "", /3002/);
    assert.equal(plan.covered.length, 0);
  });

  it("garde le vol sans PNR et propose seulement une facture sans dossier", () => {
    const plan = planGdsFlights({
      flights: [flight({ pnrs: [], amount: 419.2 })],
      invoices: [
        invoice({ number: "3001", refCommand: "", folderId: null, amount: 420, date: "2026-11-03" }),
        invoice({ number: "3008", refCommand: "", folderId: "deja", amount: 420 }),
      ],
      dossierFolderId: null,
    });
    assert.equal(plan.covered.length, 0);
    assert.deepEqual(plan.suggestions.map((row) => row.invoiceNumber), ["3001"]);
  });

  it("ne déplace pas une facture déjà dans un autre dossier", () => {
    const plan = planGdsFlights({
      flights: [flight()],
      invoices: [invoice({ folderId: "01-autre" })],
      dossierFolderId: "01-0009",
    });
    assert.equal(plan.covered[0]?.placement, "other");
    assert.match(mb3mAmadeusSentence(plan.covered[0]!), /déjà dans MB3M via Amadeus \(facture n°3001\)/);
    assert.match(mb3mAmadeusSentence(plan.covered[0]!), /n’a pas été déplacée/);
  });

  it("retire la ligne du vol, ou sa part du montant du séjour", () => {
    const covered = planGdsFlights({
      flights: [flight({ transactionId: null, amount: 200 })],
      invoices: [invoice()],
      dossierFolderId: null,
    }).covered;
    const charges = chargesWithoutGdsFlights(
      [
        { id: "stay", external_id: null, amount: 800, kind: "booking", direction: "debit" },
        { id: "hotel", external_id: "booking:1:item:hotel", amount: 600, kind: "booking", direction: "debit" },
      ],
      covered
    );
    assert.equal(charges.find((row) => row.id === "stay")?.amount, 600);
    const own = chargesWithoutGdsFlights(
      [{ id: "tx-flight", external_id: "booking:1:item:item-1", amount: 420, kind: "booking", direction: "debit" }],
      planGdsFlights({ flights: [flight()], invoices: [invoice()], dossierFolderId: null }).covered
    );
    assert.equal(own.length, 0);
  });

  it("lit le PNR de la carte", () => {
    const rows = gdsFlightsFromStay(
      [
        {
          id: "11111111-2222-4333-8444-555555555555",
          kind: "flight",
          title: "Rome → Paris",
          confirmation_ref: "abc123",
          amount: 210,
          start_at: "2026-11-02",
          details: { pnr: "abc123", passengers: [{ first_name: "Ada", last_name: "Lovelace" }] },
        },
      ],
      [
        {
          id: "tx-1",
          external_id: "booking:1:item:11111111-2222-4333-8444-555555555555",
          amount: 210,
          kind: "booking",
          direction: "debit",
        },
      ]
    );
    assert.deepEqual(rows[0]?.pnrs, ["ABC123"]);
    assert.equal(rows[0]?.transactionId, "tx-1");
  });
});
