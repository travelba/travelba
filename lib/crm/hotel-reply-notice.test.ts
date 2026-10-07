import assert from "node:assert/strict";
import test from "node:test";
import {
  hotelReplyHref,
  hotelReplyNotices,
  recentHotelReplies,
  replyExcerpt,
  shouldSyncHotelReplies,
  type HotelReplyNoticeRow,
} from "./hotel-reply-notice";
import { replyMoment } from "./hotel-reply-when";

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
  assert.equal(replyExcerpt("ciao@example.com\nLe lien est prêt."), "Le lien est prêt.");
  assert.equal(replyExcerpt("Le lien est prêt. Écrire à ciao@example.com"), "Le lien est prêt. Écrire à");
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

test("le moment de la réponse reste court", () => {
  const now = Date.parse("2026-10-02T10:04:00.000Z");
  assert.equal(replyMoment("2026-10-02T10:03:30.000Z", now), "À l’instant");
  assert.equal(replyMoment("2026-10-02T10:00:00.000Z", now), "Il y a 4 min");
  assert.equal(replyMoment("2026-10-02T08:04:00.000Z", now), "Il y a 2 h");
  assert.equal(replyMoment("pas une date", now), "");
});

test("les derniers retours suivent les courriers envoyés, du plus récent au plus ancien", () => {
  const lines = recentHotelReplies(
    [
      row({ id: "old", receivedAt: "2026-10-01T09:00:00.000Z", subject: "Re: Lien de paiement — Casa Monti" }),
      row({ id: "auto", countsAsReply: false, receivedAt: "2026-10-03T09:00:00.000Z", body: "Je suis absent du bureau." }),
      row({ id: "new", receivedAt: "2026-10-02T18:00:00.000Z", body: "contact@hotel.test a confirmé. " + "x".repeat(200) }),
    ],
    { [bookingId]: "TB-1042" },
    8
  );
  assert.deepEqual(
    lines.map((line) => line.id),
    ["new", "old"]
  );
  assert.equal(lines[0]?.reference, "TB-1042");
  assert.equal(lines[0]?.excerpt.includes("@"), false);
  assert.equal(lines[0]?.excerpt.length, 140);
  assert.equal(lines[1]?.subject, "Lien de paiement — Casa Monti");
  assert.equal(lines[1]?.href, `/admin/reservations/${bookingId}?hotel=${itemId}`);
});

test("la synchro légère attend deux minutes", () => {
  const now = Date.parse("2026-10-02T10:04:00.000Z");
  assert.equal(shouldSyncHotelReplies(null, now), true);
  assert.equal(shouldSyncHotelReplies(now - 119_000, now), false);
  assert.equal(shouldSyncHotelReplies(now - 120_000, now), true);
});
