import assert from "node:assert/strict";
import test from "node:test";
import {
  createBookingSchema,
  createTransactionSchema,
  isIsoDate,
  parseBody,
  patchCustomerSchema,
} from "./admin-schemas";

const CUSTOMER = "d39602e0-0af3-455e-969d-802bc6eb8996";
const BOOKING = "e29a2074-5f2c-4719-8507-6947366e37ba";

test("date ISO : forme et calendrier", () => {
  assert.equal(isIsoDate("2026-10-04"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("04/10/2026"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate(null), false);
});

test("création de dossier : statut connu, devise normalisée, dates ISO ou vides", () => {
  const ok = parseBody(createBookingSchema, {
    customer_id: CUSTOMER,
    title: "  Rome  ",
    status: "confirmed",
    currency: "euros",
    start_date: "2026-10-04",
    end_date: "",
    include_in_ledger: "on",
    payer_kind: "",
    billing_company_id: "",
    unknown_field: "ignoré",
  });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.title, "Rome");
  assert.equal(ok.data?.status, "confirmed");
  assert.equal(ok.data?.currency, "EUR");
  assert.equal(ok.data?.start_date, "2026-10-04");
  assert.equal(ok.data?.end_date, undefined);
  assert.equal(ok.data?.payer_kind, undefined);
  assert.equal(ok.data?.billing_company_id, undefined);
  assert.equal(ok.data?.include_in_ledger, "on");
  assert.equal("unknown_field" in (ok.data || {}), false);

  assert.equal(parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", currency: "" }).data?.currency, "EUR");
  assert.equal(parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", currency: "usd" }).data?.currency, "USD");
  assert.equal(parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome" }).data?.status, undefined);

  assert.equal(
    parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", status: "paid" }).error,
    "Statut de dossier inconnu."
  );
  assert.equal(
    parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", start_date: "04/10/2026" }).error,
    "Date de départ invalide (AAAA-MM-JJ)."
  );
  assert.equal(
    parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", end_date: "2026-02-30" }).error,
    "Date de retour invalide (AAAA-MM-JJ)."
  );
  assert.equal(parseBody(createBookingSchema, { customer_id: "abc", title: "Rome" }).error, "Client invalide.");
  assert.equal(
    parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", payer_kind: "bank" }).error,
    "Règlement : société ou particulier."
  );
  assert.equal(
    parseBody(createBookingSchema, { customer_id: CUSTOMER, title: "Rome", agency_commission: "yes" }).error,
    "Frais d’agence : vrai ou faux attendu."
  );
  assert.equal(parseBody(createBookingSchema, null).error, "Client invalide.");
});

test("virement manuel : montant > 0, devise 3 lettres, date valide, libellé borné, uuids", () => {
  const ok = parseBody(createTransactionSchema, {
    customer_id: CUSTOMER,
    booking_id: "",
    amount: "1 200,50",
    currency: "eur",
    occurred_on: "2026-10-04",
    label: "  Acompte  ",
    direction: "credit",
    kind: "transfer",
  });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.amount, 1200.5);
  assert.equal(ok.data?.currency, "EUR");
  assert.equal(ok.data?.booking_id, undefined);
  assert.equal(ok.data?.label, "Acompte");
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10 }).data?.currency, "EUR");
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10, booking_id: BOOKING }).data?.booking_id, BOOKING);

  assert.equal(parseBody(createTransactionSchema, { amount: 10 }).error, "Choisissez un client.");
  assert.equal(parseBody(createTransactionSchema, { customer_id: "x", amount: 10 }).error, "Client invalide.");
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: "0" }).error, "Indiquez un montant supérieur à zéro.");
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: -5 }).error, "Indiquez un montant supérieur à zéro.");
  // parseMoney retire le signe d’une saisie texte : « -5 » vaut 5 (comportement de money.ts).
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: "-5" }).data?.amount, 5);
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: "" }).error, "Indiquez un montant.");
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10, currency: "EURO" }).error, "Devise invalide (3 lettres).");
  assert.equal(
    parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10, occurred_on: "hier" }).error,
    "Date du virement invalide (AAAA-MM-JJ)."
  );
  assert.equal(
    parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10, label: "x".repeat(201) }).error,
    "Libellé : 200 caractères maximum."
  );
  assert.equal(parseBody(createTransactionSchema, { customer_id: CUSTOMER, amount: 10, booking_id: "nope" }).error, "Dossier invalide.");
});

test("fiche client : en veille booléen, sociétés = tableau d’objets aux champs connus", () => {
  const ok = parseBody(patchCustomerSchema, {
    first_name: "Alice",
    on_hold: true,
    billing_companies: [
      { id: "", company_name: "Boukris SAS", siret: "123", extra: "ignoré" },
      { id: BOOKING, company_name: null, billing_country: "FR" },
    ],
  });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.on_hold, true);
  assert.equal(ok.data?.billing_companies?.length, 2);
  assert.equal(ok.data?.billing_companies?.[0].id, undefined);
  assert.equal(ok.data?.billing_companies?.[1].id, BOOKING);
  assert.equal("extra" in (ok.data?.billing_companies?.[0] || {}), false);
  assert.equal(parseBody(patchCustomerSchema, { first_name: "Alice" }).error, null);

  assert.equal(parseBody(patchCustomerSchema, { on_hold: "oui" }).error, "« Compte en veille » : vrai ou faux attendu.");
  assert.equal(parseBody(patchCustomerSchema, { billing_companies: "Boukris SAS" }).error, "Liste de sociétés invalide.");
  assert.equal(parseBody(patchCustomerSchema, { billing_companies: [{ company_name: 12 }] }).error, "Raison sociale invalide.");
  assert.equal(parseBody(patchCustomerSchema, { billing_companies: [{ id: "x" }] }).error, "Société invalide.");
  assert.equal(parseBody(patchCustomerSchema, { billing_companies: ["Boukris"] }).error, "Champ « billing_companies.0 » invalide.");
});
