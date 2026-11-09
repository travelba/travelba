import assert from "node:assert/strict";
import test from "node:test";
import { Mb3mError } from "./mb3m";
import {
  chooseLinkedCost,
  comptabiliteSortie,
  creerFicheMb3m,
  refuserEncaissement,
  reprendreFactureMb3m,
} from "./mcp-finance-ops";
import type { TripCost } from "./trip-costs";
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
        reglements: [],
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

const COST = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

function costRow(partial: { id: string; source?: string; source_id?: string; booking_id?: string }) {
  return {
    id: partial.id,
    source: partial.source || "pliant",
    source_id: partial.source_id || MOVE,
    booking_id: partial.booking_id || DOSSIER,
  };
}

function costsAdmin(rows: ReturnType<typeof costRow>[]) {
  return {
    from(table: string) {
      if (table !== "crm_trip_costs") throw new Error(table);
      const filters: [string, string][] = [];
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters.push([column, value]);
          return api;
        },
        limit() {
          return api;
        },
        then(onFulfilled: (value: { data: typeof rows; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
          const data = rows.filter((row) => filters.every(([column, value]) => row[column as keyof typeof row] === value));
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

function detached(id: string): TripCost {
  return {
    id,
    bookingId: DOSSIER,
    bookingItemId: null,
    source: "pliant",
    sourceId: MOVE,
    amountEur: 12,
    originalAmount: 12,
    originalCurrency: "EUR",
    supplier: "Air France",
    occurredOn: "2026-11-06",
    instrument: "pliant_card",
    instrumentDetail: "4242",
    state: "posted",
  };
}

test("détacher par sortie_id quand un seul coût est lié", async () => {
  assert.equal(chooseLinkedCost([costRow({ id: COST })], {}), COST);
  assert.equal(chooseLinkedCost([costRow({ id: COST })], { dossierId: DOSSIER }), COST);
  assert.throws(() => chooseLinkedCost([], {}), /n’est pas rattachée/);
  assert.throws(() => chooseLinkedCost([costRow({ id: COST })], { dossierId: OTHER }), /autre dossier/);
  assert.throws(
    () => chooseLinkedCost([costRow({ id: COST, source: "pliant" }), costRow({ id: OTHER, source: "revolut" })], {}),
    /cout_id/
  );
  assert.equal(
    chooseLinkedCost([costRow({ id: COST, source: "pliant" }), costRow({ id: OTHER, source: "revolut" })], { source: "revolut" }),
    OTHER
  );

  const seen: string[] = [];
  const detachedBySortie = (await comptabiliteSortie(
    { action: "detacher", sortie_id: MOVE, confirmer: true },
    {
      admin: costsAdmin([costRow({ id: COST })]) as never,
      detachCost: async (id) => {
        seen.push(id);
        return detached(id);
      },
    }
  )) as { cout_id: string; sortie_id: string };
  assert.deepEqual(seen, [COST]);
  assert.equal(detachedBySortie.cout_id, COST);
  assert.equal(detachedBySortie.sortie_id, MOVE);

  const withDossier = (await comptabiliteSortie(
    { action: "detacher", sortie_id: MOVE, dossier_id: DOSSIER, confirmer: true },
    {
      admin: costsAdmin([costRow({ id: COST })]) as never,
      detachCost: async (id) => detached(id),
    }
  )) as { cout_id: string };
  assert.equal(withDossier.cout_id, COST);

  await assert.rejects(
    () =>
      comptabiliteSortie(
        { action: "detacher", confirmer: true },
        { admin: costsAdmin([]) as never, detachCost: async () => detached(COST) }
      ),
    /Coût invalide/
  );
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
