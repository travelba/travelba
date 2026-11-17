import assert from "node:assert/strict";
import test from "node:test";
import { treatedEmailGate } from "./email-reattach";

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
