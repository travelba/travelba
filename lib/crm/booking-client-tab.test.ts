import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("l’onglet Client d’une réservation est la fiche client", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const page = readFileSync(join(root, "app/admin/reservations/[id]/page.tsx"), "utf8");
  assert.match(editor, /<CustomerEditor/);
  assert.match(editor, /companions=\{companions\}/);
  assert.match(editor, /documents=\{identityDocs\}/);
  assert.match(editor, /billingCompanies=\{ficheBillingCompanies\}/);
  assert.match(editor, /Sur ce séjour/);
  assert.match(page, /ficheBillingCompanies=\{ficheBillingCompanies\}/);
  assert.match(page, /companyAdmins=\{companyAdmins\}/);
  assert.match(
    page,
    /from\("crm_billing_companies"\)\.select\("\*"\)\.eq\("customer_id", b\.customer_id\)/
  );
  assert.match(page, /select\(CUSTOMER_PICK_SELECT\)\.eq\("company_role", "admin"\)/);
  assert.equal(page.includes('.order("last_name")'), false);
});
