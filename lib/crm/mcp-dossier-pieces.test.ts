import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pieceEstRetiree, pieceSource, piecesActives, withPieceArchive } from "./dossier-piece";
import {
  changerVisibilitePiece,
  deplacerPieceDossier,
  lirePieceDossier,
  listerPiecesDossier,
  pieceReadText,
  rattacherPieceCarte,
  retirerPieceDossier,
} from "./mcp-dossier-pieces";
import { previewMcpTool } from "./mcp-registry";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const AUTRE = "33333333-3333-4333-8333-333333333333";
const CARTE = "44444444-4444-4444-8444-444444444444";
const CARTE_AUTRE = "55555555-5555-4555-8555-555555555555";
const CLIENT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const CLIENT_2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const DOC = "66666666-6666-4666-8666-666666666666";
const DOC_MAIL = "77777777-7777-4777-8777-777777777777";
const DOC_IMPORT = "88888888-8888-4888-8888-888888888888";
const MAIL = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;

function memory(options: { failExtracted?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    crm_bookings: [
      { id: DOSSIER, reference: "TB-2026-0148", visible_to_client: false, customer_id: CLIENT },
      { id: AUTRE, reference: "TB-2026-0001", visible_to_client: true, customer_id: CLIENT },
    ],
    crm_email_ingest: [],
    crm_audit_events: [],
    crm_booking_items: [
      { id: CARTE, booking_id: DOSSIER, kind: "flight", title: "Rome → Paris", source_document_id: DOC_IMPORT },
      { id: CARTE_AUTRE, booking_id: AUTRE, kind: "hotel", title: "Hôtel", source_document_id: null },
    ],
    crm_booking_documents: [
      {
        id: DOC,
        booking_id: DOSSIER,
        booking_item_id: null,
        kind: "other",
        file_name: "note.txt",
        mime_type: "text/plain",
        storage_path: "bookings/222/note.txt",
        visible_to_client: false,
        content_sha256: null,
        email_ingest_id: null,
        extracted: null,
        created_at: "2026-11-02T10:00:00.000Z",
      },
      {
        id: DOC_MAIL,
        booking_id: DOSSIER,
        booking_item_id: CARTE,
        kind: "pdf",
        file_name: "billet.pdf",
        mime_type: "application/pdf",
        storage_path: "bookings/222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-billet.pdf",
        visible_to_client: true,
        content_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        email_ingest_id: MAIL,
        extracted: { firstName: "Camille", flight: "AF7308" },
        created_at: "2026-11-01T10:00:00.000Z",
      },
      {
        id: DOC_IMPORT,
        booking_id: DOSSIER,
        booking_item_id: null,
        kind: "pdf",
        file_name: "hotel.pdf",
        mime_type: "application/pdf",
        storage_path: "bookings/222/1730000000000-hotel.pdf",
        visible_to_client: false,
        content_sha256: null,
        email_ingest_id: null,
        extracted: null,
        created_at: "2026-11-03T10:00:00.000Z",
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        booking_id: AUTRE,
        booking_item_id: CARTE_AUTRE,
        kind: "other",
        file_name: "ailleurs.pdf",
        mime_type: "application/pdf",
        storage_path: "bookings/autre/ailleurs.pdf",
        visible_to_client: true,
        content_sha256: null,
        email_ingest_id: null,
        extracted: null,
        created_at: "2026-11-04T10:00:00.000Z",
      },
    ],
  };
  const removed: string[] = [];
  function from(table: string) {
    const filters: [string, unknown][] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let payload: Row = {};
    let capped = Number.POSITIVE_INFINITY;
    const api = {
      select() {
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = { ...value };
        return api;
      },
      insert(value: Row) {
        op = "insert";
        payload = { ...value };
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      limit(count: number) {
        capped = count;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(apply(true));
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(apply(false)).then(onFulfilled, onRejected);
      },
    };
    function matching() {
      return (tables[table] || [])
        .filter((row) => filters.every(([column, value]) => row[column] === value))
        .slice(0, capped);
    }
    function apply(single: boolean) {
      const found = matching();
      if (op === "delete") {
        removed.push(...found.map((row) => String(row.id)));
        tables[table] = (tables[table] || []).filter((row) => !found.includes(row));
        return { data: single ? found[0] || null : found, error: null };
      }
      if (op === "insert") {
        if (!tables[table]) tables[table] = [];
        tables[table].push(payload);
        return { data: single ? payload : [payload], error: null };
      }
      if (op === "update") {
        if (options.failExtracted && Object.prototype.hasOwnProperty.call(payload, "extracted")) {
          return { data: null, error: { code: "42703", message: "column extracted does not exist" } };
        }
        for (const row of found) Object.assign(row, payload);
        return { data: single ? found[0] || null : found, error: null };
      }
      return { data: single ? found[0] || null : found, error: null };
    }
    return api;
  }
  const client = {
    from,
    storage: {
      from() {
        return {
          remove(paths: string[]) {
            removed.push(...paths);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, tables, removed };
}

const sizes = async (paths: string[]) => {
  const map = new Map<string, number>();
  for (const path of paths) {
    if (path.endsWith("billet.pdf")) map.set(path, 1200);
  }
  return map;
};

test("la source distingue le mail, l’import et le dépôt", () => {
  assert.equal(pieceSource({ email_ingest_id: MAIL, kind: "pdf" }), "mail");
  assert.equal(pieceSource({ content_sha256: "abc", kind: "image" }), "mail");
  assert.equal(
    pieceSource({ storage_path: "bookings/x/" + "ab".repeat(32) + "-billet.pdf", kind: "other" }),
    "mail"
  );
  assert.equal(pieceSource({ kind: "pdf", source_document: true }), "import");
  assert.equal(pieceSource({ kind: "image" }), "import");
  assert.equal(pieceSource({ kind: "other" }), "upload");
  assert.equal(pieceSource({ kind: "carte d'embarquement" }), "upload");
  const kept = withPieceArchive({ firstName: "Camille", flight: "AF7308" }, { retiree_at: "2026-11-17T10:00:00.000Z", visible_avant: true });
  assert.equal(kept.firstName, "Camille");
  assert.equal(pieceEstRetiree(kept), true);
  assert.deepEqual(
    piecesActives([{ id: "a", extracted: kept }, { id: "b", extracted: null }]).map((row) => row.id),
    ["b"]
  );
});

test("le texte lu masque la carte et le passeport, et se coupe", () => {
  const read = pieceReadText("Passeport 12AB34567\nCarte 4111111111111111");
  assert.ok(read);
  assert.equal(read?.texte.includes("12AB34567"), false);
  assert.equal(read?.texte.includes("4111111111111111"), false);
  assert.equal(read?.texte.includes("567"), true);
  assert.equal(pieceReadText("   "), null);
  const long = pieceReadText("a".repeat(16_001));
  assert.equal(long?.tronque, true);
  assert.equal(long?.texte.length, 16_000);
});

test("lister un dossier : pièces, source, carte, taille, sans contenu ni URL", async () => {
  const db = memory();
  await assert.rejects(() => listerPiecesDossier({ reference: "TB-2099-0000" }, { admin: db.client }), /Dossier introuvable/);
  await assert.rejects(() => listerPiecesDossier({}, { admin: db.client }), /référence du dossier/);
  const page = await listerPiecesDossier(
    { reference: "TB-2026-0148" },
    { admin: db.client, fileSizes: sizes }
  );
  assert.equal(page.dossier_id, DOSSIER);
  assert.equal(page.reference, "TB-2026-0148");
  assert.deepEqual(
    page.pieces.map((row) => row.id),
    [DOC_MAIL, DOC, DOC_IMPORT]
  );
  const mail = page.pieces[0];
  assert.equal(mail?.nom, "billet.pdf");
  assert.equal(mail?.type_mime, "application/pdf");
  assert.equal(mail?.taille, 1200);
  assert.equal(mail?.ajoute_le, "2026-11-01T10:00:00.000Z");
  assert.equal(mail?.source, "mail");
  assert.equal(mail?.email_id, MAIL);
  assert.equal(mail?.visibilite, "visible");
  assert.equal(mail?.carte?.carte_id, CARTE);
  assert.equal(mail?.carte?.type, "flight");
  assert.equal(mail?.carte?.libelle, "Vol");
  assert.equal(mail?.carte?.titre, "Rome → Paris");
  assert.equal(page.pieces[1]?.source, "upload");
  assert.equal(page.pieces[1]?.taille, null);
  assert.equal(page.pieces[1]?.carte, null);
  assert.equal(page.pieces[1]?.email_id, null);
  assert.equal(page.pieces[1]?.visibilite, "masquee");
  assert.equal(page.pieces[2]?.source, "import");
  const raw = JSON.stringify(page);
  assert.equal(raw.includes("storage_path"), false);
  assert.equal(raw.includes("http"), false);
  assert.equal(raw.includes("Camille"), false);
  assert.equal(raw.includes(DOC) && page.pieces.some((row) => row.nom === "ailleurs.pdf"), false);
});

test("lire une pièce : texte masqué, ou URL courte s’il n’y a pas de texte", async () => {
  const db = memory();
  await assert.rejects(() => lirePieceDossier({ document_id: "pas-un-id" }, { admin: db.client }), /Pièce invalide/);
  await assert.rejects(
    () => lirePieceDossier({ document_id: "12121212-1212-4121-8121-121212121212" }, { admin: db.client }),
    /Pièce introuvable/
  );
  const text = await lirePieceDossier(
    { document_id: DOC },
    {
      admin: db.client,
      readBytes: async () => ({ bytes: new TextEncoder().encode("Passeport 12AB34567"), contentType: "text/plain" }),
    }
  );
  assert.equal(String(text.texte).includes("12AB34567"), false);
  assert.equal(text.tronque, false);
  assert.equal("url_signee" in text, false);
  const signed = "https://files.example/storage/v1/object/sign/crm-files/photo.jpg?token=eyJhbGciOi.payload.sig";
  const photo = await lirePieceDossier(
    { document_id: DOC_IMPORT },
    {
      admin: db.client,
      readBytes: async () => ({ bytes: new Uint8Array(), contentType: "application/pdf" }),
      pdfText: async () => ({ text: "" }),
      signedUrl: async (path, expires) => {
        assert.equal(path, "bookings/222/1730000000000-hotel.pdf");
        assert.equal(expires, 600);
        return signed;
      },
    }
  );
  assert.equal(photo.texte, null);
  assert.equal(photo.url_signee, signed);
  assert.equal(photo.expire_secondes, 600);
  const kept = JSON.parse(previewMcpTool("lire_piece_dossier", photo).content[0].text) as { url_signee?: string };
  assert.equal(kept.url_signee, signed);
  const stripped = JSON.parse(
    previewMcpTool("lister_pieces_dossier", { url_signee: signed, storage_path: "secret" }).content[0].text
  ) as Record<string, unknown>;
  assert.equal(JSON.stringify(stripped).includes(signed), false);
  assert.equal("storage_path" in stripped, false);
});

test("rattacher une pièce à une carte du même dossier, et refuser l’autre dossier", async () => {
  const db = memory();
  await assert.rejects(
    () =>
      rattacherPieceCarte(
        { reference: "TB-2099-0000", document_id: DOC, carte_id: CARTE },
        { admin: db.client }
      ),
    /Dossier introuvable/
  );
  await assert.rejects(
    () => rattacherPieceCarte({ dossier_id: DOSSIER, document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", carte_id: CARTE }, { admin: db.client }),
    /n’est pas sur ce dossier/
  );
  await assert.rejects(
    () => rattacherPieceCarte({ dossier_id: DOSSIER, document_id: DOC, carte_id: CARTE_AUTRE }, { admin: db.client }),
    /carte n’est pas sur ce dossier/
  );
  const linked = await rattacherPieceCarte(
    { dossier_id: DOSSIER, document_id: DOC, carte_id: CARTE },
    { admin: db.client }
  );
  assert.equal(linked.carte_id, CARTE);
  assert.equal(linked.visibilite, "masquee");
  const row = db.tables.crm_booking_documents.find((item) => item.id === DOC);
  assert.equal(row?.booking_item_id, CARTE);
  assert.equal(row?.visible_to_client, false);
  assert.equal(db.tables.crm_bookings[0]?.visible_to_client, false);
  const detached = await rattacherPieceCarte(
    { reference: "TB-2026-0148", document_id: DOC, detacher: true },
    { admin: db.client }
  );
  assert.equal(detached.carte_id, null);
  assert.equal(row?.booking_item_id, null);
});

test("montrer ou masquer une pièce ne publie pas le séjour", async () => {
  const db = memory();
  await assert.rejects(
    () => changerVisibilitePiece({ dossier_id: DOSSIER, document_id: DOC }, { admin: db.client }),
    /visible/
  );
  await assert.rejects(
    () =>
      changerVisibilitePiece(
        { dossier_id: AUTRE, document_id: DOC, visible: true },
        { admin: db.client }
      ),
    /n’est pas sur ce dossier/
  );
  const shown = await changerVisibilitePiece(
    { reference: "TB-2026-0148", document_id: DOC_IMPORT, visible: true },
    { admin: db.client }
  );
  assert.equal(shown.visibilite, "visible");
  const row = db.tables.crm_booking_documents.find((item) => item.id === DOC_IMPORT);
  assert.equal(row?.visible_to_client, true);
  assert.equal(db.tables.crm_bookings.find((item) => item.id === DOSSIER)?.visible_to_client, false);
  const hidden = await changerVisibilitePiece(
    { dossier_id: DOSSIER, document_id: DOC_IMPORT, visible: false },
    { admin: db.client }
  );
  assert.equal(hidden.visibilite, "masquee");
  assert.equal(row?.visible_to_client, false);
});

test("retirer une pièce archive sans effacer le fichier, et se restaure", async () => {
  const db = memory();
  await assert.rejects(
    () => retirerPieceDossier({ dossier_id: DOSSIER, document_id: DOC_MAIL }, { admin: db.client }),
    /confirmer true/
  );
  const before = db.tables.crm_booking_documents.find((item) => item.id === DOC_MAIL);
  assert.equal(before?.visible_to_client, true);
  assert.equal(db.removed.length, 0);
  await assert.rejects(
    () =>
      retirerPieceDossier(
        { reference: "TB-2099-0000", document_id: DOC_MAIL, confirmer: true },
        { admin: db.client }
      ),
    /Dossier introuvable/
  );
  await assert.rejects(
    () =>
      retirerPieceDossier(
        { dossier_id: DOSSIER, document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", confirmer: true },
        { admin: db.client }
      ),
    /n’est pas sur ce dossier/
  );
  const removed = await retirerPieceDossier(
    { reference: "TB-2026-0148", document_id: DOC_MAIL, confirmer: true },
    { admin: db.client, now: () => "2026-11-17T10:00:00.000Z" }
  );
  assert.equal(removed.retiree, true);
  assert.equal(before?.visible_to_client, false);
  assert.equal(before?.storage_path, "bookings/222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-billet.pdf");
  const extracted = before?.extracted as { firstName?: string; flight?: string; tri_piece?: { visible_avant?: boolean } };
  assert.equal(extracted.firstName, "Camille");
  assert.equal(extracted.flight, "AF7308");
  assert.equal(extracted.tri_piece?.visible_avant, true);
  assert.equal(db.removed.length, 0);
  assert.equal(db.tables.crm_booking_documents.some((item) => item.id === DOC_MAIL), true);
  const listed = await listerPiecesDossier({ dossier_id: DOSSIER }, { admin: db.client, fileSizes: sizes });
  assert.equal(listed.pieces.some((row) => row.id === DOC_MAIL), false);
  const withRetired = await listerPiecesDossier(
    { dossier_id: DOSSIER, inclure_retirees: true },
    { admin: db.client, fileSizes: sizes }
  );
  const retired = withRetired.pieces.find((row) => row.id === DOC_MAIL);
  assert.equal(retired?.retiree, true);
  assert.equal(retired?.retiree_le, "2026-11-17T10:00:00.000Z");
  assert.equal(retired?.visibilite, "masquee");
  await assert.rejects(
    () => rattacherPieceCarte({ dossier_id: DOSSIER, document_id: DOC_MAIL, carte_id: CARTE }, { admin: db.client }),
    /retirée/
  );
  await assert.rejects(
    () => changerVisibilitePiece({ dossier_id: DOSSIER, document_id: DOC_MAIL, visible: true }, { admin: db.client }),
    /retirée/
  );
  const again = await retirerPieceDossier(
    { dossier_id: DOSSIER, document_id: DOC_MAIL, confirmer: true },
    { admin: db.client }
  );
  assert.equal(again.deja_retiree, true);
  const restored = await retirerPieceDossier(
    { dossier_id: DOSSIER, document_id: DOC_MAIL, confirmer: true, restaurer: true },
    { admin: db.client }
  );
  assert.equal(restored.restauree, true);
  assert.equal(restored.visibilite, "visible");
  assert.equal(before?.visible_to_client, true);
  assert.equal((before?.extracted as { firstName?: string; tri_piece?: unknown }).firstName, "Camille");
  assert.equal((before?.extracted as { tri_piece?: unknown }).tri_piece, undefined);
  assert.equal(db.removed.length, 0);
});

test("sans la colonne de classement, le retrait n’efface rien", async () => {
  const db = memory({ failExtracted: true });
  const row = db.tables.crm_booking_documents.find((item) => item.id === DOC_MAIL);
  await assert.rejects(
    () => retirerPieceDossier({ dossier_id: DOSSIER, document_id: DOC_MAIL, confirmer: true }, { admin: db.client }),
    /n’a pas été effacé/
  );
  assert.equal(row?.visible_to_client, true);
  assert.equal((row?.extracted as { firstName?: string }).firstName, "Camille");
  assert.equal(db.removed.length, 0);
  assert.equal(db.tables.crm_booking_documents.some((item) => item.id === DOC_MAIL), true);
});

test("déplacer une pièce : aperçu, puis le même fichier, visibilité conservée", async () => {
  const db = memory();
  const preview = await deplacerPieceDossier(
    { piece_id: DOC, dossier_id: DOSSIER, dossier_cible: "TB-2026-0001" },
    { admin: db.client }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.envoye, false);
  assert.equal(preview.message, false);
  assert.equal(preview.visibilite, "masquee");
  assert.equal(preview.meme_client, true);
  assert.equal(preview.accepter_client_requis, false);
  assert.equal(preview.fichier, "conserve");
  assert.equal(preview.cible.dossier_id, AUTRE);
  const still = db.tables.crm_booking_documents.find((item) => item.id === DOC);
  assert.equal(still?.booking_id, DOSSIER);
  assert.equal(still?.storage_path, "bookings/222/note.txt");

  const moved = await deplacerPieceDossier(
    { piece_id: DOC, reference: "TB-2026-0148", dossier_cible: AUTRE, confirmer: true },
    { admin: db.client }
  );
  assert.equal(moved.ecrit, true);
  assert.equal(moved.apercu, false);
  assert.equal(moved.visibilite, "masquee");
  assert.equal(moved.message, false);
  assert.equal(still?.booking_id, AUTRE);
  assert.equal(still?.booking_item_id, null);
  assert.equal(still?.visible_to_client, false);
  assert.equal(still?.storage_path, "bookings/222/note.txt");
  assert.equal(db.tables.crm_audit_events.length, 1);
  assert.equal(db.tables.crm_audit_events[0]?.action, "deplacer_piece");
  assert.equal(db.removed.length, 0);
});

test("la carte cible est sur le dossier d’arrivée, et une carte ailleurs est refusée", async () => {
  const db = memory();
  await assert.rejects(
    () =>
      deplacerPieceDossier(
        { piece_id: DOC, dossier_id: DOSSIER, dossier_cible: AUTRE, carte_id: CARTE, confirmer: true },
        { admin: db.client }
      ),
    /n’est pas sur le dossier cible/
  );
  const row = db.tables.crm_booking_documents.find((item) => item.id === DOC);
  assert.equal(row?.booking_id, DOSSIER);
  const moved = await deplacerPieceDossier(
    { piece_id: DOC, dossier_id: DOSSIER, dossier_cible: AUTRE, carte_id: CARTE_AUTRE, confirmer: true },
    { admin: db.client }
  );
  assert.equal(moved.carte_id, CARTE_AUTRE);
  assert.equal(row?.booking_id, AUTRE);
  assert.equal(row?.booking_item_id, CARTE_AUTRE);
  assert.equal(row?.visible_to_client, false);
});

test("un autre client est refusé sans accepter_client, et la pièce visible le reste", async () => {
  const tiers = "cccccccc-3333-4333-8333-cccccccccccc";
  const db = memory();
  db.tables.crm_bookings.push({
    id: tiers,
    reference: "TB-2026-0099",
    customer_id: CLIENT_2,
    visible_to_client: false,
  });
  const visible = db.tables.crm_booking_documents.find((item) => item.id === DOC_MAIL);
  const preview = await deplacerPieceDossier(
    { piece_id: DOC_MAIL, dossier_id: DOSSIER, dossier_cible: tiers },
    { admin: db.client }
  );
  assert.equal(preview.ecrit, false);
  assert.equal(preview.accepter_client_requis, true);
  assert.equal(preview.meme_client, false);
  assert.equal(preview.visibilite, "visible");
  await assert.rejects(
    () =>
      deplacerPieceDossier(
        { piece_id: DOC_MAIL, dossier_id: DOSSIER, dossier_cible: tiers, confirmer: true },
        { admin: db.client }
      ),
    /accepter_client/
  );
  assert.equal(visible?.booking_id, DOSSIER);
  assert.equal(visible?.visible_to_client, true);
  const moved = await deplacerPieceDossier(
    { piece_id: DOC_MAIL, dossier_id: DOSSIER, dossier_cible: tiers, confirmer: true, accepter_client: true },
    { admin: db.client }
  );
  assert.equal(moved.ecrit, true);
  assert.equal(moved.visibilite, "visible");
  assert.equal(visible?.booking_id, tiers);
  assert.equal(visible?.visible_to_client, true);
  assert.equal(String(visible?.storage_path || "").includes("billet.pdf"), true);
});

test("le mail suit la pièce quand il ne reste plus de pièce de ce mail", async () => {
  const db = memory();
  db.tables.crm_email_ingest.push({ id: MAIL, status: "attached", created_booking_id: DOSSIER });
  const moved = await deplacerPieceDossier(
    { document_id: DOC_MAIL, dossier_id: DOSSIER, reference_cible: "TB-2026-0001", confirmer: true },
    { admin: db.client }
  );
  assert.equal(moved.mail, "deplace");
  assert.equal(moved.visibilite, "visible");
  const mail = db.tables.crm_email_ingest[0];
  assert.equal(mail?.created_booking_id, AUTRE);
  assert.equal(mail?.status, "attached");
  const piece = db.tables.crm_booking_documents.find((item) => item.id === DOC_MAIL);
  assert.equal(piece?.email_ingest_id, MAIL);
  assert.equal(piece?.booking_id, AUTRE);
});
