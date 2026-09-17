import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSiretInput,
  normalizeFlyingBlue,
  normalizeSiret,
  normalizeVat,
  siretError,
  vatFromSiret,
} from "./billing";
import { customerPatchFromBody } from "./customer-patch";
import {
  billingAddressDisplay,
  billingJson,
  type CompanyBillingValues,
} from "../../components/crm/CompanyBillingFields";

const emptyBilling: CompanyBillingValues = {
  companyName: "",
  siret: "",
  vatNumber: "",
  billingEmail: "",
  billingCountry: "",
  billingLine: "",
  billingPostal: "",
  billingCity: "",
};

test("SIRET formatting and Luhn", () => {
  assert.equal(formatSiretInput("73282932000074"), "732 829 320 00074");
  assert.equal(normalizeSiret("732 829 320 00074"), "73282932000074");
  assert.equal(siretError("73282932000074"), null);
  assert.equal(siretError("73282932000075"), "SIRET invalide.");
  assert.equal(siretError("123"), "Le SIRET doit contenir 14 chiffres.");
  assert.equal(vatFromSiret("73282932000074"), "FR44732829320");
});

test("VAT and Flying Blue normalize", () => {
  assert.equal(normalizeVat("fr 45 732 829 320"), "FR45732829320");
  assert.equal(normalizeFlyingBlue(" 12 345 6789 "), "123456789");
});

test("customer patch maps billing fields", () => {
  const { patch, error } = customerPatchFromBody({
    company_name: "Boukris SAS",
    siret: "732 829 320 00074",
    vat_number: "fr45732829320",
    billing_email: "Compta@Example.COM",
    billing_country: "France",
    flying_blue: "ab 12",
    phone_secondary: "+33601020304",
  });
  assert.equal(error, undefined);
  assert.equal(patch.company_name, "Boukris SAS");
  assert.equal(patch.siret, "73282932000074");
  assert.equal(patch.vat_number, "FR45732829320");
  assert.equal(patch.billing_email, "compta@example.com");
  assert.equal(patch.billing_country, "FR");
  assert.equal(patch.flying_blue, "AB12");
  assert.equal(patch.phone_secondary, "+33601020304");
});

test("invalid SIRET is rejected", () => {
  const { error } = customerPatchFromBody({ siret: "123456" });
  assert.equal(error, "Le SIRET doit contenir 14 chiffres.");
});

test("whatsapp is ignored on customer patch", () => {
  const { patch, error } = customerPatchFromBody({
    whatsapp: "+33612345678",
    phone: "+33601020304",
  });
  assert.equal(error, undefined);
  assert.equal("whatsapp" in patch, false);
  assert.equal(patch.phone, "+33601020304");
});

test("billing address fields stay visible from the traveler or the company", () => {
  const profile = {
    country: "FR",
    line: "12 rue de Rivoli",
    postal: "75001",
    city: "Paris",
  };
  const same = billingAddressDisplay(emptyBilling, profile, true);
  assert.equal(same.line, "12 rue de Rivoli");
  assert.equal(same.postal, "75001");
  assert.equal(same.city, "Paris");
  const own = billingAddressDisplay(
    { ...emptyBilling, billingLine: "1 avenue de l’Opéra", billingPostal: "75002", billingCity: "Paris" },
    profile,
    false
  );
  assert.equal(own.line, "1 avenue de l’Opéra");
  assert.equal(own.postal, "75002");
});

test("billing json copies traveler address when marked identical", () => {
  const json = billingJson(
    { ...emptyBilling, companyName: "Boukris SAS" },
    { country: "FR", line: "12 rue de Rivoli", postal: "75001", city: "Paris" },
    true
  );
  assert.equal(json.billing_address_line, "12 rue de Rivoli");
  assert.equal(json.billing_postal_code, "75001");
  assert.equal(json.billing_city, "Paris");
});
