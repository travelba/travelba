import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  emptySentMailIndex,
  isReplySubject,
  matchesCrmReply,
  normalizeRfcMessageId,
  rfcIdsInHeader,
  shouldNotifyInboundMail,
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

test("la notification ne part que pour une réponse à un envoi du CRM", () => {
  const sent = sentWithSubject();
  const newsletter = {
    label: "reservations-tba",
    subject: "What kind of skier is your client?",
    from: "news@example.com",
  };
  assert.equal(shouldNotifyInboundMail(newsletter, sent), false);
  assert.equal(
    shouldNotifyInboundMail({ label: "little-emperors", subject: "Confirmation", from: "res@little-emperors.com" }, sent),
    false
  );
  assert.equal(
    shouldNotifyInboundMail({ label: "crm", subject: `Re: ${SUBJECT}`, from: "hotel@sofitel.com" }, sent),
    true
  );
  assert.equal(
    shouldNotifyInboundMail({ label: "reservations-tba", subject: `Fw: ${SUBJECT}`, from: "hotel@sofitel.com" }, sent),
    false
  );
  assert.equal(
    shouldNotifyInboundMail({ label: "crm", subject: `Re: ${SUBJECT}`, from: "Travelba <contact@travelba.fr>" }, sent),
    false
  );
  assert.equal(
    shouldNotifyInboundMail(
      { label: "reservations-tba", subject: "Re: autre", from: "mailer-daemon@google.com", autoSubmitted: true },
      sent
    ),
    false
  );
  assert.equal(
    shouldNotifyInboundMail(
      { label: "little-emperors", subject: "Confirmation", from: "hotel@sofitel.com", threadId: "thread-1" },
      sent
    ),
    true
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

test("la file garde le mail, seule la notification filtre", () => {
  const ingest = readFileSync(new URL("./email-ingest.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/admin/hotel-replies/route.ts", import.meta.url), "utf8");
  assert.match(ingest, /shouldNotifyInboundMail/);
  assert.match(ingest, /crm_reply: crmReply/);
  assert.equal(ingest.includes("decideInboundMail"), false);
  assert.equal(ingest.includes("status: \"ignored\""), true);
  const capture = ingest.slice(ingest.indexOf("export async function captureGmailHistory"), ingest.indexOf("export async function catchUpGmailHistory"));
  assert.equal(capture.includes("ignored"), false);
  assert.match(route, /crm_reply/);
  assert.match(route, /shouldNotifyInboundMail/);
});
