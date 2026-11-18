import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  justificatifsRetiresAvec,
  mentionRetraitJustificatifs,
  planDocumentRelease,
  restoredPieceFields,
  type StayDocumentRow,
  type StayItemRef,
} from "./stay-documents";

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

function cartes(...ids: string[]): StayItemRef[] {
  return ids.map((id) => ({ id, source_document_id: null }));
}

test("supprimer l’aller et le retour retire les deux copies du PDF", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    items: cartes("aller", "retour"),
    documents: [
      piece({ id: "doc-aller", booking_item_id: "aller", created_at: "2026-11-01T10:00:00.000Z" }),
      piece({ id: "doc-retour", booking_item_id: "retour", created_at: "2026-11-01T11:00:00.000Z" }),
    ],
  });
  assert.deepEqual(
    plan.release.map((row) => row.id).sort(),
    ["doc-aller", "doc-retour"]
  );
  assert.deepEqual(plan.relink, []);
  assert.ok(plan.release.every((row) => row.clearSha));
  const mark = plan.release[0]?.extracted.tri_piece as { empreinte?: string; retiree_at?: string };
  assert.equal(mark.empreinte, SHA);
  assert.equal(mark.retiree_at, "2026-11-18T12:00:00.000Z");
  assert.equal("storage_path" in (plan.release[0]?.extracted || {}), false);
});

test("supprimer seulement l’aller retire sa copie et laisse le PDF sur le retour", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller"],
    items: cartes("aller", "retour"),
    documents: [
      piece({ id: "doc-aller", booking_item_id: "aller" }),
      piece({ id: "doc-retour", booking_item_id: "retour" }),
    ],
  });
  assert.deepEqual(
    plan.release.map((row) => row.id),
    ["doc-aller"]
  );
  assert.deepEqual(plan.relink, []);
  assert.equal(justificatifsRetiresAvec("aller", cartes("aller", "retour"), [
    piece({ id: "doc-aller", booking_item_id: "aller" }),
    piece({ id: "doc-retour", booking_item_id: "retour" }),
  ]), 1);
});

test("un même PDF lié aux deux cartes reste sur le retour", () => {
  const shared = piece({ id: "pdf", booking_item_id: "aller" });
  const items: StayItemRef[] = [
    { id: "aller", source_document_id: "pdf" },
    { id: "retour", source_document_id: "pdf" },
  ];
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller"],
    items,
    documents: [shared],
  });
  assert.deepEqual(plan.release, []);
  assert.deepEqual(plan.relink, [{ id: "pdf", bookingItemId: "retour" }]);
  assert.equal(justificatifsRetiresAvec("aller", items, [shared]), 0);
  assert.equal(mentionRetraitJustificatifs(0), "");
});

test("le PDF partagé part quand les deux cartes sont retirées", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    items: [
      { id: "aller", source_document_id: "pdf" },
      { id: "retour", source_document_id: "pdf" },
    ],
    documents: [piece({ id: "pdf", booking_item_id: "aller", content_sha256: null })],
  });
  assert.deepEqual(
    plan.release.map((row) => row.id),
    ["pdf"]
  );
  assert.equal(plan.release[0]?.clearSha, false);
  assert.deepEqual(plan.relink, []);
});

test("une pièce déjà dans le dossier n’est pas retirée avec les cartes", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller", "retour"],
    items: cartes("aller", "retour"),
    documents: [
      piece({ id: "orpheline", booking_item_id: null, created_at: "2026-10-01T10:00:00.000Z" }),
      piece({ id: "doc-aller", booking_item_id: "aller" }),
      piece({ id: "doc-retour", booking_item_id: "retour" }),
    ],
  });
  assert.deepEqual(
    plan.release.map((row) => row.id).sort(),
    ["doc-aller", "doc-retour"]
  );
});

test("un justificatif lié seulement par la carte source est retiré avec elle", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["hotel"],
    items: [{ id: "hotel", source_document_id: "confirmation" }],
    documents: [piece({ id: "confirmation", booking_item_id: null, content_sha256: null })],
  });
  assert.deepEqual(
    plan.release.map((row) => row.id),
    ["confirmation"]
  );
});

test("restaurer une pièce retirée remet son empreinte", () => {
  const plan = planDocumentRelease({
    now: "2026-11-18T12:00:00.000Z",
    deletedItemIds: ["aller"],
    items: cartes("aller"),
    documents: [piece({ id: "doc-aller", booking_item_id: "aller", visible_to_client: true })],
  });
  const fields = restoredPieceFields({
    extracted: plan.release[0]?.extracted,
    content_sha256: null,
    visible_to_client: false,
  });
  assert.equal(fields?.content_sha256, SHA);
  assert.equal(fields?.visible_to_client, true);
  assert.equal(fields?.extracted, null);
});

test("la confirmation nomme le nombre de justificatifs", () => {
  assert.equal(mentionRetraitJustificatifs(1), "La carte et son justificatif seront retirés.");
  assert.equal(mentionRetraitJustificatifs(2), "La carte et ses 2 justificatifs seront retirés.");
});

test("la migration rend l’index partiel et le commit atomique", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261118190000_stay_step_commit.sql", import.meta.url), "utf8");
  assert.match(sql, /where content_sha256 is not null\s+and booking_item_id is not null/i);
  assert.match(sql, /function public\.crm_commit_stay_steps/);
  const releaseAt = sql.indexOf("crm_booking_documents");
  const deleteAt = sql.indexOf("delete from public.crm_booking_items");
  assert.ok(releaseAt > 0 && deleteAt > releaseAt);
});
