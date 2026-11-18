import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { classifyHotelMail } from "./hotel-desk";
import { unfoldMail } from "./nested-mail";
import {
  keepHotelThreadLink,
  shouldReadNestedMail,
  textOfNestedMail,
  withReplyWindow,
} from "./hotel-thread-link";

const SUBJECT = "Lien de paiement — SO Sotogrande — CJHPJBRBRK";
const PAY = "https://secure.hotel.test/pay/stay-210";
const BODY_PAY = "https://secure.hotel.test/authorizations/stay-1";

function confirmationEml(url: string) {
  return [
    "From: Reservations <stay@so-sotogrande.test>",
    "To: contact@travelba.fr",
    "Subject: Confirmation of your request",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "<p>Your request is confirmed.</p>",
    `<p><a href=3D"${url}">Pay now</a></p>`,
    "",
  ].join("\n");
}

function reply(body: string, nestedText = "") {
  return classifyHotelMail({
    from: "Reservations <stay@so-sotogrande.test>",
    subject: `Re: ${SUBJECT}`,
    body,
    keys: [SUBJECT],
    nestedText,
  });
}

test("le lien seulement dans un .eml joint est enregistré", () => {
  const eml = confirmationEml(PAY);
  assert.equal(unfoldMail(eml).texts.join("\n").includes(PAY), false);
  const nested = textOfNestedMail(eml);
  assert.match(nested, new RegExp(PAY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const classified = reply("Merci de trouver la confirmation en pièce jointe.", nested);
  assert.equal(classified.keep, true);
  assert.equal(classified.countsAsReply, true);
  assert.equal(classified.link, PAY);
  assert.equal(classified.body.includes(PAY), false);
});

test("le lien du corps reste prioritaire sur celui du .eml", () => {
  const nested = textOfNestedMail(confirmationEml("https://pay.other.test/invoice/9"));
  const classified = reply(`Voici le lien ${BODY_PAY}`, nested);
  assert.equal(classified.link, BODY_PAY);
  assert.equal(keepHotelThreadLink(classified.link, "https://secure.hotel.test/pay/ancien"), BODY_PAY);
  assert.equal(keepHotelThreadLink(null, "https://secure.hotel.test/pay/ancien"), "https://secure.hotel.test/pay/ancien");
});

test("un message antérieur au premier envoi ne compte pas comme réponse", () => {
  const sent = "2026-11-17T16:09:00.000Z";
  const rows = withReplyWindow([
    { direction: "in", receivedAt: "2026-11-17T11:04:00.000Z", countsAsReply: true },
    { direction: "out", receivedAt: sent, countsAsReply: false },
    { direction: "in", receivedAt: "2026-11-17T17:55:00.000Z", countsAsReply: true },
    { direction: "in", receivedAt: sent, countsAsReply: true },
  ]);
  assert.equal(rows[0]?.countsAsReply, false);
  assert.equal(rows[1]?.countsAsReply, false);
  assert.equal(rows[2]?.countsAsReply, true);
  assert.equal(rows[3]?.countsAsReply, true);
  const storedSend = withReplyWindow(
    [
      { direction: "in", receivedAt: "2026-11-17T11:04:00.000Z", countsAsReply: true },
      { direction: "in", receivedAt: "2026-11-17T17:55:00.000Z", countsAsReply: true },
    ],
    sent
  );
  assert.equal(storedSend[0]?.countsAsReply, false);
  assert.equal(storedSend[1]?.countsAsReply, true);
});

test("un fil déjà synchronisé sans lien relit le .eml, sans second message", () => {
  const from = "stay@so-sotogrande.test";
  const body = "Merci de trouver la confirmation en pièce jointe.";
  assert.equal(shouldReadNestedMail({ from, body, storedLink: null, hasNested: true }), true);
  assert.equal(shouldReadNestedMail({ from, body, storedLink: "", hasNested: true }), true);
  assert.equal(shouldReadNestedMail({ from, body, storedLink: PAY, hasNested: true }), false);
  assert.equal(shouldReadNestedMail({ from, body: `Lien ${BODY_PAY}`, storedLink: null, hasNested: true }), false);
  assert.equal(shouldReadNestedMail({ from: "contact@travelba.fr", body, storedLink: null, hasNested: true }), false);
  assert.equal(shouldReadNestedMail({ from, body, storedLink: null, hasNested: false }), false);
  const src = readFileSync(join(process.cwd(), "lib/crm/hotel-desk-run.ts"), "utf8");
  const store = src.slice(src.indexOf("async function storeThreadHits"), src.indexOf("async function clearPrematureReplies"));
  assert.match(store, /onConflict: "gmail_message_id"/);
  assert.equal(store.includes(".insert("), false);
  assert.match(store, /keepHotelThreadLink/);
  assert.match(store, /withReplyWindow/);
  assert.match(src, /textOfNestedMail/);
  assert.match(src, /shouldReadNestedMail/);
  assert.match(src, /clearPrematureReplies/);
  assert.match(src, /inlineMails/);
  assert.match(src, /isNestedMailFile/);
});
