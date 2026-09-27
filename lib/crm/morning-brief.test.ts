import assert from "node:assert/strict";
import test from "node:test";
import { morningBriefLine } from "./morning-brief";

test("le brief du matin tient sur une ligne", () => {
  assert.equal(
    morningBriefLine({ unmatched: 2, formalities: 1, departTomorrow: 1, departWeek: 4 }),
    "2 virements à rapprocher · 1 formalité ouverte · 1 départ demain · 4 départs sous 7 jours"
  );
  assert.equal(
    morningBriefLine({ unmatched: 0, formalities: 0, departTomorrow: 0, departWeek: 0 }),
    null
  );
});
