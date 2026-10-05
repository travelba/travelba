import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  archiveBookingPatch,
  duplicateBookingInsert,
  duplicateCoverPath,
  duplicateDeclinedServiceRow,
  duplicateDocumentRow,
  duplicateHotelLetterRow,
  duplicateItemRow,
  duplicateStoragePath,
  duplicateVisaRequestRow,
  isBookingArchived,
  restoreBookingPatch,
} from "./booking-lifecycle";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("une réservation supprimée est archivée, masquée, et se réactive comme avant", () => {
  assert.equal(isBookingArchived({ archived_at: null }), false);
  assert.equal(isBookingArchived({ archived_at: "2026-09-30T12:00:00.000Z" }), true);
  const archived = archiveBookingPatch({ visible_to_client: true }, "2026-09-30T12:00:00.000Z");
  assert.equal(archived.visible_to_client, false);
  assert.equal(archived.archived_was_visible, true);
  assert.equal(archived.archived_at, "2026-09-30T12:00:00.000Z");
  const restored = restoreBookingPatch(archived);
  assert.equal(restored.archived_at, null);
  assert.equal(restored.visible_to_client, true);
  assert.equal(restoreBookingPatch({ archived_was_visible: false }).visible_to_client, false);
});

test("dupliquer ouvre un brouillon avec une nouvelle référence", () => {
  const copy = duplicateBookingInsert(
    {
      customer_id: "client",
      billing_customer_id: "payeur",
      payer_kind: "company",
      reference: "TB-1042",
      title: "Avoriaz",
      destination: "Avoriaz",
      start_date: "2026-12-20",
      end_date: "2026-12-27",
      currency: "EUR",
      total_amount: 2400,
      notes_internal: "Suite",
      offer_chauffeur: true,
      offer_visa: true,
      prices_visible: true,
    },
    "TB-1100"
  );
  assert.equal(copy.reference, "TB-1100");
  assert.equal(copy.status, "draft");
  assert.equal(copy.visible_to_client, false);
  assert.equal(copy.archived_at, null);
  assert.equal(copy.share_code, null);
  assert.equal(copy.customer_id, "client");
  assert.equal(copy.billing_customer_id, "payeur");
  assert.equal(copy.title, "Avoriaz");
  assert.equal(copy.offer_chauffeur, true);
  assert.equal(copy.offer_visa, true);
  assert.match(String(copy.notes_internal), /Copie de TB-1042/);
  assert.match(String(copy.notes_internal), /Suite/);
});

test("la copie d’une carte garde le contenu et pointe le nouveau document", () => {
  const item = duplicateItemRow(
    {
      id: "old-item",
      booking_id: "old-booking",
      kind: "hotel",
      title: "Les Cimes",
      source_document_id: "old-doc",
      visible_to_client: true,
      details: { city: "Avoriaz" },
      created_at: "2026-01-01",
    },
    "new-booking",
    "new-doc"
  );
  assert.equal(item.id, undefined);
  assert.equal(item.booking_id, "new-booking");
  assert.equal(item.kind, "hotel");
  assert.equal(item.title, "Les Cimes");
  assert.equal(item.source_document_id, "new-doc");
  assert.deepEqual(item.details, { city: "Avoriaz" });
  const doc = duplicateDocumentRow(
    { id: "old-doc", booking_id: "old", kind: "hotel", file_name: "voucher.pdf", booking_item_id: "old-item" },
    "new-booking",
    "bookings/new-booking/0-voucher.pdf"
  );
  assert.equal(doc.booking_item_id, null);
  assert.equal(doc.storage_path, "bookings/new-booking/0-voucher.pdf");
  assert.equal(duplicateStoragePath("new-booking", "voucher.pdf", 0), "bookings/new-booking/0-voucher.pdf");
  assert.equal(duplicateCoverPath("new-booking", "bookings/old/cover.webp"), "bookings/new-booking/cover.webp");
});

test("dupliquer reprend visa, refus et courrier, pas un paiement", () => {
  const visa = duplicateVisaRequestRow(
    { country: "US", status: "en_cours", step: "remplissage", answers: { ok: true }, pliant_transaction_id: "card" },
    "copy"
  );
  assert.equal(visa.booking_id, "copy");
  assert.equal(visa.country, "US");
  assert.equal(visa.pliant_transaction_id, null);
  const refusal = duplicateDeclinedServiceRow(
    { kind: "chauffeur", service_leg: "arrival", place: "hotel", moment: "" },
    "copy"
  );
  assert.equal(refusal.kind, "chauffeur");
  assert.equal(refusal.place, "hotel");
  const letter = duplicateHotelLetterRow(
    { kind: "precheckin", subject: "Arrivée", body: "Bonjour", status: "sent", recipients: ["hotel@example.com"] },
    "copy",
    "item-2"
  );
  assert.equal(letter.booking_item_id, "item-2");
  assert.equal(letter.status, "draft");
  assert.equal(letter.subject, "Arrivée");
});

test("supprimer depuis l’agence archive le dossier et le bouton dit Archiver", () => {
  const src = readFileSync(join(root, "app/api/admin/bookings/[id]/route.ts"), "utf8");
  assert.match(src, /archiveBookingById/);
  assert.doesNotMatch(src, /deleteBookingById/);
  const button = readFileSync(join(root, "components/admin/ArchiveBookingButton.tsx"), "utf8");
  assert.match(button, /ArchiveBookingButton/);
  assert.match(button, /label="Archiver"/);
  assert.doesNotMatch(button, /Supprimer/);
});
