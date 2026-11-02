import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWithMcpAccess } from "./mcp-auth";
import { previewMcpTool } from "./mcp-registry";
import { Mb3mError } from "./mb3m";
import { preparerFactureMb3m, statutFactureMb3m, type Mb3mMcpDeps } from "./mcp-mb3m-invoice";
import { McpWriteError } from "./mcp-write";

const BOOKING = { id: "11111111-2222-4333-8444-555555555555", reference: "TB-2026-0044" };

const line = {
  label: "Vol · Air France",
  quantity: 1,
  netPriceUnit: 198,
  netPriceTotal: 198,
  marginUnit: 1000.44,
  activityId: 22,
};

function deps(patch: Partial<Mb3mMcpDeps> = {}): Mb3mMcpDeps {
  return {
    findBooking: async () => BOOKING,
    loadInvoices: async () => [
      {
        piece_number: "4542",
        lines: [line],
        amount: 1198.44,
        printed_at: null,
        attempt_status: null,
        attempt_error: null,
        attempt_started_at: null,
        attempt_started_by: "mcp",
        updated_at: "2026-11-02T12:00:00.000Z",
      },
    ],
    emit: async () => {
      throw new Error("emit ne doit pas être appelé");
    },
    ...patch,
  };
}

describe("préparer la facture MB3M", () => {
  it("reprend la pièce déjà en place sans second appel", async () => {
    let calls = 0;
    const result = await runWithMcpAccess({ actor: "grok", passport: false }, () =>
      preparerFactureMb3m(
        { reference: "TB-2026-0044" },
        deps({
          emit: async (bookingId, actorName) => {
            calls += 1;
            assert.equal(bookingId, BOOKING.id);
            assert.equal(actorName, "grok");
            return {
              number: "4542",
              documentId: null,
              created: false,
              replaced: false,
              printed: false,
              visibleToClient: false,
              reglements: [
                { date: "2026-10-30", montant: 100, numero_mb3m: "2153", statut: "deja_dans_mb3m" },
              ],
            };
          },
        })
      )
    );
    assert.equal(calls, 1);
    assert.equal(result.statut, "deja_en_place");
    assert.equal(result.numero_mb3m, "4542");
    assert.equal(result.cree, false);
    assert.equal(result.lignes[0]?.net, 198);
    assert.equal(result.lignes[0]?.marge, 1000.44);
    assert.equal(result.erreur, null);
    assert.equal(result.auteur, "grok");
    assert.equal(result.reglements[0]?.numero_mb3m, "2153");
    assert.equal(result.reglements[0]?.statut, "deja_dans_mb3m");
    const shown = previewMcpTool("preparer_facture_mb3m", { numero_mb3m: "4542", numero_piece: "SECRET" });
    assert.match(shown.content[0].text, /4542/);
    assert.equal(shown.content[0].text.includes("SECRET"), false);
  });

  it("renvoie l’échec MB3M et les lignes déjà posées", async () => {
    const result = await preparerFactureMb3m(
      { dossier_id: BOOKING.id },
      deps({
        emit: async () => {
          throw new Mb3mError("Code interne -22 : commission", -504);
        },
        loadInvoices: async () => [
          {
            piece_number: null,
            lines: [line],
            amount: 1198.44,
            printed_at: null,
            attempt_status: "failed",
            attempt_error: "Code interne -22 : commission",
            attempt_started_at: "2026-11-02T12:00:00.000Z",
            attempt_started_by: "mcp",
            updated_at: "2026-11-02T12:00:00.000Z",
          },
        ],
      })
    );
    assert.equal(result.statut, "echec");
    assert.match(result.erreur || "", /commission/);
    assert.equal(result.cree, false);
    assert.equal(result.lignes.length, 1);
    assert.equal(result.numero_mb3m, null);
  });

  it("lit le statut sans préparer", async () => {
    let emitted = 0;
    const result = await statutFactureMb3m(
      { reference: "TB-2026-0044" },
      deps({
        emit: async () => {
          emitted += 1;
          throw new Error("préparation");
        },
      })
    );
    assert.equal(emitted, 0);
    assert.equal(result.statut, "pro_forma");
    assert.equal(result.numero_mb3m, "4542");
    assert.equal(result.imprimee, false);
    assert.equal(result.lignes[0]?.activite, 22);
    assert.equal(result.pieces[0]?.numero_mb3m, "4542");
  });

  it("refuse un dossier sans identifiant", async () => {
    await assert.rejects(() => preparerFactureMb3m({}), (error: unknown) => {
      assert.ok(error instanceof McpWriteError);
      assert.match(error.message, /identifiant ou la référence/);
      return true;
    });
  });
});
