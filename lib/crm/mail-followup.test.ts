import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnansweredMails } from "../../components/admin/UnansweredMails";
import { hotelMailSubjectKey } from "./hotel-desk";
import {
  UNANSWERED_AFTER_MS,
  followUpBody,
  followUpCountLabel,
  followUpExcerpt,
  followUpHref,
  followUpMarks,
  isUnanswered,
} from "./mail-followup";

const SENT = Date.parse("2026-10-20T08:00:00.000Z");

test("la relance cite le message, sans carte ni signature", () => {
  const body = followUpBody({
    body: "Bonjour,\n\nPourriez-vous confirmer la chambre ?\nCarte 4242 4242 4242 4242\n\nBien à vous,\n\nTravel Business Agency",
    sentAt: "2026-10-20T08:00:00.000Z",
  });
  assert.match(body, /Nous nous permettons de revenir vers vous/);
  assert.match(body, /20 oct\. 2026/);
  assert.match(body, /« Bonjour, Pourriez-vous confirmer la chambre \? »/);
  assert.equal(body.includes("4242"), false);
  assert.equal(body.includes("Carte"), false);
  assert.match(body, /Bien à vous,\n\nTravel Business Agency$/);
  assert.equal(followUpExcerpt(""), "");
});

test("sans réponse après 48 h, pas avant, pas si l’hôtel a répondu", () => {
  const base = { status: "sent", sentAt: "2026-10-20T08:00:00.000Z", hasReply: false };
  assert.equal(isUnanswered({ ...base, nowMs: SENT + UNANSWERED_AFTER_MS - 1 }), false);
  assert.equal(isUnanswered({ ...base, nowMs: SENT + UNANSWERED_AFTER_MS }), true);
  assert.equal(isUnanswered({ ...base, hasReply: true, nowMs: SENT + UNANSWERED_AFTER_MS }), false);
  assert.equal(isUnanswered({ ...base, status: "draft", nowMs: SENT + UNANSWERED_AFTER_MS }), false);
  assert.equal(
    isUnanswered({
      status: "follow_up",
      sentAt: "2026-10-01T08:00:00.000Z",
      lastFollowUpAt: "2026-10-24T08:00:00.000Z",
      hasReply: false,
      nowMs: Date.parse("2026-10-25T08:00:00.000Z"),
    }),
    false
  );
});

test("le compteur et le lien de relance", () => {
  assert.equal(followUpCountLabel(0), null);
  assert.equal(followUpCountLabel(1), "1 relance");
  assert.equal(followUpCountLabel(2), "2 relances");
  assert.equal(
    followUpHref("booking-1", "item-1", "req-1"),
    "/admin/reservations/booking-1?hotel=item-1&relance=req-1"
  );
});

test("la page des e-mails montre Relancer sans l’envoyer", () => {
  const html = renderToStaticMarkup(
    createElement(UnansweredMails, {
      rows: [
        {
          id: "req-1",
          href: "/admin/reservations/booking-1?hotel=item-1&relance=req-1",
          title: "Le Bristol · TBA-1",
          subject: "Lien de paiement — Le Bristol",
          kind: "Lien de paiement",
          sentAt: "2026-10-20T08:00:00.000Z",
          followUps: 2,
        },
      ],
    })
  );
  assert.match(html, /Sans réponse/);
  assert.match(html, /Relancer/);
  assert.match(html, /2 relances/);
  assert.match(html, /href="\/admin\/reservations\/booking-1\?hotel=item-1&amp;relance=req-1"/);
  assert.equal(html.includes("action"), false);
});

test("une absence ne ferme pas le fil, une réponse oui", () => {
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  const key = hotelMailSubjectKey("Lien de paiement — Le Bristol — HB-9");
  const open = followUpMarks(
    [
      { id: "out-1", at: "2026-10-20T08:00:00.000Z", direction: "out", subjectKey: key, countsAsReply: false },
      { id: "away", at: "2026-10-21T08:00:00.000Z", direction: "in", subjectKey: key, countsAsReply: false },
      { id: "out-2", at: "2026-10-22T08:00:00.000Z", direction: "out", subjectKey: key, countsAsReply: false },
    ],
    now
  );
  assert.equal(open.get("out-1"), undefined);
  assert.equal(open.get("out-2")?.followUps, 1);
  assert.equal(open.get("out-2")?.unanswered, true);

  const closed = followUpMarks(
    [
      { id: "out-1", at: "2026-10-20T08:00:00.000Z", direction: "out", subjectKey: key, countsAsReply: false },
      { id: "in-1", at: "2026-10-21T08:00:00.000Z", direction: "in", subjectKey: key, countsAsReply: true },
    ],
    now
  );
  assert.equal(closed.size, 0);
});
