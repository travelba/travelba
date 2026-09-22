import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSiretInput,
  normalizeFlyingBlue,
  normalizeIban,
  formatIbanInput,
  ibanError,
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

test("IBAN FR is 27 characters", () => {
  assert.equal(normalizeIban("fr76 3000 6000 0112 3456 7890 189"), "FR7630006000011234567890189");
  assert.equal(formatIbanInput("FR7630006000011234567890189"), "FR76 3000 6000 0112 3456 7890 189");
  assert.equal(ibanError("FR7630006000011234567890189"), null);
  assert.equal(ibanError("DE89370400440532013000"), "Indiquez un IBAN français (commence par FR).");
  assert.equal(ibanError("FR76"), "L’IBAN français doit contenir 27 caractères.");
});

test("customer patch maps loyalty and IBAN", () => {
  const { patch, error } = customerPatchFromBody({
    loyalty: { flying_blue: "ab 12", miles_more: " 99 " },
    iban: "fr76 3000 6000 0112 3456 7890 189",
  });
  assert.equal(error, undefined);
  assert.equal((patch.loyalty as { flying_blue: string }).flying_blue, "AB12");
  assert.equal((patch.loyalty as { miles_more: string }).miles_more, "99");
  assert.equal(patch.flying_blue, "AB12");
  assert.equal(patch.iban, "FR7630006000011234567890189");
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

test("client profile requires a valid phone", () => {
  const empty = customerPatchFromBody({ first_name: "Ada", phone: "" }, { requirePhone: true });
  assert.equal(empty.error, "Indiquez un numéro de téléphone.");
  const ok = customerPatchFromBody(
    { first_name: "Ada", phone: "+33601020304" },
    { requirePhone: true, strictPhones: true }
  );
  assert.equal(ok.error, undefined);
  assert.equal(ok.patch.phone, "+33601020304");
});

test("an admin société can keep a shared billing parent", () => {
  const { patch, error } = customerPatchFromBody({
    company_role: "admin",
    billing_parent_id: "ozb-admin-id",
  });
  assert.equal(error, undefined);
  assert.equal(patch.company_role, "admin");
  assert.equal(patch.billing_parent_id, "ozb-admin-id");
});

test("a billing-only patch does not require the phone again", () => {
  const billing = customerPatchFromBody(
    { company_name: "QA SAS", siret: "", billing_email: "Compta@QA.fr" },
    { requirePhone: true, strictPhones: true }
  );
  assert.equal(billing.error, undefined);
  assert.equal("phone" in billing.patch, false);
  assert.equal(billing.patch.company_name, "QA SAS");
  assert.equal(billing.patch.billing_email, "compta@qa.fr");
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
