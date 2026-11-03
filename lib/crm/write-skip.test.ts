import assert from "node:assert/strict";
import test from "node:test";
import { sameStoredReply, threadStampDue, THREAD_STAMP_WINDOW_MS } from "./hotel-desk";
import { revolutInboxMatches } from "./revolut-inbox";

test("un fil relu il y a peu n’est pas réécrit", () => {
  const now = Date.parse("2026-11-03T12:00:00.000Z");
  assert.equal(threadStampDue(null, now), true);
  assert.equal(threadStampDue(new Date(now - 60_000).toISOString(), now), false);
  assert.equal(threadStampDue(new Date(now - THREAD_STAMP_WINDOW_MS).toISOString(), now), true);
});

test("une réponse déjà enregistrée ne change pas la ligne", () => {
  const row = {
    status: "replied",
    replied_at: "2026-11-03T10:00:00.000Z",
    reply_from: "hotel@example.com",
    reply_subject: "Re: séjour",
    reply_body: "Confirmé",
    reply_message_id: "m1",
  };
  assert.equal(sameStoredReply(row, { ...row, replied_at: "2026-11-03T10:00:00+00:00" }), true);
  assert.equal(sameStoredReply(row, { ...row, reply_body: "Autre texte" }), false);
});

test("un mouvement Revolut inchangé n’est pas mis à jour", () => {
  const update = {
    amount: 1200,
    currency: "EUR",
    direction: "credit",
    counterparty_name: "DUPONT",
    counterparty_iban: "FR76",
    reference: "SEJOUR",
    booked_at: "2026-11-01T08:00:00.000Z",
  };
  assert.equal(
    revolutInboxMatches(
      { ...update, amount: "1200", booked_at: "2026-11-01T08:00:00+00:00" },
      update
    ),
    true
  );
  assert.equal(revolutInboxMatches({ ...update, amount: "1200.5" }, update), false);
});
