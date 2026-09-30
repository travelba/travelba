import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_MAIL_COPY, agencyCopyCc } from "./outbound-mail";

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
