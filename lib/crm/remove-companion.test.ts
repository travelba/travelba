import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETE_COMPANION_CONFIRM_ERROR } from "./delete-confirm";
import { mcpWriteJournalDraft } from "./mcp-journal";
import { McpWriteError } from "./mcp-write";
import { pieceNumberTail, supprimerCompagnon, supprimerPieceClient } from "./remove-companion";
import { deleteTravelDocuments } from "./travel-document-write";

const CLIENT = "bdcec465-e287-4cc9-ba22-1a0c99e0ed45";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANION = "f946eb1d-1111-4111-8111-111111111111";
const KEPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC = "02afef29-2222-4222-8222-222222222222";
const HOLDER_DOC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN_DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOSSIER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DOSSIER_2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TRAVELER = "99999999-9999-4999-8999-999999999999";
const NUMBER = "ZZTOP998877";
const PATH = "customers/bdcec465/documents/copie.jpg";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "update" | "delete" = "select";
    let payload: Row = {};
    const api = {
      select() {
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      maybeSingle() {
        const rows = apply();
        if (rows.length === 1) return Promise.resolve({ data: rows[0], error: null });
        if (rows.length === 0) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: { message: "several" } });
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void, reject?: (err: unknown) => void) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
      },
    };

    function apply() {
      const matched = () => tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (op === "update") {
        const hits = matched();
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        const removed = matched();
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }

    return api;
  }

  return { from, tables };
}

function adminOf(seed: Record<string, Row[]>) {
  const db = memoryAdmin(seed);
  return { db, client: db as unknown as SupabaseClient };
}

function companion(id: string, customerId: string, first: string, last: string): Row {
  return { id, customer_id: customerId, first_name: first, last_name: last };
}

function base() {
  return adminOf({
    crm_travel_companions: [
      companion(COMPANION, CLIENT, "Benjamin Salomon", "Amar"),
      companion(KEPT, CLIENT, "Léa", "Martin"),
    ],
    crm_travel_documents: [
      {
        id: DOC,
        customer_id: CLIENT,
        companion_id: COMPANION,
        traveler_id: TRAVELER,
        doc_type: "passport",
        number: NUMBER,
        storage_path: PATH,
      },
      {
        id: HOLDER_DOC,
        customer_id: CLIENT,
        companion_id: null,
        traveler_id: null,
        doc_type: "id_card",
        number: "AB",
        storage_path: null,
      },
    ],
    crm_bookings: [
      { id: DOSSIER, reference: "TB-2026-0142", customer_id: CLIENT, total_amount: 1200, status: "confirmed" },
    ],
    crm_booking_items: [
      { id: "11111111-1111-4111-8111-111111111112", booking_id: DOSSIER, amount: 1200, details: { party_keys: [`companion:${COMPANION}`] } },
    ],
    crm_booking_travelers: [
      { id: TRAVELER, booking_id: DOSSIER, companion_id: COMPANION, first_name: "Benjamin Salomon", last_name: "Amar" },
    ],
    crm_transactions: [
      { id: "12121212-1212-4212-8212-121212121212", customer_id: CLIENT, booking_id: DOSSIER, amount: 1200, status: "posted" },
    ],
  });
}

test("le numéro de pièce ne sort qu’à trois caractères, et jamais s’il est court", () => {
  assert.equal(pieceNumberTail(NUMBER), "877");
  assert.equal(pieceNumberTail(" 12 345 "), "345");
  assert.equal(pieceNumberTail("1 23"), null);
  assert.equal(pieceNumberTail("AB"), null);
  assert.equal(pieceNumberTail(null), null);
});

test("supprimer un compagnon exige son nom complet et refuse s’il est voyageur", async () => {
  const { db, client } = base();
  const booking = JSON.stringify(db.tables.crm_bookings);
  const money = JSON.stringify(db.tables.crm_transactions);
  const item = JSON.stringify(db.tables.crm_booking_items);
  const removed: string[][] = [];
  await assert.rejects(
    () =>
      supprimerCompagnon(
        { client_id: CLIENT, compagnon_id: COMPANION, confirmer: "Benjamin Amar", retirer_des_dossiers: true },
        { admin: client, removeFiles: async (paths) => void removed.push(paths) }
      ),
    (err: unknown) => err instanceof McpWriteError && err.message === DELETE_COMPANION_CONFIRM_ERROR
  );
  assert.equal(removed.length, 0);
  assert.equal(db.tables.crm_travel_companions.some((row) => row.id === COMPANION), true);
  await assert.rejects(
    () =>
      supprimerCompagnon(
        { client_id: CLIENT, compagnon_id: COMPANION, confirmer: "Benjamin Salomon Amar" },
        { admin: client, removeFiles: async () => undefined }
      ),
    /TB-2026-0142/
  );
  assert.equal(JSON.stringify(db.tables.crm_bookings), booking);
  assert.equal(JSON.stringify(db.tables.crm_transactions), money);
  assert.equal(JSON.stringify(db.tables.crm_booking_items), item);
  assert.equal(db.tables.crm_booking_travelers.length, 1);
  assert.equal(db.tables.crm_travel_documents.some((row) => row.id === DOC), true);
});

test("retirer_des_dossiers retire le voyageur, la pièce et le fichier, pas le dossier ni l’argent", async () => {
  const { db, client } = base();
  db.tables.crm_bookings.push({
    id: DOSSIER_2,
    reference: "TB-2026-0200",
    customer_id: CLIENT,
    total_amount: 80,
    status: "draft",
  });
  db.tables.crm_booking_travelers.push({
    id: "88888888-8888-4888-8888-888888888888",
    booking_id: DOSSIER_2,
    companion_id: COMPANION,
    first_name: "Benjamin Salomon",
    last_name: "Amar",
  });
  db.tables.crm_travel_documents.push({
    id: FOREIGN_DOC,
    customer_id: CLIENT,
    companion_id: KEPT,
    traveler_id: TRAVELER,
    doc_type: "passport",
    number: "KEEPME4411",
    storage_path: "customers/bdcec465/documents/lea.jpg",
  });
  const booking = JSON.stringify(db.tables.crm_bookings);
  const money = JSON.stringify(db.tables.crm_transactions);
  const item = JSON.stringify(db.tables.crm_booking_items);
  const files: string[] = [];
  const blocked = await supprimerCompagnon(
    { client_id: OTHER, compagnon_id: COMPANION, confirmer: "Benjamin Salomon Amar" },
    { admin: client, removeFiles: async () => undefined }
  ).catch((err: unknown) => err);
  assert.ok(blocked instanceof McpWriteError);
  assert.match(blocked.message, /pas sur cette fiche/);
  await assert.rejects(
    () =>
      supprimerCompagnon(
        { client_id: CLIENT, compagnon_id: COMPANION, confirmer: "benjamin salomon amar" },
        { admin: client, removeFiles: async () => undefined }
      ),
    /TB-2026-0142/
  );
  const done = await supprimerCompagnon(
    {
      client_id: CLIENT,
      compagnon_id: COMPANION,
      confirmer: "  BENJAMIN   Salomon Amar ",
      retirer_des_dossiers: true,
    },
    {
      admin: client,
      removeFiles: async (paths) => {
        files.push(...paths);
      },
    }
  );
  assert.equal(done.supprime, true);
  assert.equal(done.nom, "Benjamin Salomon Amar");
  assert.equal(done.pieces, 1);
  assert.equal(done.fichiers, 1);
  assert.equal(done.notifie, false);
  assert.deepEqual(
    done.dossiers.map((row) => row.reference).sort(),
    ["TB-2026-0142", "TB-2026-0200"]
  );
  assert.equal(JSON.stringify(done).includes(NUMBER), false);
  assert.equal(JSON.stringify(done).includes(PATH), false);
  assert.deepEqual(files, [PATH]);
  assert.equal(db.tables.crm_travel_companions.some((row) => row.id === COMPANION), false);
  assert.equal(db.tables.crm_travel_companions.some((row) => row.id === KEPT), true);
  assert.equal(db.tables.crm_travel_documents.some((row) => row.id === DOC), false);
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === FOREIGN_DOC)?.traveler_id, null);
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === FOREIGN_DOC)?.number, "KEEPME4411");
  assert.equal(db.tables.crm_booking_travelers.some((row) => row.companion_id === COMPANION), false);
  assert.equal(JSON.stringify(db.tables.crm_bookings), booking);
  assert.equal(JSON.stringify(db.tables.crm_transactions), money);
  assert.equal(JSON.stringify(db.tables.crm_booking_items), item);
  const journal = mcpWriteJournalDraft(
    "supprimer_compagnon",
    { client_id: CLIENT, compagnon_id: COMPANION },
    "Raphael"
  );
  assert.equal(journal.action, "delete");
  assert.equal(journal.entityType, "client");
  assert.equal(journal.entityId, CLIENT);
  assert.match(journal.summary, /Compagnon supprimé par Raphael/);
});

test("un compagnon sans dossier part avec sa pièce, et le fichier encore cité reste", async () => {
  const { db, client } = adminOf({
    crm_travel_companions: [companion(COMPANION, CLIENT, "Benjamin Salomon", "Amar")],
    crm_travel_documents: [
      {
        id: DOC,
        customer_id: CLIENT,
        companion_id: COMPANION,
        doc_type: "passport",
        number: NUMBER,
        storage_path: PATH,
      },
      {
        id: HOLDER_DOC,
        customer_id: CLIENT,
        companion_id: null,
        doc_type: "passport",
        number: "OTHER112233",
        storage_path: PATH,
      },
    ],
    crm_bookings: [],
    crm_booking_travelers: [],
  });
  const files: string[][] = [];
  const done = await supprimerCompagnon(
    { client_id: CLIENT, compagnon_id: COMPANION, confirmer: "Benjamin Salomon Amar" },
    {
      admin: client,
      removeFiles: async (paths) => void files.push(paths),
    }
  );
  assert.equal(done.pieces, 1);
  assert.equal(done.fichiers, 0);
  assert.deepEqual(done.dossiers, []);
  assert.equal(files.length, 0);
  assert.equal(db.tables.crm_travel_companions.length, 0);
  assert.equal(db.tables.crm_travel_documents.length, 1);
  const second = await supprimerPieceClient(
    { client_id: CLIENT, document_id: HOLDER_DOC, confirmer: true },
    {
      admin: client,
      removeFiles: async (paths) => void files.push(paths),
    }
  );
  assert.equal(second.titulaire, true);
  assert.equal(second.fin, "233");
  assert.equal(JSON.stringify(second).includes("OTHER112233"), false);
  assert.equal(JSON.stringify(second).includes("1122"), false);
  assert.deepEqual(files, [[PATH]]);
  assert.equal(db.tables.crm_travel_documents.length, 0);
});

test("supprimer une pièce de fiche ne renvoie pas le numéro et ne touche pas un autre client", async () => {
  const { db, client } = base();
  await assert.rejects(
    () => supprimerPieceClient({ client_id: CLIENT, document_id: DOC }, { admin: client }),
    /confirmer true/
  );
  await assert.rejects(
    () =>
      supprimerPieceClient(
        { client_id: OTHER, document_id: DOC, confirmer: true },
        { admin: client, removeFiles: async () => undefined }
      ),
    /introuvable/
  );
  assert.equal(db.tables.crm_travel_documents.some((row) => row.id === DOC), true);
  const files: string[] = [];
  const done = await supprimerPieceClient(
    { client_id: CLIENT, document_id: DOC, confirmer: true },
    {
      admin: client,
      removeFiles: async (paths) => {
        files.push(...paths);
      },
    }
  );
  assert.equal(done.retiree, true);
  assert.equal(done.compagnon_id, COMPANION);
  assert.equal(done.titulaire, false);
  assert.equal(done.type, "passport");
  assert.equal(done.fin, "877");
  assert.equal(done.notifie, false);
  const body = JSON.stringify(done);
  assert.equal(body.includes(NUMBER), false);
  assert.equal(body.includes("998877"), false);
  assert.equal(body.includes(PATH), false);
  assert.deepEqual(files, [PATH]);
  assert.equal(db.tables.crm_travel_documents.some((row) => row.id === DOC), false);
  assert.equal(db.tables.crm_travel_documents.some((row) => row.id === HOLDER_DOC), true);
  assert.equal(db.tables.crm_travel_companions.some((row) => row.id === COMPANION), true);
  assert.equal(db.tables.crm_bookings.length, 1);
  assert.equal(db.tables.crm_transactions[0].amount, 1200);
  const holder = await supprimerPieceClient(
    { client_id: CLIENT, document_id: HOLDER_DOC, confirmer: true },
    { admin: client, removeFiles: async () => undefined }
  );
  assert.equal(holder.titulaire, true);
  assert.equal(holder.compagnon_id, null);
  assert.equal("fin" in holder, false);
  const journal = mcpWriteJournalDraft("supprimer_piece_client", { client_id: CLIENT, document_id: HOLDER_DOC }, "Raphael");
  assert.equal(journal.action, "delete");
  assert.equal(journal.entityType, "client");
  assert.match(journal.summary, /Pièce d’identité retirée/);
});

test("le fichier n’est retiré du coffre que lorsqu’aucune pièce ne le cite", async () => {
  const { client } = adminOf({
    crm_travel_documents: [
      { id: DOC, customer_id: CLIENT, companion_id: COMPANION, storage_path: PATH },
      { id: HOLDER_DOC, customer_id: CLIENT, companion_id: null, storage_path: PATH },
    ],
  });
  const files: string[][] = [];
  const first = await deleteTravelDocuments(client, { id: DOC }, async (paths) => void files.push(paths));
  assert.deepEqual(first.paths, []);
  const second = await deleteTravelDocuments(client, { id: HOLDER_DOC }, async (paths) => void files.push(paths));
  assert.deepEqual(second.paths, [PATH]);
  assert.deepEqual(files, [[PATH]]);
});

test("la fiche agence et l’espace client passent par le même retrait", () => {
  const admin = readFileSync(new URL("../../app/api/admin/companions/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../app/api/client/companions/route.ts", import.meta.url), "utf8");
  for (const source of [admin, client]) {
    assert.match(source, /deleteCompanionDocuments/);
    assert.match(source, /deleteCompanionRow/);
    assert.equal(source.includes("crm_bookings"), false);
    assert.equal(source.includes("crm_transactions"), false);
  }
});
