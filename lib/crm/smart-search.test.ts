import assert from "node:assert/strict";
import test from "node:test";
import { smartSearchMatch } from "./smart-search";

const LAMEGO = "TB-2026-0042 Lamego Portugal Alexandre Berriche 27 mars 2027";
const AVORIAZ = "TB-2026-0028 Avoriaz Simon Iony Albilila 20 mars 2027";
const TEL_AVIV = "TB-2026-0033 Paris Tel Aviv Simon Iony Albilila 14 déc. 2026";

test("les lettres filtrent dès les premières frappes", () => {
  assert.equal(smartSearchMatch("", LAMEGO), true);
  assert.equal(smartSearchMatch("   ", LAMEGO), true);
  assert.equal(smartSearchMatch("lam", LAMEGO), true);
  assert.equal(smartSearchMatch("por", LAMEGO), true);
  assert.equal(smartSearchMatch("ber", LAMEGO), true);
  assert.equal(smartSearchMatch("0042", LAMEGO), true);
  assert.equal(smartSearchMatch("42", LAMEGO), true);
  assert.equal(smartSearchMatch("tb-2026", LAMEGO), true);
  assert.equal(smartSearchMatch("tb2026", AVORIAZ), true);
  assert.equal(smartSearchMatch("a", AVORIAZ), true);
  assert.equal(smartSearchMatch("a", "Madrid"), false);
});

test("un mot proche retrouve le dossier, pas une autre ville", () => {
  assert.equal(smartSearchMatch("lamega", LAMEGO), true);
  assert.equal(smartSearchMatch("lamego", "Lamégo"), true);
  assert.equal(smartSearchMatch("avorias", AVORIAZ), true);
  assert.equal(smartSearchMatch("smion", AVORIAZ), true);
  assert.equal(smartSearchMatch("madrdi", "Madrid"), true);
  assert.equal(smartSearchMatch("porto", "Portugal"), true);
  assert.equal(smartSearchMatch("rome", "Roma"), true);
  assert.equal(smartSearchMatch("milan", "Milano"), true);
  assert.equal(smartSearchMatch("nice", "Nîmes"), false);
  assert.equal(smartSearchMatch("paris", "Madrid"), false);
});

test("les mots collés et l’ordre des mots comptent ensemble", () => {
  assert.equal(smartSearchMatch("telaviv", TEL_AVIV), true);
  assert.equal(smartSearchMatch("tel avi", TEL_AVIV), true);
  assert.equal(smartSearchMatch("simon avoriaz", AVORIAZ), true);
  assert.equal(smartSearchMatch("simon lamego", AVORIAZ), false);
  assert.equal(smartSearchMatch("berriche portugal", LAMEGO), true);
  assert.equal(smartSearchMatch("berriche 42", LAMEGO), true);
});
