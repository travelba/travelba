import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENCY_COPY,
  AUTOMATIC_MAIL,
  NOT_A_CRM_REPLY,
  decideInboundMail,
  emptySentMailIndex,
  isReplySubject,
  matchesCrmReply,
  normalizeRfcMessageId,
  rfcIdsInHeader,
} from "./email-reply-gate";
import { hotelMailSubjectKey } from "./hotel-desk";

const SUBJECT = "Samuel Chocron - Transfer - Sofitel Agadir";

function sentWithSubject() {
  const sent = emptySentMailIndex();
  sent.subjectKeys.add(hotelMailSubjectKey(SUBJECT));
  sent.rfcIds.add("crm-1@travelba.fr");
  sent.threadIds.add("thread-1");
  return sent;
}

test("la boîte ouverte ne garde qu’une réponse à un envoi du CRM", () => {
  const sent = sentWithSubject();
  assert.equal(decideInboundMail({ label: "little-emperors", subject: "Newsletter", from: "news@example.com" }, sent).action, "queue");
  assert.deepEqual(
    decideInboundMail(
      { label: "reservations-tba", subject: "What kind of skier is your client?", from: "news@example.com" },
      sent
    ),
    { action: "ignore", reason: NOT_A_CRM_REPLY }
  );
  assert.equal(
    decideInboundMail({ label: "crm", subject: `Re: ${SUBJECT}`, from: "hotel@sofitel.com" }, sent).action,
    "queue"
  );
  assert.equal(
    decideInboundMail({ label: "Reservations TBA", subject: `Fw: ${SUBJECT}`, from: "hotel@sofitel.com" }, sent).action,
    "ignore"
  );
  assert.deepEqual(
    decideInboundMail({ label: "crm", subject: `Re: ${SUBJECT}`, from: "Travelba <contact@travelba.fr>" }, sent),
    { action: "record-sent", reason: AGENCY_COPY }
  );
  assert.deepEqual(
    decideInboundMail(
      { label: "reservations-tba", subject: "Re: autre", from: "mailer-daemon@google.com", autoSubmitted: true },
      sent
    ),
    { action: "ignore", reason: AUTOMATIC_MAIL }
  );
});

test("un identifiant ou un fil connu compte comme une réponse", () => {
  const sent = sentWithSubject();
  assert.equal(normalizeRfcMessageId(" <CRM-1@travelba.fr> "), "crm-1@travelba.fr");
  assert.deepEqual(rfcIdsInHeader("<crm-1@travelba.fr> <autre@hotel.com>"), ["crm-1@travelba.fr", "autre@hotel.com"]);
  assert.equal(matchesCrmReply({ inReplyTo: "<crm-1@travelba.fr>", subject: "sans objet" }, sent), true);
  assert.equal(matchesCrmReply({ threadId: "thread-1", subject: "sans objet" }, sent), true);
  assert.equal(isReplySubject("Re: Bonjour"), true);
  assert.equal(isReplySubject("R: Bonjour"), true);
  assert.equal(isReplySubject("AW: Bonjour"), true);
  assert.equal(isReplySubject("Fw: Bonjour"), false);
  assert.equal(isReplySubject("Tr: Bonjour"), false);
  assert.equal(matchesCrmReply({ subject: SUBJECT }, sent), false);
});
