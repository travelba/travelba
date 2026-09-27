import assert from "node:assert/strict";
import test from "node:test";
import { customerPatchFromBody } from "./customer-patch";
import {
  CUSTOMER_EMAIL_COPY,
  customerEmailError,
  normalizeCustomerEmail,
  otherCustomerEmailBlock,
} from "./customer-email";

test("e-mail client : normalise et refuse une adresse invalide", () => {
  assert.equal(normalizeCustomerEmail("  Ada@Exemple.fr "), "ada@exemple.fr");
  assert.equal(customerEmailError("ada@exemple.fr"), null);
  assert.equal(customerEmailError(""), CUSTOMER_EMAIL_COPY.invalid);
  assert.equal(customerEmailError("pas-une-adresse"), CUSTOMER_EMAIL_COPY.invalid);
});

test("fiche client : l’e-mail est enregistré seulement s’il est valide", () => {
  const refused = customerPatchFromBody({ email: "pas-une-adresse" }, { allowEmail: true });
  assert.equal(refused.error, CUSTOMER_EMAIL_COPY.invalid);
  const saved = customerPatchFromBody({ email: "Ada@Exemple.fr" }, { allowEmail: true });
  assert.equal(saved.error, undefined);
  assert.equal(saved.patch.email, "ada@exemple.fr");
  const client = customerPatchFromBody({ email: "ada@exemple.fr" });
  assert.equal("email" in client.patch, false);
});

test("e-mail client : refuse une adresse déjà prise par un autre client", () => {
  assert.equal(
    otherCustomerEmailBlock({
      customerId: "c1",
      matches: [{ id: "c1" }],
    }),
    null
  );
  assert.equal(
    otherCustomerEmailBlock({
      customerId: "c1",
      matches: [{ id: "c2" }],
    }),
    CUSTOMER_EMAIL_COPY.taken
  );
});
