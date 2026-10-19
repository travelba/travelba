import assert from "node:assert/strict";
import test from "node:test";
import { emptyPassportFieldPatch } from "./travel-document-write";

test("la fiche remplit naissance et sexe seulement s’ils manquent sur la pièce", () => {
  assert.deepEqual(
    emptyPassportFieldPatch(
      { birth_date: null, sex: null },
      { birth_date: "2008-02-23", sex: "F" }
    ),
    { birth_date: "2008-02-23", sex: "F" }
  );
  assert.equal(
    emptyPassportFieldPatch(
      { birth_date: "2008-02-23", sex: "F" },
      { birth_date: "1990-01-01", sex: "M" }
    ),
    null
  );
  assert.deepEqual(
    emptyPassportFieldPatch({ birth_date: "2008-02-23", sex: null }, { birth_date: "1990-01-01", sex: "F" }),
    { sex: "F" }
  );
  assert.equal(emptyPassportFieldPatch({ birth_date: null, sex: null }, { birth_date: "", sex: "Femme" }), null);
});
