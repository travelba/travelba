import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mb3mCompanyDraft, mb3mFicheBlocker, mb3mPersonDraft } from "./mb3m-party";

const customerId = "11111111-2222-4333-8444-555555555555";

describe("fiche MB3M", () => {
  it("attend une adresse complète avant d’envoyer la personne", () => {
    assert.equal(
      mb3mPersonDraft({
        id: customerId,
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.invalid",
        billing_email: null,
        billing_address_line: null,
        billing_postal_code: null,
        billing_city: null,
        billing_country: null,
        address_line: null,
        postal_code: null,
        city: null,
        country: null,
      }),
      null
    );
    const draft = mb3mPersonDraft({
      id: customerId,
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.invalid",
      billing_email: "compta@example.invalid",
      billing_address_line: "9 avenue du Compte",
      billing_postal_code: "69001",
      billing_city: "Lyon",
      billing_country: "France",
      address_line: "1 rue du Test",
      postal_code: "75001",
      city: "Paris",
      country: "France",
    });
    assert.equal(draft?.firstName, "Ada");
    assert.equal(draft?.name, "Lovelace");
    assert.equal(draft?.email, "compta@example.invalid");
    assert.equal(draft?.address.city, "Lyon");
    assert.equal(draft?.address.countryCode, "FR");
    assert.equal(draft?.partnerId, "11111111222243");
  });

  it("envoie la société avec son adresse de facturation", () => {
    assert.equal(
      mb3mCompanyDraft({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        company_name: "OZB",
        billing_email: null,
        billing_address_line: null,
        billing_postal_code: "75001",
        billing_city: "Paris",
        billing_country: "France",
      }),
      null
    );
    const draft = mb3mCompanyDraft({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      company_name: "OZB",
      billing_email: "compta@example.invalid",
      billing_address_line: "2 rue de la Paix",
      billing_postal_code: "75002",
      billing_city: "Paris",
      billing_country: "France",
    });
    assert.equal(draft?.name, "OZB");
    assert.equal(draft?.email, "compta@example.invalid");
    assert.equal(draft?.address.line1, "2 rue de la Paix");
  });

  it("éteint le bouton tant que l’adresse manque", () => {
    const previous = {
      user: process.env.MB3M_API_USER,
      password: process.env.MB3M_API_PASSWORD,
      vercel: process.env.VERCEL_ENV,
    };
    delete process.env.VERCEL_ENV;
    process.env.MB3M_API_USER = "user1750@partner";
    process.env.MB3M_API_PASSWORD = "secret";
    const empty = {
      id: customerId,
      first_name: "Ada",
      last_name: "Lovelace",
      email: null,
      billing_email: null,
      billing_address_line: null,
      billing_postal_code: null,
      billing_city: null,
      billing_country: null,
      address_line: null,
      postal_code: null,
      city: null,
      country: null,
    };
    try {
      assert.equal(mb3mFicheBlocker(empty), "Ajoutez l’adresse avant d’envoyer la fiche.");
      assert.equal(
        mb3mFicheBlocker({
          ...empty,
          address_line: "1 rue du Test",
          postal_code: "75001",
          city: "Paris",
          country: "France",
        }),
        null
      );
    } finally {
      restore("MB3M_API_USER", previous.user);
      restore("MB3M_API_PASSWORD", previous.password);
      restore("VERCEL_ENV", previous.vercel);
    }
  });
});

function restore(key: "MB3M_API_USER" | "MB3M_API_PASSWORD" | "VERCEL_ENV", value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
