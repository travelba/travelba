import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_MAIL_COPY, accessNoticeCopy, agencyCopyCc, tokenMailCc } from "./outbound-mail";

test("chaque envoi CRM met contact@travelba.fr en copie", () => {
  assert.equal(AGENCY_MAIL_COPY, "contact@travelba.fr");
  assert.deepEqual(agencyCopyCc(["client@example.com"]), ["contact@travelba.fr"]);
});

test("la copie n’est pas répétée si l’agence est déjà destinataire", () => {
  assert.equal(agencyCopyCc("contact@travelba.fr"), undefined);
  assert.equal(agencyCopyCc(["Contact@Travelba.fr"], []), undefined);
  assert.deepEqual(agencyCopyCc("hotel@example.com", "Travelba <contact@travelba.fr>"), [
    "Travelba <contact@travelba.fr>",
  ]);
  assert.equal(agencyCopyCc("hotel@example.com", undefined, "contact@travelba.fr"), undefined);
});

test("une copie déjà prévue est conservée", () => {
  assert.deepEqual(agencyCopyCc("client@example.com", "collegue@example.com"), [
    "collegue@example.com",
    "contact@travelba.fr",
  ]);
});

test("un e-mail porteur de jeton ne met jamais l’agence en copie", () => {
  assert.equal(tokenMailCc(), undefined);
  assert.equal(tokenMailCc("contact@travelba.fr"), undefined);
  assert.equal(tokenMailCc(["Travelba <contact@travelba.fr>"]), undefined);
  assert.deepEqual(tokenMailCc(["collegue@example.com", "contact@travelba.fr"]), ["collegue@example.com"]);
});

test("l’agence reçoit un avis d’invitation sans le lien", () => {
  const client = accessNoticeCopy({ kind: "client", firstName: "Marie" });
  assert.equal(client.subject, "Invitation envoyée à Marie");
  assert.equal(client.body.includes("/e/"), false);
  assert.match(client.body, /espace voyageur/);
  const colleague = accessNoticeCopy({ kind: "collegue", firstName: "" });
  assert.equal(colleague.subject, "Invitation envoyée à un collègue");
  assert.match(colleague.body, /espace agence/);
});

