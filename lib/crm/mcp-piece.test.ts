import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previewMcpTool } from "./mcp-registry";
import { addTravelPiece, prepareTravelPiece } from "./mcp-piece";
import { McpWriteError } from "./mcp-write";
import { customerDocumentStoragePath } from "./travel-document-write";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const TRAVELER = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

const PDF = Buffer.from("%PDF-1.4 eta").toString("base64");

function piece(extra: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT,
    type: "visa",
    pays: "Israël",
    numero: "ETA-9",
    expiration: "2027-04-01",
    nom_fichier: "eta-il.pdf",
    type_mime: "application/pdf",
    contenu: PDF,
    ...extra,
  };
}

test("the travel document path is the client vault", () => {
  assert.equal(
    customerDocumentStoragePath(CLIENT, "ETA IL.pdf", 1710000000000),
    `customers/${CLIENT}/documents/1710000000000-ETA_IL.pdf`
  );
});

test("a piece names the client or the dossier and keeps a readable file", () => {
  const draft = prepareTravelPiece(piece({ type: "Carte d’identité", nom_fichier: "scan.png", type_mime: "image/png" }));
  assert.equal(draft.docType, "id_card");
  assert.equal(draft.issuingCountry, "Israël");
  assert.equal(draft.number, "ETA-9");
  assert.equal(prepareTravelPiece(piece({ type: "eta" })).docType, "visa");
  assert.equal(prepareTravelPiece(piece({ type: "passeport" })).docType, "passport");
  assert.throws(() => prepareTravelPiece(piece({ client_id: undefined, contenu: PDF })), /client ou le dossier/);
  assert.throws(() => prepareTravelPiece(piece({ type: "contrat" })), /Type de pièce inconnu/);
  assert.throws(() => prepareTravelPiece(piece({ type: "" })), /Type de pièce requis/);
  assert.throws(() => prepareTravelPiece(piece({ expiration: "01/04/2027" })), /Date d’expiration/);
  assert.throws(() => prepareTravelPiece(piece({ nom_fichier: "  " })), /Nom de fichier/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "@@@" })), /illisible/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "" })), /Fichier vide/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "data:application/pdf;base64," })), /Fichier vide/);
  assert.throws(
    () => prepareTravelPiece(piece({ nom_fichier: "note.txt", type_mime: "text/plain", contenu: Buffer.from("bonjour").toString("base64") })),
    /Format non pris en charge/
  );
  assert.throws(() => prepareTravelPiece(piece({ voyageur_id: TRAVELER, client_id: CLIENT, dossier_id: undefined })), /dossier pour rattacher/);
  assert.throws(() => prepareTravelPiece(piece({ client_id: "cyril" })), /Client invalide/);
  const heavy = "A".repeat(4 * Math.ceil((25 * 1024 * 1024) / 3) + 4);
  assert.throws(() => prepareTravelPiece(piece({ contenu: heavy })), /25 Mo/);
});

test("a data url is accepted as the file", () => {
  const draft = prepareTravelPiece(piece({ contenu: `data:application/pdf;base64,${PDF}` }));
  assert.equal(draft.bytes.toString(), "%PDF-1.4 eta");
});

test("adding a visa stores it in the client vault and does not notify", async () => {
  const { admin, writes, uploads } = fakeCrm();
  let reconciled = "";
  const result = await addTravelPiece(piece(), admin, {
    upload: async (path, bytes, mime) => {
      uploads.push({ path, bytes, mime });
    },
    reconcile: async (customerId) => {
      reconciled = customerId;
    },
  });
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, new RegExp(`^customers/${CLIENT}/documents/\\d+-eta-il\\.pdf$`));
  assert.equal(uploads[0].mime, "application/pdf");
  assert.equal(uploads[0].bytes.toString(), "%PDF-1.4 eta");
  assert.deepEqual(
    writes.map((row) => `${row.op}:${row.table}`),
    ["insert:crm_travel_documents"]
  );
  assert.equal(writes[0].payload.customer_id, CLIENT);
  assert.equal(writes[0].payload.doc_type, "visa");
  assert.equal(writes[0].payload.issuing_country, "IL");
  assert.equal(writes[0].payload.number, "ETA-9");
  assert.equal(writes[0].payload.expires_on, "2027-04-01");
  assert.equal(writes[0].payload.booking_id, null);
  assert.equal(writes[0].payload.file_name, "eta-il.pdf");
  assert.equal(writes[0].payload.storage_path, uploads[0].path);
  assert.equal(result.id, "doc-1");
  assert.equal(result.endroit, "Espace client · Pièces");
  assert.equal(result.lien, "/mon-compte/profil/documents");
  assert.equal(result.notifie, false);
  assert.equal("numero" in result, false);
  assert.equal("number" in result, false);
  assert.equal(reconciled, CLIENT);
});

test("a piece linked to a stay names the traveller and replaces the same type", async () => {
  const { admin, writes, uploads } = fakeCrm();
  const result = await addTravelPiece(
    piece({
      client_id: undefined,
      reference: "TB-2026-0082",
      voyageur_id: TRAVELER,
      type: "eta",
    }),
    admin,
    {
      upload: async (path, bytes, mime) => {
        uploads.push({ path, bytes, mime });
      },
      reconcile: async () => {},
    }
  );
  assert.equal(uploads.length, 1);
  assert.deepEqual(
    writes.map((row) => `${row.op}:${row.table}`),
    ["insert:crm_travel_documents", "delete:crm_travel_documents"]
  );
  assert.equal(writes[0].payload.customer_id, CLIENT);
  assert.equal(writes[0].payload.booking_id, BOOKING);
  assert.equal(writes[0].payload.traveler_id, TRAVELER);
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.reference, "TB-2026-0082");
  assert.equal(result.voyageur_id, TRAVELER);
  assert.equal(result.endroit, "Espace client · séjour TB-2026-0082");
  assert.equal(result.lien, "/mon-compte/reservations/TB-2026-0082");
  assert.equal(result.lien_agence, `/admin/reservations/${BOOKING}`);
  assert.equal(result.notifie, false);
});

test("a piece is refused before upload when the stay is not the client's", async () => {
  const { admin, writes, uploads } = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ dossier_id: BOOKING, client_id: OTHER }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
        reconcile: async () => {
          throw new Error("ne pas rapprocher");
        },
      }),
    (err: unknown) => err instanceof McpWriteError && /pas celui de ce client/.test(err.message)
  );
  assert.equal(uploads.length, 0);
  assert.deepEqual(writes, []);
});

test("an unknown traveller is refused before the file is stored", async () => {
  const { admin, writes, uploads } = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ dossier_id: BOOKING, voyageur_id: OTHER }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
      }),
    /Voyageur introuvable/
  );
  assert.equal(uploads.length, 0);
  assert.deepEqual(writes, []);
});

test("ajouter_piece does not keep the document number and does not send a formality", () => {
  const shown = JSON.parse(
    previewMcpTool("ajouter_piece", { id: "doc-1", number: "ETA-9", numero_piece: "ETA-9", notifie: false }).content[0].text
  ) as Record<string, unknown>;
  assert.equal(shown.id, "doc-1");
  assert.equal(shown.notifie, false);
  assert.equal("number" in shown, false);
  assert.equal("numero_piece" in shown, false);
  const source = readFileSync(new URL("./mcp-piece.ts", import.meta.url), "utf8");
  assert.equal(source.includes("notifyFormalitiesReady"), false);
  assert.equal(source.includes("saveVisaUploads"), false);
  assert.equal(source.includes("concierge-send"), false);
  const route = readFileSync(new URL("../../app/api/admin/travel-documents/route.ts", import.meta.url), "utf8");
  assert.equal(route.includes("saveUploadedTravelDocument"), true);
});

type Write = { op: string; table: string; payload: Record<string, unknown> };

function fakeCrm() {
  const writes: Write[] = [];
  const uploads: { path: string; bytes: Buffer; mime: string }[] = [];
  const customers = [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }];
  const bookings = [{ id: BOOKING, reference: "TB-2026-0082", customer_id: CLIENT }];
  const travelers = [{ id: TRAVELER, booking_id: BOOKING, companion_id: null, is_account_holder: true }];

  function from(table: string) {
    const eqs: [string, unknown][] = [];
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
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        eqs.push([column, value]);
        return api;
      },
      neq() {
        return api;
      },
      is() {
        return api;
      },
      in() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(true));
      },
      then(resolve: (value: { data: unknown; error: null }) => void, reject?: (err: unknown) => void) {
        return Promise.resolve(finish(false)).then(resolve, reject);
      },
    };

    function finish(one: boolean) {
      if (op !== "select") writes.push({ op, table, payload });
      if (op === "insert") return { data: { id: "doc-1", ...payload }, error: null };
      if (op === "delete" || op === "update") return { data: null, error: null };
      const rows =
        table === "crm_customers"
          ? customers.filter((row) => !eqs.some(([column, value]) => column === "id" && row.id !== value))
          : table === "crm_bookings"
            ? bookings.filter((row) =>
                eqs.every(([column, value]) => (row as Record<string, unknown>)[column] === value)
              )
            : table === "crm_booking_travelers"
              ? travelers.filter((row) =>
                  eqs.every(([column, value]) => (row as Record<string, unknown>)[column] === value)
                )
              : [];
      return { data: one ? rows[0] || null : rows, error: null };
    }
    return api;
  }

  return { admin: { from } as unknown as SupabaseClient, writes, uploads };
}
