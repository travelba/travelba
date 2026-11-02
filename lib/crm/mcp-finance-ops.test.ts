import assert from "node:assert/strict";
import test from "node:test";
import { Mb3mError } from "./mb3m";
import {
  comptabiliteSortie,
  creerFicheMb3m,
  refuserEncaissement,
  reprendreFactureMb3m,
} from "./mcp-finance-ops";
import { mcpWriteJournalDraft } from "./mcp-journal";
import type { CrmRevolutTransaction, CrmStripeTransaction } from "./types";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const MOVE = "33333333-3333-4333-8333-333333333333";

test("reprendre une facture exige confirmer et renvoie l’avoir", async () => {
  let called = false;
  await assert.rejects(
    () =>
      reprendreFactureMb3m(
        { dossier_id: DOSSIER },
        { findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }), reissue: async () => { called = true; throw new Error("non"); } }
      ),
    /confirmer true/
  );
  assert.equal(called, false);
  const done = await reprendreFactureMb3m(
    { reference: "TB-1", confirmer: true },
    {
      findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }),
      reissue: async () => ({
        creditNote: "AV-1",
        number: "FA-2",
        documentId: null,
        created: true,
        replaced: false,
        printed: false,
        visibleToClient: false,
      }),
    }
  );
  assert.equal(done.avoir, "AV-1");
  assert.equal(done.numero_mb3m, "FA-2");
  await assert.rejects(
    () =>
      reprendreFactureMb3m(
        { dossier_id: DOSSIER, confirmer: true },
        {
          findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }),
          reissue: async () => {
            throw new Mb3mError("Aucune facture imprimée à corriger.", 0);
          },
        }
      ),
    /Aucune facture imprimée/
  );
});

test("la fiche MB3M reprend le clic Créer dans MB3M", async () => {
  const sent = await creerFicheMb3m(
    { client_id: CLIENT },
    { pushCustomer: async () => ({ updated: true }) }
  );
  assert.equal(sent.envoyee, true);
  assert.equal(sent.deja_connue, true);
});

test("une sortie se détache seulement avec confirmer", async () => {
  let ran = false;
  await assert.rejects(
    () => comptabiliteSortie({ action: "detacher", cout_id: MOVE }, { runCost: async () => { ran = true; return {}; } }),
    /confirmer true/
  );
  assert.equal(ran, false);
  const attached = await comptabiliteSortie(
    { action: "rattacher", source: "revolut", sortie_id: MOVE, dossier_id: DOSSIER },
    {
      runCost: async (action, input) => {
        assert.equal(action, "rattacher");
        assert.equal(input.dossier_id, DOSSIER);
        return { action };
      },
    }
  );
  assert.equal((attached as { action: string }).action, "rattacher");
});

test("refuser un encaissement déjà rapproché échoue clairement", async () => {
  await assert.rejects(
    () =>
      refuserEncaissement(
        { source: "revolut", id: MOVE, confirmer: true },
        {
          admin: { from() { return {}; } } as never,
          loadRevolut: async () => ({ id: MOVE, status: "matched", direction: "credit" }) as CrmRevolutTransaction,
          refuseRevolut: async () => ({ ok: false, error: "already_matched" }),
        }
      ),
    /Déjà rapproché/
  );
  const stripe = await       refuserEncaissement(
        { source: "stripe", id: MOVE, confirmer: true },
        {
          admin: { from() { return {}; } } as never,
          loadStripe: async () => ({ id: MOVE, status: "unmatched" }) as CrmStripeTransaction,
      refuseStripe: async () => ({ ok: true }),
    }
  );
  assert.equal(stripe.refuse, true);
});

test("le journal d’un avoir nomme le dossier", () => {
  const row = mcpWriteJournalDraft("reprendre_facture_mb3m", { dossier_id: DOSSIER }, "Raphael");
  assert.equal(row.entityType, "dossier");
  assert.match(row.summary, /Facture MB3M reprise par Raphael/);
  const money = mcpWriteJournalDraft("refuser_encaissement", { id: MOVE }, "Raphael");
  assert.equal(money.entityType, "finance");
});
