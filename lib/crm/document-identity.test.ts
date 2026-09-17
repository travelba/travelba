import assert from "node:assert/strict";
import test from "node:test";
import {
  documentHolderName,
  filledIdentity,
  identityFieldsFromForm,
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
