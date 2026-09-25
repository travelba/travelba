import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  billingCompanyTabLabel,
  companyLabelForTransaction,
  normalizeBillingCompanies,
  postedCustomerBalance,
  primaryBillingMirror,
  transactionCompanyLabel,
} from "./billing-companies";

test("l’encours ignore la société de facturation", () => {
  const rows = [
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "credit" as const,
      amount: 100,
      status: "posted",
      billing_company_id: null,
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 40,
      status: "posted",
      billing_company_id: "a",
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 25,
      status: "posted",
      billing_company_id: "b",
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 999,
      status: "void",
      billing_company_id: "a",
    },
  ];
  assert.equal(postedCustomerBalance(rows, "c1"), 35);
  const sql = readFileSync(
    new URL("../../supabase/migrations/20260925120000_billing_companies.sql", import.meta.url),
    "utf8"
  );
  assert.equal(sql.includes("crm_customer_balances"), true);
  assert.equal(/create\s+(or\s+replace\s+)?view\s+public\.crm_customer_balances/i.test(sql), false);
  assert.equal(/group by[^;]*billing_company_id/i.test(sql), false);
});

test("le libellé société n’apparaît que s’il y en a plusieurs", () => {
  assert.equal(transactionCompanyLabel(0, "Atelier"), null);
  assert.equal(transactionCompanyLabel(1, "Atelier"), null);
  assert.equal(transactionCompanyLabel(2, "Atelier"), "Atelier");
  assert.equal(transactionCompanyLabel(2, "  "), null);

  const companies = [
    { id: "a", customer_id: "c1", company_name: "Atelier" },
    { id: "b", customer_id: "c1", company_name: "Bureau" },
  ];
  assert.equal(
    companyLabelForTransaction({ customer_id: "c1", billing_company_id: "a" }, companies),
    "Atelier"
  );
  assert.equal(
    companyLabelForTransaction(
      { customer_id: "c1", billing_company_id: "a" },
      [companies[0]]
    ),
    null
  );
  assert.equal(
    companyLabelForTransaction({ customer_id: "c1", billing_company_id: null }, companies),
    null
  );
});

test("une société vide n’est pas enregistrée et le miroir suit la première", () => {
  const parsed = normalizeBillingCompanies([
    { company_name: "  " },
    { company_name: "Atelier", siret: "73282932000074", billing_email: "Compta@Atelier.fr" },
    { company_name: "Bureau" },
  ]);
  assert.equal("error" in parsed, false);
  if ("error" in parsed) return;
  assert.equal(parsed.companies.length, 2);
  assert.equal(parsed.companies[0]?.siret, "73282932000074");
  assert.equal(parsed.companies[0]?.billing_email, "compta@atelier.fr");
  assert.deepEqual(primaryBillingMirror(parsed.companies), {
    company_name: "Atelier",
    siret: "73282932000074",
    vat_number: null,
    billing_email: "compta@atelier.fr",
    billing_address_line: null,
    billing_postal_code: null,
    billing_city: null,
    billing_country: null,
  });
  assert.equal(billingCompanyTabLabel("", 1, 2), "Société 2");
  assert.equal(billingCompanyTabLabel("Bureau", 1, 2), "Bureau");
});
