import assert from "node:assert/strict";
import test from "node:test";
import {
  billingCompanyInsertFromTraveler,
  bookingsToRebill,
  travelerAttachPatch,
} from "./billing-company";
import { canOpenBillingCompany, isCompanyWallet, travelerRoleAfterAttach } from "./company-role";

const jeremy = {
  company_name: "OZB OPTIQUE",
  siret: "12345678901234",
  vat_number: "FR123",
  billing_email: "compta@exemple.fr",
  billing_address_line: "10 rue Test",
  billing_postal_code: "75008",
  billing_city: "Paris",
  billing_country: "FR",
};

test("Cyril becomes the OZB wallet; Jérémy is attached as member", () => {
  const created = billingCompanyInsertFromTraveler(jeremy, {
    first_name: "Cyril",
    last_name: "Zeitoun",
    email: "cyril@exemple.fr",
  });
  assert.equal("error" in created, false);
  if ("error" in created) return;
  assert.equal(created.row.company_role, "admin");
  assert.equal(created.row.company_name, "OZB OPTIQUE");
  assert.equal(created.row.siret, "12345678901234");
  assert.equal(created.row.email, "cyril@exemple.fr");
  assert.equal(created.row.billing_parent_id, null);

  const attach = travelerAttachPatch("ozb-id", null);
  assert.equal(attach.billing_parent_id, "ozb-id");
  assert.equal(attach.company_role, "member");
  assert.equal(travelerRoleAfterAttach("admin"), "admin");
});

test("opening a billing company needs a real gerant email and a company name", () => {
  const noEmail = billingCompanyInsertFromTraveler(jeremy, {
    first_name: "Cyril",
    last_name: "Zeitoun",
    email: "  ",
  });
  assert.equal("error" in noEmail && noEmail.error, "E-mail du gérant requis.");

  const noName = billingCompanyInsertFromTraveler(
    { ...jeremy, company_name: null },
    { first_name: "Cyril", last_name: "Zeitoun", email: "cyril@exemple.fr", company_name: "" }
  );
  assert.equal("error" in noName && noName.error, "Nom de société requis.");
});

test("Marrakech still billed to Jérémy is rebilled; a personal already-elsewhere stay is not", () => {
  const rows = bookingsToRebill(
    [
      { id: "tb-17", customer_id: "jeremy", billing_customer_id: "jeremy" },
      { id: "already", customer_id: "jeremy", billing_customer_id: "other" },
      { id: "someone", customer_id: "other", billing_customer_id: "jeremy" },
    ],
    "jeremy"
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["tb-17"]
  );
});

test("Jérémy can open OZB; Cyril already is the wallet", () => {
  assert.equal(
    canOpenBillingCompany({
      company_name: "OZB OPTIQUE",
      company_role: null,
      billing_parent_id: null,
    }),
    true
  );
  assert.equal(
    canOpenBillingCompany({
      company_name: "OZB OPTIQUE",
      company_role: "admin",
      billing_parent_id: null,
    }),
    false
  );
  assert.equal(
    isCompanyWallet({ company_role: "admin", billing_parent_id: null }),
    true
  );
  assert.equal(
    isCompanyWallet({ company_role: "admin", billing_parent_id: "other" }),
    false
  );
});
