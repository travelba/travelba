import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gdsMoveWarning, gdsPdfWarning, mb3mAmadeusSentence } from "./mb3m-prep";
import { chargesWithoutGdsFlights, finishMb3mGds, gdsFlightsFromStay, mb3mKnownCustomerUid, planGdsFlights, type GdsFlight, type GdsRemoteInvoice, type Mb3mGdsPlan } from "./mb3m-gds";
import { mb3mRealm } from "./mb3m";

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

  it("retire le vol Air France déjà facturé sous le PNR Y2FYWL", () => {
    const plan = planGdsFlights({
      flights: [
        flight({
          label: "Air France Paris Charles-de-Gaulle à Marrakech Ménara",
          pnrs: ["Y2FYWL"],
          amount: 1197.44,
          transactionId: "tx-af",
        }),
      ],
      invoices: [
        invoice({
          number: "2005",
          refCommand: "Y2FYWL",
          folderId: null,
          amount: 1197.44,
          printed: true,
        }),
      ],
      dossierFolderId: "01-0002007",
    });
    assert.equal(plan.error, null);
    assert.equal(plan.covered[0]?.invoiceNumber, "2005");
    assert.equal(plan.covered[0]?.pnr, "Y2FYWL");
    assert.equal(plan.covered[0]?.placement, "move");
    const charges = chargesWithoutGdsFlights(
      [
        { id: "tx-af", external_id: "booking:1:item:item-1", amount: 1197.44, kind: "booking", direction: "debit" },
        { id: "fees", external_id: "booking:1:item:fees", amount: 561.19, kind: "booking", direction: "debit" },
      ],
      plan.covered
    );
    assert.deepEqual(charges.map((row) => row.id), ["fees"]);
    assert.equal(charges[0]?.amount, 561.19);
    assert.equal(mb3mKnownCustomerUid(null, ["92c5a491-b764-4c07-9a08-ebf0e56a21a4"]), "92c5a491-b764-4c07-9a08-ebf0e56a21a4");
    assert.equal(mb3mKnownCustomerUid("party-uid", ["autre"]), "party-uid");
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

  it("relie la facture 2005 déjà soldée, sans second PDF ni second lien", async () => {
    const bookingId = "3d9eb840-dae8-4632-b755-f9e61e050b50";
    const itemId = "86ff0e83-235b-418f-91f1-3d64af55011e";
    const pieces: Record<string, unknown>[] = [
      {
        id: "invoice-2157",
        booking_id: bookingId,
        kind: "invoice",
        realm: mb3mRealm(),
        piece_number: "2157",
        folder_id: "01-0002007",
        printed_at: null,
        warning: null,
      },
    ];
    const documents: Record<string, unknown>[] = [
      {
        id: "doc-2005",
        booking_id: bookingId,
        file_name: "Facture n° 2005.pdf",
        visible_to_client: true,
      },
    ];
    function from(table: string) {
      const filters: [string, unknown][] = [];
      let op = "select";
      let payload: Record<string, unknown> | null = null;
      const rows = () => (table === "crm_mb3m_pieces" ? pieces : documents);
      const api = {
        select() {
          return api;
        },
        insert(value: Record<string, unknown>) {
          op = "insert";
          payload = value;
          return api;
        },
        update(value: Record<string, unknown>) {
          op = "update";
          payload = value;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        is() {
          return api;
        },
        not() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve(one());
        },
        single() {
          return Promise.resolve(one());
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve(finish());
        },
      };
      function matching() {
        return rows().filter((row) => filters.every(([column, value]) => row[column] === value));
      }
      function finish() {
        if (op === "insert" && payload) {
          const row = { id: `${table}-${rows().length + 1}`, ...payload };
          rows().push(row);
          return { data: row, error: null };
        }
        if (op === "update" && payload) {
          for (const row of matching()) Object.assign(row, payload);
          return { data: null, error: null };
        }
        return { data: matching(), error: null };
      }
      function one() {
        const result = finish();
        const data = Array.isArray(result.data) ? result.data[0] || null : result.data;
        return { data, error: null };
      }
      return api;
    }
    const plan: Mb3mGdsPlan = {
      covered: [
        {
          itemId,
          label: "Air France Paris Charles-de-Gaulle à Marrakech Ménara",
          pnr: "Y2FYWL",
          invoiceNumber: "2005",
          transactionId: "8a9bd2f1-79de-4fb2-ac75-98a66e632e56",
          countsInStay: true,
          amount: 1197.44,
          folderId: null,
          placement: "move",
          printed: true,
          pieceUid: "b0ffa2ce-0adb-4ba9-8214-202609141014",
          moveWarning: null,
        },
      ],
      suggestions: [],
      invoices: [{ number: "2005", amount: 1197.44 }],
      customerUid: "92c5a491-b764-4c07-9a08-ebf0e56a21a4",
      folderId: "01-0002007",
      warnings: [],
    };
    let renders = 0;
    const deps = {
      changeFolder: async () => {
        throw new Error("Impossible de modifier une prestation dont la facture fournisseur associée est soldée");
      },
      renderPiece: async () => {
        renders += 1;
        return { bytes: Buffer.from("%PDF-1.4"), contentType: "application/pdf", fileName: "Facture.pdf" };
      },
    };
    const input = {
      bookingId,
      plan,
      folderId: "01-0002007",
      folderUid: "b127ebaa-8fcd-4399-99c2-202611021224",
      title: "Paris · Marrakech",
      dateStart: "2026-10-09",
      dateEnd: "2026-10-11",
      destination: "Marrakech",
      destinationIso: "MA",
    };
    const supabase = { from } as unknown as SupabaseClient;
    await finishMb3mGds(supabase, input, deps);
    await finishMb3mGds(supabase, { ...input, plan: { ...plan, warnings: [] } }, deps);
    const gds = pieces.filter((row) => row.kind === "gds");
    assert.equal(gds.length, 1);
    assert.equal(gds[0]?.piece_number, "2005");
    assert.equal(gds[0]?.document_id, "doc-2005");
    assert.equal(documents.length, 1);
    assert.equal(renders, 0);
    assert.match(String(pieces.find((row) => row.kind === "invoice")?.warning || ""), /soldée/);
    assert.match(gdsMoveWarning("2005", "facture fournisseur soldée"), /n’a pas été déplacée/);
    assert.match(gdsPdfWarning("2005", "MB3M n’a pas renvoyé le PDF.", false), /date d’impression/);
    assert.match(
      mb3mAmadeusSentence({
        label: "Vol",
        invoiceNumber: "2005",
        placement: "move",
        moveWarning: gdsMoveWarning("2005", "facture fournisseur soldée"),
      }),
      /soldée/
    );
  });

  it("dépose le PDF 2005 même sans date d’impression, et le dit si MB3M refuse", async () => {
    const bookingId = "3d9eb840-dae8-4632-b755-f9e61e050b50";
    const itemId = "86ff0e83-235b-418f-91f1-3d64af55011e";
    const pieces: Record<string, unknown>[] = [
      {
        id: "invoice-2157",
        booking_id: bookingId,
        kind: "invoice",
        realm: mb3mRealm(),
        piece_number: "2157",
        folder_id: "01-0002007",
        printed_at: null,
        warning: null,
      },
    ];
    const documents: Record<string, unknown>[] = [];
    function from(table: string) {
      const filters: [string, unknown][] = [];
      let op = "select";
      let payload: Record<string, unknown> | null = null;
      const rows = () => (table === "crm_mb3m_pieces" ? pieces : documents);
      const api = {
        select() {
          return api;
        },
        insert(value: Record<string, unknown>) {
          op = "insert";
          payload = value;
          return api;
        },
        update(value: Record<string, unknown>) {
          op = "update";
          payload = value;
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        is() {
          return api;
        },
        not() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve(one());
        },
        single() {
          return Promise.resolve(one());
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve(finish());
        },
      };
      function matching() {
        return rows().filter((row) => filters.every(([column, value]) => row[column] === value));
      }
      function finish() {
        if (op === "insert" && payload) {
          const row = { id: `${table}-${rows().length + 1}`, ...payload };
          rows().push(row);
          return { data: row, error: null };
        }
        if (op === "update" && payload) {
          for (const row of matching()) Object.assign(row, payload);
          return { data: null, error: null };
        }
        return { data: matching(), error: null };
      }
      function one() {
        const result = finish();
        const data = Array.isArray(result.data) ? result.data[0] || null : result.data;
        return { data, error: null };
      }
      return api;
    }
    const plan = (): Mb3mGdsPlan => ({
      covered: [
        {
          itemId,
          label: "Air France Paris Charles-de-Gaulle à Marrakech Ménara",
          pnr: "Y2FYWL",
          invoiceNumber: "2005",
          transactionId: "8a9bd2f1-79de-4fb2-ac75-98a66e632e56",
          countsInStay: true,
          amount: 1197.44,
          folderId: null,
          placement: "move",
          printed: false,
          pieceUid: "b0ffa2ce-0adb-4ba9-8214-202609141014",
          moveWarning: null,
        },
      ],
      suggestions: [],
      invoices: [{ number: "2005", amount: 1197.44 }],
      customerUid: "92c5a491-b764-4c07-9a08-ebf0e56a21a4",
      folderId: "01-0002007",
      warnings: [],
    });
    const input = {
      bookingId,
      folderId: "01-0002007",
      folderUid: "b127ebaa-8fcd-4399-99c2-202611021224",
      title: "Paris · Marrakech",
      dateStart: "2026-10-09",
      dateEnd: "2026-10-11",
      destination: "Marrakech",
      destinationIso: "MA",
    };
    let renders = 0;
    const supabase = { from } as unknown as SupabaseClient;
    await finishMb3mGds(supabase, { ...input, plan: plan() }, {
      changeFolder: async () => {
        throw new Error("Impossible de modifier une prestation dont la facture fournisseur associée est soldée");
      },
      renderPiece: async () => {
        renders += 1;
        return { bytes: Buffer.from("%PDF-1.4"), contentType: "application/pdf", fileName: "Facture.pdf" };
      },
      upload: async () => "bookings/stored.pdf",
    });
    await finishMb3mGds(supabase, { ...input, plan: plan() }, {
      changeFolder: async () => {
        throw new Error("Impossible de modifier une prestation dont la facture fournisseur associée est soldée");
      },
      renderPiece: async () => {
        renders += 1;
        return { bytes: Buffer.from("%PDF-1.4"), contentType: "application/pdf", fileName: "Facture.pdf" };
      },
      upload: async () => "bookings/stored.pdf",
    });
    const gds = pieces.filter((row) => row.kind === "gds");
    assert.equal(gds.length, 1);
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.visible_to_client, true);
    assert.equal(documents[0]?.file_name, "Facture n° 2005.pdf");
    assert.equal(gds[0]?.document_id, documents[0]?.id);
    assert.ok(gds[0]?.printed_at);
    assert.equal(renders, 1);
    documents.length = 0;
    const stored = pieces.find((row) => row.kind === "gds");
    if (stored) {
      stored.document_id = null;
      stored.printed_at = null;
    }
    const refused = plan();
    await finishMb3mGds(
      supabase,
      { ...input, plan: refused },
      {
        changeFolder: async () => ({ number: "2005", folderId: "01-0002007" }),
        renderPiece: async () => {
          throw new Error("MB3M n’a pas renvoyé le PDF.");
        },
        upload: async () => "unused",
      }
    );
    assert.equal(documents.length, 0);
    assert.match(refused.warnings.join(" "), /n’a pas pu être récupéré/);
    assert.match(refused.warnings.join(" "), /date d’impression/);
    assert.match(String(pieces.find((row) => row.kind === "invoice")?.warning || ""), /n’a pas pu être récupéré/);
  });
});
