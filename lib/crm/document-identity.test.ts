import assert from "node:assert/strict";
import test from "node:test";
import {
  documentHolderName,
  documentNameNotice,
  filledIdentity,
  identityFieldsFromForm,
  identityNationalityFromSources,
  nationalityFromIdentity,
  preselectDocumentTarget,
} from "./document-identity";

test("identity snapshot prefers the name stored on the document", () => {
  assert.equal(
    documentHolderName(
      { first_name: "Léa", last_name: "Martin", companion_id: "c1" },
      { first_name: "Benjamin", last_name: "Boukris" },
      [{ id: "c1", first_name: "Other", last_name: "Name" }]
    ),
    "Léa Martin"
  );
});

test("form identity drops invalid sex", () => {
  const form = new FormData();
  form.set("first_name", "Ada");
  form.set("sex", "Z");
  const fields = identityFieldsFromForm(form);
  assert.equal(fields.first_name, "Ada");
  assert.equal(fields.sex, null);
  assert.deepEqual(filledIdentity(fields), { first_name: "Ada" });
});

test("form identity maps passport nationality onto ISO2", () => {
  const form = new FormData();
  form.set("nationality", "Française");
  form.set("issuing_country", "France");
  const fields = identityFieldsFromForm(form);
  assert.equal(fields.nationality, "FR");
  assert.deepEqual(filledIdentity(fields), { nationality: "FR" });
});

test("identity nationality hydrates from the passport when the fiche is empty", () => {
  assert.equal(
    identityNationalityFromSources(null, [{ nationality: "Française", issuing_country: "FRA" }]),
    "FR"
  );
  assert.equal(identityNationalityFromSources("Marocaine"), "MA");
  assert.equal(nationalityFromIdentity({ nationality: null, issuing_country: "TN" }), "TN");
});

test("« Pour qui » suit le nom lu : compagnon, titulaire, inconnu", () => {
  const holder = { first_name: "Camille", last_name: "Morel" };
  const companions = [{ id: "c1", first_name: "Inès", last_name: "Morel" }];
  assert.deepEqual(
    preselectDocumentTarget({ first_name: "Ines", last_name: "MOREL" }, holder, companions),
    { companionId: "c1", applyIdentity: true, mismatch: null }
  );
  assert.deepEqual(
    preselectDocumentTarget({ first_name: "Camille Rose", last_name: "Morel" }, holder, companions),
    { companionId: "", applyIdentity: true, mismatch: null }
  );
  assert.deepEqual(
    preselectDocumentTarget({ first_name: "Noah", last_name: "Dupont" }, holder, companions),
    { companionId: "", applyIdentity: false, mismatch: "Noah Dupont" }
  );
});

test("sans nom lu ou sans nom de titulaire, « Moi » et le report restent par défaut", () => {
  const empty = { companionId: "", applyIdentity: true, mismatch: null };
  assert.deepEqual(
    preselectDocumentTarget({ first_name: null, last_name: null }, { first_name: "Camille", last_name: "Morel" }, []),
    empty
  );
  assert.deepEqual(preselectDocumentTarget(null, { first_name: "Camille", last_name: "Morel" }, []), empty);
  assert.deepEqual(
    preselectDocumentTarget({ first_name: "Noah", last_name: "Dupont" }, { first_name: "", last_name: "" }, []),
    empty
  );
});

test("l’avertissement dit ce qui va se passer selon la case « Reporter »", () => {
  const holder = { first_name: "Camille", last_name: "Morel" };
  const stranger = { first_name: "Noah", last_name: "Dupont" };
  assert.equal(
    documentNameNotice(stranger, holder, { applyIdentity: false, isHolder: true }),
    "Le nom lu (Noah Dupont) diffère du vôtre : la pièce sera ajoutée au coffre sans modifier votre profil."
  );
  assert.equal(
    documentNameNotice(stranger, { first_name: "Inès", last_name: "Morel" }, { applyIdentity: false, isHolder: false }),
    "Le nom lu (Noah Dupont) diffère de celui de Inès Morel : la pièce sera ajoutée au coffre sans modifier sa fiche."
  );
  assert.match(
    documentNameNotice(stranger, holder, { applyIdentity: true, isHolder: true }) || "",
    /Noah Dupont[\s\S]*Camille Morel[\s\S]*seront mis à jour/
  );
  assert.equal(documentNameNotice({ first_name: "Camille", last_name: "Morel" }, holder, { applyIdentity: true, isHolder: true }), null);
  assert.equal(
    documentNameNotice({ first_name: "Camille Rose", last_name: "Morel" }, holder, { applyIdentity: false, isHolder: true }),
    null
  );
  assert.equal(documentNameNotice(stranger, null, { applyIdentity: true, isHolder: true }), null);
});
