import assert from "node:assert/strict";
import test from "node:test";
import { downloadActivityPath } from "./customer-activity";
import {
  describeDownload,
  hashedDownloadKey,
  planDownloadRepair,
  sanitizeDownloadFileName,
  staffDownloadAudit,
  vagueDownloadSummary,
  type PieceSource,
} from "./download-journal";

const TICKET = "Billet LEVY MERYL 25AUG2027 Mahé → Dubaï.pdf";
const BOOKING = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function piece(partial: Partial<PieceSource> & Pick<PieceSource, "id" | "table" | "storagePath">): PieceSource {
  return {
    kind: "pdf",
    fileName: TICKET,
    firstName: null,
    bookingId: BOOKING,
    reference: "TB-2026-0092",
    ...partial,
  };
}

test("un billet affiche le nom du fichier et la référence du séjour", () => {
  const row = describeDownload({
    id: DOC,
    table: "crm_booking_documents",
    kind: "pdf",
    fileName: TICKET,
    bookingId: BOOKING,
    reference: "TB-2026-0092",
    itemKind: "flight",
  });
  assert.equal(
    row.summary,
    "A téléchargé : Billet LEVY MERYL 25AUG2027 Mahé → Dubaï (TB-2026-0092)"
  );
  assert.equal(row.path, `download/${DOC}`);
  assert.equal(row.bookingId, BOOKING);
  assert.equal(row.documentTable, "crm_booking_documents");
  assert.equal(row.documentKind, "flight");
  assert.equal(row.documentName.includes(".pdf"), false);
  assert.equal(row.summary.includes("€"), false);
});

test("un passeport ne dit que le prénom", () => {
  const fileName = "passeport-12AB34567-P<FRADUPONT<<MERYL<<<<<<<<<<<<.pdf";
  const row = describeDownload({
    id: DOC,
    table: "crm_travel_documents",
    kind: "passport",
    fileName,
    firstName: "MERYL LOUISE",
    bookingId: BOOKING,
    reference: "TB-2026-0092",
  });
  assert.equal(row.summary, "A téléchargé : Passeport de Meryl");
  assert.equal(row.documentName, "Passeport de Meryl");
  assert.equal(row.documentKind, "passport");
  assert.equal(row.bookingId, BOOKING);
  const dumped = JSON.stringify(row);
  assert.equal(dumped.includes("12AB34567"), false);
  assert.equal(dumped.includes("P<FRA"), false);
  assert.equal(dumped.includes("passeport-"), false);
  assert.equal(dumped.includes("LEVY"), false);
  assert.equal(dumped.includes("TB-2026-0092"), false);
  assert.equal(dumped.includes("LOUISE"), false);
});

test("une carte, un visa ou une ETA suivent le prénom, sans fichier", () => {
  const idCard = describeDownload({
    id: DOC,
    table: "crm_travel_documents",
    kind: "id_card",
    fileName: "cni-12AB34567.pdf",
    firstName: "Jean-Pierre",
  });
  assert.equal(idCard.summary, "A téléchargé : Carte d'identité de Jean-Pierre");
  const visa = describeDownload({
    id: DOC,
    table: "crm_travel_documents",
    kind: "visa",
    fileName: "visa.pdf",
    firstName: "Meryl",
    reference: "TB-2026-0092",
  });
  assert.equal(visa.summary, "A téléchargé : Visa de Meryl");
  assert.equal(visa.summary.includes("TB-2026-0092"), false);
  const eta = describeDownload({
    id: DOC,
    table: "crm_travel_documents",
    kind: "eta",
    firstName: null,
    fileName: "eta-AB3456789.pdf",
  });
  assert.equal(eta.summary, "A téléchargé : Autorisation de voyage");
  assert.equal(JSON.stringify(eta).includes("AB3456789"), false);
});

test("un numéro dans le nom d’un billet est retiré", () => {
  assert.equal(sanitizeDownloadFileName("confirmation-12AB34567.pdf"), "confirmation");
  assert.equal(sanitizeDownloadFileName("AB3456789.pdf"), null);
  const row = describeDownload({
    id: DOC,
    table: "crm_booking_documents",
    kind: "pdf",
    fileName: "Billet 12AB34567 Mahé.pdf",
    reference: "TB-2026-0092",
    itemKind: "flight",
  });
  assert.equal(row.summary.includes("12AB34567"), false);
  assert.match(row.summary, /Billet\s+Mahé/);
  assert.match(row.summary, /TB-2026-0092/);
});

test("la référence déjà dans le nom n’est pas répétée", () => {
  const row = describeDownload({
    id: DOC,
    table: "crm_booking_documents",
    kind: "invoice",
    fileName: "Facture TB-2026-0092.pdf",
    reference: "TB-2026-0092",
  });
  assert.equal(row.summary, "A téléchargé : Facture TB-2026-0092");
  assert.equal(row.documentKind, "invoice");
});

test("sans nom de fichier, le type suffit", () => {
  const row = describeDownload({
    id: DOC,
    table: "crm_booking_documents",
    kind: "pdf",
    fileName: null,
    itemKind: "flight",
    reference: "TB-2026-0092",
  });
  assert.equal(row.summary, "A téléchargé : Billet (TB-2026-0092)");
});

test("une ancienne ligne n’est reprise que sur un seul document", () => {
  const storage = "customers/client/documents/billet.pdf";
  const path = downloadActivityPath(storage);
  assert.match(path || "", /^download\/[0-9a-f]{8}$/);
  assert.equal(hashedDownloadKey(path), path?.slice("download/".length));
  const travel = piece({
    id: DOC,
    table: "crm_travel_documents",
    storagePath: storage,
    kind: "other",
    fileName: TICKET,
  });
  const row = { path, summary: "A téléchargé une pièce", documentId: null };
  assert.equal(vagueDownloadSummary(row.summary), true);
  const found = planDownloadRepair(row, [travel]);
  assert.equal(found?.id, DOC);
  const described = describeDownload(found!);
  assert.match(described.summary, /Billet LEVY MERYL/);
  assert.equal(described.bookingId, BOOKING);

  const twin = piece({ id: OTHER, table: "crm_travel_documents", storagePath: storage, kind: "other" });
  assert.equal(planDownloadRepair(row, [travel, twin]), null);
  assert.equal(planDownloadRepair(row, []), null);
  assert.equal(
    planDownloadRepair(row, [piece({ id: DOC, table: "crm_booking_documents", storagePath: storage })]),
    null
  );
  assert.equal(planDownloadRepair({ path, summary: "A téléchargé un relevé" }, [travel]), null);
  assert.equal(planDownloadRepair({ ...row, documentId: DOC }, [travel]), null);
});

test("un ancien téléchargement de dossier se retrouve par l’identifiant complet", () => {
  const bookingDoc = piece({ id: DOC, table: "crm_booking_documents", storagePath: "bookings/x/secret.pdf" });
  const found = planDownloadRepair(
    { path: `download/${DOC}`, summary: "A téléchargé un document du séjour Tel-Aviv (TB-2026-0055)" },
    [bookingDoc]
  );
  assert.equal(found?.id, DOC);
  const sameId = piece({ id: DOC, table: "crm_travel_documents", storagePath: "customers/a/documents/a.pdf", kind: "other" });
  assert.equal(
    planDownloadRepair({ path: `download/${DOC}`, summary: "A téléchargé un document" }, [bookingDoc, sameId]),
    null
  );
});

test("l’audit d’un passeport ne contient ni numéro ni MRZ", () => {
  const pieceRow = describeDownload({
    id: DOC,
    table: "crm_travel_documents",
    kind: "passport",
    fileName: "passeport-12AB34567.pdf",
    firstName: "Meryl",
    bookingId: BOOKING,
    reference: "TB-2026-0092",
  });
  const audit = staffDownloadAudit({
    staffId: "44444444-4444-4444-8444-444444444444",
    customerId: "55555555-5555-4555-8555-555555555555",
    bookingId: pieceRow.bookingId,
    summary: pieceRow.summary,
    documentId: pieceRow.documentId,
    documentTable: pieceRow.documentTable,
    documentKind: pieceRow.documentKind,
    documentName: pieceRow.documentName,
  });
  const dumped = JSON.stringify(audit);
  assert.equal(audit.action, "download");
  assert.equal(audit.actor_kind, "human");
  assert.equal(audit.summary, "A téléchargé : Passeport de Meryl");
  assert.equal(dumped.includes("12AB34567"), false);
  assert.equal(dumped.includes("passeport-"), false);
  assert.equal(dumped.includes("•••"), false);
  assert.equal(audit.booking_id, BOOKING);
  assert.equal(audit.detail.document_table, "crm_travel_documents");
});
