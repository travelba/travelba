import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_MASTER_CODE_HASH, acceptableStaffCardCode, hashStaffCardCode, staffCardCodeMatches, staffCodeDecision } from "./staff-card-code";
import { agencyCardObjectPath, agencyCardSiblingPaths, isAgencyCardPath } from "./files-access";

test("le code maître est une empreinte, pas le code", () => {
  assert.equal(acceptableStaffCardCode("123"), false);
  assert.equal(acceptableStaffCardCode("4821"), true);
  const stored = hashStaffCardCode("4821");
  assert.equal(stored.includes("4821"), false);
  assert.equal(staffCardCodeMatches("4821", stored), true);
  assert.equal(staffCardCodeMatches("4822", stored), false);
  assert.equal(staffCardCodeMatches("4821", null), false);
});

test("la photo de carte ne passe pas par le lien de fichier", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const path = agencyCardObjectPath(id, id, "image/jpeg");
  assert.equal(path, `agency-cards/${id}/${id}/carte.jpg`);
  assert.equal(isAgencyCardPath(path), true);
  assert.equal(agencyCardObjectPath("dossier", id, "image/jpeg"), "");
  assert.equal(agencyCardObjectPath(id, id, "text/plain"), "");
  assert.deepEqual(agencyCardSiblingPaths(path), [
    `agency-cards/${id}/${id}/carte.png`,
    `agency-cards/${id}/${id}/carte.webp`,
    `agency-cards/${id}/${id}/carte.pdf`,
  ]);
  assert.equal(isAgencyCardPath("bookings/abc/passeport.pdf"), false);
});

test("le code maître agence est une empreinte", () => {
  assert.equal(AGENCY_MASTER_CODE_HASH.startsWith("scrypt$"), true);
  assert.equal(AGENCY_MASTER_CODE_HASH.toLowerCase().includes("travel"), false);
  assert.equal(staffCardCodeMatches("0000", AGENCY_MASTER_CODE_HASH), false);
  assert.equal(staffCardCodeMatches("", AGENCY_MASTER_CODE_HASH), false);
});

test("un code inconnu ne s'ouvre pas, un premier code s'enregistre", () => {
  const stored = hashStaffCardCode("4815");
  assert.equal(staffCodeDecision(null, "12", true), "missing");
  assert.equal(staffCodeDecision(null, "4815", false), "missing");
  assert.equal(staffCodeDecision(null, "4815", true), "set");
  assert.equal(staffCodeDecision(stored, "4815", false), "ok");
  assert.equal(staffCodeDecision(stored, "0000", true), "wrong");
});
