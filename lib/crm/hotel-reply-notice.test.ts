import assert from "node:assert/strict";
import test from "node:test";
import {
  hotelReplyHref,
  hotelReplyNotices,
  replyExcerpt,
  shouldSyncHotelReplies,
  visibleReplyNotices,
  type HotelReplyNoticeRow,
} from "./hotel-reply-notice";

const bookingId = "395e74b3-0625-4174-a848-6596cae041db";
const itemId = "581854df-d308-4cab-8eed-9568269a360b";
const since = "2026-10-02T10:00:00.000Z";

function row(patch: Partial<HotelReplyNoticeRow> = {}): HotelReplyNoticeRow {
  return {
    id: "reply-1",
    bookingId,
    itemId,
    body: "Voici le lien d’autorisation pour le séjour.",
    receivedAt: "2026-10-02T10:05:00.000Z",
    countsAsReply: true,
    hotelName: "Casa Monti",
    title: "Suite",
    ...patch,
  };
}

test("une vraie réponse devient une notification vers le bon dossier", () => {
  const [notice] = hotelReplyNotices([row()], since);
  assert.equal(notice?.hotel, "Casa Monti");
  assert.equal(notice?.excerpt, "Voici le lien d’autorisation pour le séjour.");
  assert.equal(notice?.href, hotelReplyHref(bookingId, itemId));
  assert.equal(notice?.href, `/admin/reservations/${bookingId}?hotel=${itemId}`);
});

test("une absence ne crée pas de notification", () => {
  const notices = hotelReplyNotices(
    [row({ countsAsReply: false, body: "Je suis absent du bureau jusqu’au lundi." })],
    since
  );
  assert.deepEqual(notices, []);
});

test("une réponse déjà vue ne revient pas", () => {
  const notices = hotelReplyNotices(
    [
      row({ id: "old", receivedAt: since }),
      row({ id: "older", receivedAt: "2026-10-02T09:00:00.000Z" }),
    ],
    since
  );
  assert.deepEqual(notices, []);
});

test("sans curseur valide, aucune réponse ancienne n’est rejouée", () => {
  assert.deepEqual(hotelReplyNotices([row()], ""), []);
  assert.deepEqual(hotelReplyNotices([row()], "pas une date"), []);
  assert.deepEqual(hotelReplyNotices([row()], null), []);
});

test("l’extrait garde la première ligne, sans e-mail ni numéro de carte", () => {
  assert.equal(replyExcerpt("ciao@casamontiroma.com\nLe lien est prêt."), "Le lien est prêt.");
  assert.equal(replyExcerpt("Le lien est prêt. Écrire à ciao@casamontiroma.com"), "Le lien est prêt. Écrire à");
  const card = replyExcerpt("Le règlement est ouvert.\n4111 1111 1111 1111");
  assert.equal(card.includes("4111"), false);
  assert.equal(card, "Le règlement est ouvert.");
  assert.equal(replyExcerpt("   "), "L'hôtel a répondu.");
  assert.equal(replyExcerpt("a".repeat(200)).length, 140);
});

test("le nom vient de l’hôtel, puis du titre", () => {
  assert.equal(hotelReplyNotices([row({ hotelName: "  " })], since)[0]?.hotel, "Suite");
  assert.equal(hotelReplyNotices([row({ hotelName: "", title: "" })], since)[0]?.hotel, "Hôtel");
});

test("quatre notifications visibles, les suivantes attendent", () => {
  const queue = ["a", "b", "c", "d", "e"];
  assert.deepEqual(visibleReplyNotices(queue), ["a", "b", "c", "d"]);
  assert.deepEqual(visibleReplyNotices(queue.slice(1)), ["b", "c", "d", "e"]);
});

test("la synchro légère attend deux minutes", () => {
  const now = Date.parse("2026-10-02T10:04:00.000Z");
  assert.equal(shouldSyncHotelReplies(null, now), true);
  assert.equal(shouldSyncHotelReplies(now - 119_000, now), false);
  assert.equal(shouldSyncHotelReplies(now - 120_000, now), true);
});
