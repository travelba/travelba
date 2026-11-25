import assert from "node:assert/strict";
import test from "node:test";
import { estaWebhookBody } from "./esta";
import { ukEtaWebhookBody } from "./uk-eta";
import {
  authorizationAgencyAlert,
  authorizationAutoSendEnabled,
  authorizationClientText,
  decideAuthorizationFollowUp,
} from "./authorization-client-message";
import { planFreeMessage } from "./free-message-send";
import { freeMessageTemplateText } from "./free-message-copy";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;

function fresh(status: string, extra: Record<string, unknown> = {}) {
  return decideAuthorizationFollowUp({
    kind: "esta",
    status,
    validUntil: "2027-03-26",
    checkedAt: "2026-11-25T11:00:00Z",
    dispatchedAt: "2026-11-25T10:00:00Z",
    clientSentAt: null,
    now: NOW,
    autoSend: true,
    alreadyAlerted: false,
    ...extra,
  });
}

test("les trois messages client ne portent ni passeport ni numéro de dossier", () => {
  const texts = [
    authorizationClientText({ kind: "esta", status: "approuve", validUntil: "2027-03-26" }),
    authorizationClientText({ kind: "esta", status: "introuvable" }),
    authorizationClientText({ kind: "esta", status: "refuse" }),
  ];
  assert.match(texts[0], /Bonne nouvelle, votre ESTA est approuvée, valable jusqu’au 26\/03\/2027/);
  assert.match(texts[1], /avec quel passeport/);
  assert.match(texts[1], /L’agence peut vous aider/);
  assert.match(texts[2], /recontacte rapidement/);
  assert.match(texts[2], /demande de visa/);
  for (const text of texts) {
    assert.equal(PASSPORT.test(text), false);
    assert.equal(/application|no application found/i.test(text), false);
  }
  const missing = authorizationAgencyAlert({ kind: "esta", status: "introuvable" });
  const refused = authorizationAgencyAlert({ kind: "esta", status: "refuse" });
  assert.equal(missing.title, "ESTA introuvable");
  assert.equal(missing.priority, "normale");
  assert.equal(missing.kind, "question");
  assert.equal(refused.title, "ESTA refusée");
  assert.equal(refused.priority, "prioritaire");
  assert.equal(refused.kind, "urgent");
  assert.notEqual(missing.body, refused.body);
});

test("approuvé envoie, introuvable et refusé alertent, le silence n’écrit pas au client", () => {
  const approved = fresh("approuve");
  assert.match(approved.client || "", /26\/03\/2027/);
  assert.equal(approved.alert, null);

  const missing = fresh("introuvable");
  assert.match(missing.client || "", /quel passeport/);
  assert.equal(missing.alert?.title, "ESTA introuvable");
  assert.equal(missing.alert?.priority, "normale");

  const refused = fresh("refuse");
  assert.match(refused.client || "", /refusée/);
  assert.equal(refused.alert?.priority, "prioritaire");

  const silent = decideAuthorizationFollowUp({
    kind: "esta",
    status: "a_verifier",
    dispatchedAt: "2026-11-25T09:00:00Z",
    checkedAt: null,
    clientSentAt: null,
    now: NOW,
    autoSend: true,
    alreadyAlerted: false,
  });
  assert.equal(silent.client, null);
  assert.equal(silent.alert?.title, "ESTA sans résultat");

  const tooSoon = decideAuthorizationFollowUp({
    kind: "esta",
    status: "a_verifier",
    dispatchedAt: "2026-11-25T11:30:00Z",
    checkedAt: null,
    now: NOW,
    autoSend: true,
    alreadyAlerted: false,
  });
  assert.equal(tooSoon.alert, null);
});

test("l’envoi automatique est coupé par défaut, et un envoi déjà fait ne repart pas", () => {
  assert.equal(authorizationAutoSendEnabled(""), false);
  assert.equal(authorizationAutoSendEnabled("oui"), true);
  const off = fresh("approuve", { autoSend: false });
  assert.equal(off.client, null);
  const again = fresh("introuvable", { clientSentAt: "2026-11-25T11:30:00Z" });
  assert.equal(again.client, null);
  assert.equal(again.alert, null);
  const old = fresh("refuse", { checkedAt: "2026-11-20T11:00:00Z" });
  assert.equal(old.client, null);
  assert.equal(old.alert, null);
});

test("hors fenêtre de 24 h le texte passe par message_libre_texte", () => {
  const text = authorizationClientText({ kind: "esta", status: "approuve", validUntil: "2027-03-26" });
  const closed = planFreeMessage({ windowOpen: false, text, firstName: "Mickael", file: null });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  assert.equal(closed.plan.canal, "modele");
  assert.equal(closed.plan.modele, "message_libre_texte");
  const read = freeMessageTemplateText("Mickael", text);
  assert.match(read || "", /Bonjour Mickael/);
  assert.match(read || "", /Le Concierge/);
  assert.match(read || "", /26\/03\/2027/);
  const open = planFreeMessage({ windowOpen: true, text, firstName: "Mickael", file: null });
  assert.equal(open.ok && open.plan.canal, "session");
});

test("le concierge réutilise le webhook du bouton, sans nouveau contrat", () => {
  const esta = estaWebhookBody({
    id: "check-1",
    bookingId: "booking-1",
    travelerId: "traveler-1",
    departureDate: "2026-12-01",
  });
  const eta = ukEtaWebhookBody({
    id: "check-2",
    bookingId: "booking-1",
    travelerId: "traveler-1",
    departureDate: "2026-12-01",
  });
  assert.deepEqual(esta, {
    id: "check-1",
    booking_id: "booking-1",
    traveler_id: "traveler-1",
    departure_date: "2026-12-01",
    kind: "esta",
  });
  assert.equal(eta.kind, "uk_eta");
  assert.equal("request_id" in esta, false);
  assert.equal("check_type" in esta, false);
});
