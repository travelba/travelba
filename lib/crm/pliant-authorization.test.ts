import assert from "node:assert/strict";
import test from "node:test";
import { formatDateFr } from "./dates";
import {
  coverPliantAuthorizations,
  pliantCoverNote,
  pliantStatusBlocksAttach,
  splitCoveredAuthorizations,
  type PliantCoverSpend,
} from "./pliant-authorization";

const DOSSIER = "tb-2026-0159";
const CARD_A = "card-bloquee";
const CARD_B = "card-debitee";
const DAY = "2026-11-10";
const CENTS = -239101;

function spend(partial: Partial<PliantCoverSpend> & Pick<PliantCoverSpend, "id" | "status">): PliantCoverSpend {
  return {
    type: "PURCHASE",
    merchant: "TRANSAVIA",
    billingCents: CENTS,
    currency: "EUR",
    occurredOn: DAY,
    cardId: CARD_A,
    bookingIds: [DOSSIER],
    ...partial,
  };
}

test("un refus ou une annulation n’est jamais une sortie à rattacher", () => {
  assert.equal(pliantStatusBlocksAttach("DECLINED"), true);
  assert.equal(pliantStatusBlocksAttach("reversed"), true);
  assert.equal(pliantStatusBlocksAttach("CONFIRMED"), false);
  assert.equal(pliantStatusBlocksAttach("BOOKED"), false);
  assert.equal(pliantStatusBlocksAttach("PENDING"), false);
});

test("Transavia : l’autorisation et le refus de la première carte sont couverts par le débit de la seconde", () => {
  const auth = spend({ id: "auth-1", status: "CONFIRMED" });
  const second = spend({ id: "auth-2", status: "CONFIRMED" });
  const declined = spend({ id: "declined-1", status: "DECLINED" });
  const reversed = spend({ id: "reversed-1", status: "REVERSED" });
  const debit = spend({
    id: "debit-1",
    status: "BOOKED",
    merchant: "Transavia",
    billingCents: 239101,
    cardId: CARD_B,
    bookingIds: [DOSSIER],
  });
  const covers = coverPliantAuthorizations([auth, second, declined, reversed, debit]);
  const note = pliantCoverNote(DAY);
  assert.match(note, /Couverte par le débit du /);
  assert.match(note, new RegExp(formatDateFr(DAY).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(covers.get("auth-1")?.debitId, "debit-1");
  assert.equal(covers.get("auth-1")?.note, note);
  assert.equal(covers.get("auth-2")?.debitId, "debit-1");
  assert.equal(covers.has("declined-1"), false);
  assert.equal(covers.has("reversed-1"), false);
  assert.equal(covers.has("debit-1"), false);

  const lines = [
    { id: "auth-1", party: "TRANSAVIA", suggestions: [{ bookingId: DOSSIER, confidence: "haute" }] },
    { id: "auth-2", party: "TRANSAVIA", suggestions: [{ bookingId: DOSSIER, confidence: "basse" }] },
    { id: "debit-1", party: "TRANSAVIA", suggestions: [{ bookingId: DOSSIER, confidence: "haute" }] },
  ];
  const split = splitCoveredAuthorizations(lines, covers);
  assert.deepEqual(split.open.map((line) => line.id), ["debit-1"]);
  assert.equal(split.covered.length, 2);
  assert.equal(split.covered[0]?.suggestions.length, 0);
  assert.equal(split.covered[0]?.coveredNote, note);
  assert.equal(split.covered[1]?.coveredNote, note);
});

test("sans débit BOOKED, l’autorisation CONFIRMED reste à proposer", () => {
  const covers = coverPliantAuthorizations([
    spend({ id: "auth-1", status: "CONFIRMED" }),
    spend({ id: "declined-1", status: "DECLINED" }),
    spend({ id: "pending-1", status: "PENDING" }),
  ]);
  assert.equal(covers.size, 0);
});

test("le débit déjà rattaché sur une autre carte du même dossier couvre l’autorisation", () => {
  const covers = coverPliantAuthorizations([
    spend({ id: "auth-1", status: "CONFIRMED", cardId: CARD_A }),
    spend({ id: "debit-1", status: "BOOKED", cardId: CARD_B, bookingIds: [DOSSIER] }),
  ]);
  assert.equal(covers.get("auth-1")?.debitId, "debit-1");
});

test("la même carte suffit, même sans dossier connu", () => {
  const covers = coverPliantAuthorizations([
    spend({ id: "auth-1", status: "CONFIRMED", cardId: CARD_A, bookingIds: [] }),
    spend({ id: "debit-1", status: "BOOKED", cardId: CARD_A, bookingIds: [] }),
  ]);
  assert.equal(covers.get("auth-1")?.debitId, "debit-1");
});

test("un autre dossier, un autre montant, un autre commerçant ou une fenêtre trop large ne couvrent pas", () => {
  const auth = spend({ id: "auth-1", status: "CONFIRMED" });
  assert.equal(
    coverPliantAuthorizations([
      auth,
      spend({ id: "other-dossier", status: "BOOKED", cardId: CARD_B, bookingIds: ["tb-autre"] }),
    ]).size,
    0
  );
  assert.equal(
    coverPliantAuthorizations([auth, spend({ id: "other-amount", status: "BOOKED", billingCents: -239100 })]).size,
    0
  );
  assert.equal(
    coverPliantAuthorizations([auth, spend({ id: "other-merchant", status: "BOOKED", merchant: "AIR FRANCE" })]).size,
    0
  );
  assert.equal(
    coverPliantAuthorizations([
      spend({ id: "auth-1", status: "CONFIRMED", occurredOn: "2026-11-01" }),
      spend({ id: "late", status: "BOOKED", occurredOn: "2026-11-10" }),
    ]).size,
    0
  );
  const near = coverPliantAuthorizations([
    spend({ id: "auth-1", status: "CONFIRMED", occurredOn: "2026-11-03" }),
    spend({ id: "debit-1", status: "BOOKED", cardId: CARD_B, occurredOn: "2026-11-10" }),
  ]);
  assert.equal(near.get("auth-1")?.debitId, "debit-1");
});

test("un refus ou un remboursement ne tient pas lieu de débit", () => {
  assert.equal(
    coverPliantAuthorizations([
      spend({ id: "auth-1", status: "CONFIRMED" }),
      spend({ id: "no", status: "DECLINED" }),
      spend({ id: "back", status: "REVERSED" }),
      spend({ id: "refund", status: "BOOKED", type: "REFUND", billingCents: 239101 }),
    ]).size,
    0
  );
});

test("deux débits : le plus proche en date est cité", () => {
  const covers = coverPliantAuthorizations([
    spend({ id: "auth-1", status: "CONFIRMED", occurredOn: "2026-11-10" }),
    spend({ id: "far", status: "BOOKED", cardId: CARD_B, occurredOn: "2026-11-16" }),
    spend({ id: "near", status: "BOOKED", cardId: CARD_B, occurredOn: "2026-11-11" }),
  ]);
  assert.equal(covers.get("auth-1")?.debitId, "near");
  assert.match(covers.get("auth-1")?.note || "", /11 nov/);
});
