import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerTravelbaTools } from "./mcp-registry";
import {
  McpWriteError,
  creditManualTransfer,
  creditRevolutTransfer,
  prepareBookingUpdate,
  prepareClientCreate,
  prepareClientUpdate,
  prepareEmailAction,
  prepareManualCredit,
  prepareRevolutCredit,
  publishBlock,
} from "./mcp-write";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const WIRE = "33333333-3333-4333-8333-333333333333";

function rejection(run: () => unknown) {
  return assert.rejects(async () => {
    await run();
  }, McpWriteError);
}

test("a manual credit stays a posted transfer and refuses a debit", () => {
  const credit = prepareManualCredit({ client_id: CLIENT, montant: "1 200,50", libelle: "Virement" });
  assert.ok(credit);
  assert.equal(credit.customer_id, CLIENT);
  assert.equal(credit.amount, 1200.5);
  assert.equal(credit.currency, "EUR");
  assert.throws(() => prepareManualCredit({ client_id: CLIENT, montant: 10, sens: "debit" }), /virements crédit/);
  assert.throws(() => prepareManualCredit({ client_id: CLIENT, montant: 10, type: "adjustment" }), /virements crédit/);
  assert.throws(() => prepareManualCredit({ client_id: "cyril", montant: 10 }), /Client invalide/);
  assert.throws(() => prepareManualCredit({ montant: 10 }), /Choisissez un client/);
  assert.throws(() => prepareManualCredit({ client_id: CLIENT, montant: 0 }), /supérieur à zéro/);
});

test("revolut credit names the transfer and the client", () => {
  assert.deepEqual(prepareRevolutCredit({ virement_id: WIRE, client_id: CLIENT }), {
    virementId: WIRE,
    clientId: CLIENT,
  });
  assert.throws(() => prepareRevolutCredit({ virement_id: WIRE }), /Client invalide/);
  assert.throws(() => prepareRevolutCredit({ client_id: CLIENT, virement_id: "le virement de ce matin" }), /Virement invalide/);
});

test("showing a carnet keeps the agency guards", () => {
  assert.equal(publishBlock({ visible_to_client: false, archived_at: null }, [{ kind: "hotel" }]).deja_montre, false);
  assert.equal(publishBlock({ visible_to_client: true }, [{ kind: "hotel" }]).deja_montre, true);
  assert.throws(
    () => publishBlock({ archived_at: "2026-10-01", visible_to_client: false }, [{ kind: "hotel" }]),
    /Réactivez le dossier/
  );
  assert.throws(() => publishBlock({ visible_to_client: false }, [{ kind: "fee" }]), /au moins une carte/);
});

test("a booking update only accepts status, notes and dates", () => {
  const next = prepareBookingUpdate({
    id: BOOKING,
    statut: "Confirmée",
    notes_internes: "À rappeler",
    date_depart: "2026-11-02",
    date_retour: "",
  });
  assert.equal(next.patch.status, "confirmed");
  assert.equal(next.patch.notes_internal, "À rappeler");
  assert.equal(next.patch.start_date, "2026-11-02");
  assert.equal(next.patch.end_date, null);
  assert.equal("destination" in next.patch, false);
  assert.throws(() => prepareBookingUpdate({ id: BOOKING, statut: "payé" }), /Statut de dossier inconnu/);
  assert.throws(() => prepareBookingUpdate({ id: BOOKING, date_depart: "hier" }), /Date de départ/);
  assert.throws(() => prepareBookingUpdate({ reference: "TB-1" }), /Rien à modifier/);
});

test("an email leaves the queue only with an explicit action", () => {
  assert.deepEqual(prepareEmailAction({ id: WIRE, action: "refuser" }), {
    action: "refuser",
    id: WIRE,
    dossierId: "",
  });
  assert.equal(prepareEmailAction({ id: WIRE, action: "rattacher", dossier_id: BOOKING }).dossierId, BOOKING);
  assert.throws(() => prepareEmailAction({ id: WIRE, action: "rattacher" }), /Dossier invalide/);
  assert.throws(() => prepareEmailAction({ id: WIRE, action: "ignorer" }), /Action inconnue/);
});

test("a client is created with an email and a name, and updated by id", () => {
  const created = prepareClientCreate({ email: "Ada@Travelba.fr", prenom: "Ada", nom: "Lovelace" });
  assert.equal(created.email, "ada@travelba.fr");
  assert.throws(() => prepareClientCreate({ email: "ada", prenom: "Ada", nom: "Lovelace" }), /e-mail/);
  assert.throws(() => prepareClientCreate({ email: "ada@travelba.fr", prenom: "Ada" }), /Nom invalide/);
  const updated = prepareClientUpdate({ id: CLIENT, prenom: "Ada", societe: "TBA" });
  assert.equal(updated.patch.first_name, "Ada");
  assert.equal(updated.patch.company_name, "TBA");
  assert.throws(() => prepareClientUpdate({ id: CLIENT }), /Rien à modifier/);
  assert.throws(() => prepareClientUpdate({ id: "nom", prenom: "Ada" }), /Client invalide/);
});

test("crediting a missing client does not insert a ledger line", async () => {
  const writes: string[] = [];
  const admin = fakeAdmin({
    crm_customers: null,
    onInsert(table) {
      writes.push(table);
    },
  });
  await rejection(() => creditManualTransfer({ client_id: CLIENT, montant: 80 }, admin));
  assert.deepEqual(writes, []);
});

test("a manual credit inserts one posted transfer", async () => {
  const writes: { table: string; payload: Record<string, unknown> }[] = [];
  const admin = fakeAdmin({
    crm_customers: { id: CLIENT },
    onInsert(table, payload) {
      writes.push({ table, payload });
      return { id: "tx-1", ...payload };
    },
  });
  const result = await creditManualTransfer({ client_id: CLIENT, montant: 80, libelle: "Virement" }, admin);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "crm_transactions");
  assert.equal(writes[0].payload.direction, "credit");
  assert.equal(writes[0].payload.kind, "transfer");
  assert.equal(writes[0].payload.status, "posted");
  assert.equal(writes[0].payload.source, "manual");
  assert.equal(result.mouvement.client_id, CLIENT);
});

test("an already matched revolut transfer is not credited again", async () => {
  const writes: string[] = [];
  const admin = fakeAdmin({
    crm_customers: { id: CLIENT },
    crm_revolut_transactions: { id: WIRE, status: "matched", direction: "credit", currency: "EUR" },
    onInsert(table) {
      writes.push(table);
    },
  });
  await rejection(() => creditRevolutTransfer({ virement_id: WIRE, client_id: CLIENT }, admin));
  assert.deepEqual(writes, []);
});

test("write tools are not marked read-only", () => {
  const seen: { name: string; readOnly: boolean; openWorld: boolean }[] = [];
  registerTravelbaTools({
    registerTool(name: string, config: { annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean } }) {
      seen.push({
        name,
        readOnly: config.annotations?.readOnlyHint === true,
        openWorld: config.annotations?.openWorldHint === true,
      });
    },
  } as unknown as Parameters<typeof registerTravelbaTools>[0]);
  assert.equal(seen.find((tool) => tool.name === "crediter_virement")?.readOnly, false);
  assert.equal(seen.find((tool) => tool.name === "publier_carnet")?.readOnly, false);
  assert.equal(seen.find((tool) => tool.name === "tableau_de_bord")?.readOnly, true);
  assert.equal(seen.find((tool) => tool.name === "confirmer_service")?.openWorld, true);
  assert.equal(seen.find((tool) => tool.name === "crediter_revolut")?.openWorld, false);
});

function fakeAdmin(script: {
  crm_customers: Record<string, unknown> | null;
  crm_revolut_transactions?: Record<string, unknown> | null;
  onInsert?: (table: string, payload: Record<string, unknown>) => Record<string, unknown> | void;
}) {
  function from(table: string) {
    let op = "select";
    let payload: Record<string, unknown> = {};
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
      eq() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish());
      },
      single() {
        return Promise.resolve(finish());
      },
    };
    function finish() {
      if (op === "insert") {
        const created = script.onInsert?.(table, payload) ?? null;
        return { data: created, error: created ? null : { code: "23502", message: "insert" } };
      }
      if (table === "crm_customers") return { data: script.crm_customers, error: null };
      if (table === "crm_revolut_transactions") return { data: script.crm_revolut_transactions ?? null, error: null };
      return { data: null, error: null };
    }
    return api;
  }
  return { from } as unknown as SupabaseClient;
}
