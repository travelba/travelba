import assert from "node:assert/strict";
import test from "node:test";
import { emailDepositedFilesOnly, treatedEmailGate } from "./email-reattach";

const SOURCE = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";

test("un mail encore dans la file se dépose sans repartir", () => {
  const gate = treatedEmailGate("matched", null, TARGET, false);
  assert.equal("error" in gate, false);
  if ("error" in gate) return;
  assert.equal(gate.repartir, false);
});

test("un mail déjà traité est refusé sans l’option, et accepté vers un autre dossier", () => {
  const refused = treatedEmailGate("attached", SOURCE, TARGET, false);
  assert.equal("error" in refused && refused.error.includes("déjà traité"), true);
  const same = treatedEmailGate("attached", SOURCE, SOURCE, true);
  assert.equal("error" in same && same.error.includes("autre dossier"), true);
  const ignored = treatedEmailGate("ignored", SOURCE, TARGET, true);
  assert.equal("error" in ignored && ignored.error.includes("déjà traité"), true);
  const again = treatedEmailGate("attached", SOURCE, TARGET, true);
  assert.equal("error" in again, false);
  if ("error" in again || !again.repartir) {
    assert.fail("repartir attendu");
    return;
  }
  assert.equal(again.conserver, SOURCE);
});

test("un dépôt de pièces seules, ou forcer, rejoue le même dossier", () => {
  assert.equal(emailDepositedFilesOnly(["suggest", "attach_files"]), true);
  assert.equal(emailDepositedFilesOnly(["attach_files", "auto_attach"]), false);
  assert.equal(emailDepositedFilesOnly(["auto_attach"]), false);
  const files = treatedEmailGate("attached", SOURCE, SOURCE, false, { piecesSeules: true });
  assert.equal("rejouer" in files && files.rejouer, true);
  assert.equal("repartir" in files && files.repartir, false);
  const forced = treatedEmailGate("attached", SOURCE, SOURCE, false, { forcer: true });
  assert.equal("rejouer" in forced && forced.rejouer, true);
  const refused = treatedEmailGate("attached", SOURCE, SOURCE, false);
  assert.equal("error" in refused, true);
});
