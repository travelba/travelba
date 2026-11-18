import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planDocumentRelease, restoredPieceFields, type StayDocumentRow } from "./stay-documents";

const SHA = "a".repeat(64);

function piece(patch: Partial<StayDocumentRow> & Pick<StayDocumentRow, "id">): StayDocumentRow {
  return {
    booking_item_id: null,
    content_sha256: SHA,
    extracted: null,
    visible_to_client: true,
    created_at: "2026-11-01T10:00:00.000Z",
    ...patch,
  };
}

test("supprimer l’aller et le retour qui partagent un PDF ne laisse qu’une pièce", () => {
  const release = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    documents: [
      piece({ id: "doc-aller", booking_item_id: "aller", created_at: "2026-11-01T10:00:00.000Z" }),
      piece({ id: "doc-retour", booking_item_id: "retour", created_at: "2026-11-01T11:00:00.000Z" }),
    ],
  });
  assert.deepEqual(
    release.map((row) => row.id),
    ["doc-retour"]
  );
  assert.equal(release[0]?.clearSha, true);
  const mark = release[0]?.extracted.tri_piece as { empreinte?: string; retiree_at?: string };
  assert.equal(mark.empreinte, SHA);
  assert.equal(mark.retiree_at, "2026-11-18T12:00:00.000Z");
});

test("supprimer les deux pièces retire les deux, sans effacer le stockage", () => {
  const release = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    removeIds: ["doc-aller", "doc-retour"],
    documents: [
      piece({ id: "doc-aller", booking_item_id: "aller" }),
      piece({ id: "doc-retour", booking_item_id: "retour" }),
    ],
  });
  assert.deepEqual(
    release.map((row) => row.id).sort(),
    ["doc-aller", "doc-retour"]
  );
  assert.ok(release.every((row) => row.clearSha));
  assert.equal("storage_path" in (release[0]?.extracted || {}), false);
});

test("supprimer seulement l’aller laisse le PDF sur le retour", () => {
  const release = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller"],
    documents: [
      piece({ id: "doc-aller", booking_item_id: "aller" }),
      piece({ id: "doc-retour", booking_item_id: "retour" }),
    ],
  });
  assert.deepEqual(release, []);
});

test("une pièce déjà dans le dossier absorbe le doublon de la carte supprimée", () => {
  const release = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    documents: [
      piece({ id: "orpheline", booking_item_id: null, created_at: "2026-10-01T10:00:00.000Z" }),
      piece({ id: "doc-aller", booking_item_id: "aller" }),
      piece({ id: "doc-retour", booking_item_id: "retour" }),
    ],
  });
  assert.deepEqual(
    release.map((row) => row.id).sort(),
    ["doc-aller", "doc-retour"]
  );
});

test("restaurer une pièce retirée remet son empreinte", () => {
  const [released] = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller"],
    removeIds: ["doc-aller"],
    documents: [piece({ id: "doc-aller", booking_item_id: "aller", visible_to_client: true })],
  });
  const fields = restoredPieceFields({ extracted: released?.extracted, content_sha256: null, visible_to_client: false });
  assert.equal(fields?.content_sha256, SHA);
  assert.equal(fields?.visible_to_client, true);
  assert.equal(fields?.extracted, null);
});

test("la migration rend l’index partiel et le commit atomique", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261118190000_stay_step_commit.sql", import.meta.url), "utf8");
  assert.match(sql, /where content_sha256 is not null\s+and booking_item_id is not null/i);
  assert.match(sql, /function public\.crm_commit_stay_steps/);
  const releaseAt = sql.indexOf("crm_booking_documents");
  const deleteAt = sql.indexOf("delete from public.crm_booking_items");
  assert.ok(releaseAt > 0 && deleteAt > releaseAt);
});
