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
