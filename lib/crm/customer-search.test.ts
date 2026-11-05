import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerBillingPickLabel,
  customerDirectoryName,
  companiesByCustomer,
  customerMatchesQuery,
  customerPickDetail,
  customerPickLabel,
  customerTravelerPickLabel,
  filterCustomersForPick,
  type PickableCustomer,
} from "./customer-search";

function customer(partial: Partial<PickableCustomer>): PickableCustomer {
  return {
    id: "c1",
    first_name: "Marie",
    last_name: "Dupont",
    company_name: null,
    email: "marie@example.com",
    phone: "+33600000000",
    ...partial,
  };
}

describe("customer-search", () => {
  it("l’annuaire se lit par nom de famille", () => {
    assert.equal(
      customerDirectoryName(customer({ first_name: "Alice", last_name: "Martin" })),
      "Martin Alice"
    );
    assert.equal(
      customerDirectoryName(customer({ first_name: "Maelle Louise Rosalie", last_name: "Dupont" })),
      "Dupont Maelle"
    );
    const rows = [
      customer({ id: "1", first_name: "Zoé", last_name: "Bernard" }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin" }),
      customer({ id: "3", first_name: "Paul", last_name: "Bernard" }),
    ];
    const labels = [...rows]
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr")
      )
      .map(customerDirectoryName);
    assert.deepEqual(labels, ["Bernard Paul", "Bernard Zoé", "Martin Alice"]);
  });

  it("affiche le nom puis la société", () => {
    assert.equal(customerPickLabel(customer({})), "Marie Dupont");
    assert.equal(
      customerPickLabel(customer({ company_name: "TBA SAS" })),
      "Marie Dupont · TBA SAS"
    );
  });

  it("cherche sans accent, sur nom, société, e-mail et téléphone", () => {
    const row = customer({
      first_name: "Léa",
      last_name: "Béranger",
      company_name: "Atelier Côte",
      email: "lea@atelier.fr",
      phone: "+33612345678",
    });
    assert.equal(customerMatchesQuery(row, "lea beranger"), true);
    assert.equal(customerMatchesQuery(row, "beranger lea"), true);
    assert.equal(customerMatchesQuery(row, "côte"), true);
    assert.equal(customerMatchesQuery(row, "atelier.fr"), true);
    assert.equal(customerMatchesQuery(row, "061234"), true);
    assert.equal(customerMatchesQuery(row, "inconnu"), false);
    const usage = customer({ first_name: "Gaëlle", last_name: "Dupont", usage_name: "Khiari", company_name: null });
    assert.equal(customerMatchesQuery(usage, "gaelle"), true);
    assert.equal(customerMatchesQuery(usage, "khiari"), true);
    const billed = customer({ company_name: "Atelier", companies: ["Bel Air SAS"] });
    assert.equal(customerMatchesQuery(billed, "bel air"), true);
    assert.equal(customerPickLabel(billed), "Marie Dupont · Atelier · Bel Air SAS");
    const grouped = companiesByCustomer([
      { customer_id: "c1", company_name: "Bel Air SAS" },
      { customer_id: "c1", company_name: "bel air sas" },
      { customer_id: "c2", company_name: "NILOS" },
    ]);
    assert.deepEqual(grouped.get("c1"), ["Bel Air SAS"]);
    assert.deepEqual(grouped.get("c2"), ["NILOS"]);
  });

  it("ajoute le rôle société au libellé voyageur / facturation", () => {
    const member = customer({ company_role: "member", email: "marie@example.com" });
    const admin = customer({
      company_role: "admin",
      company_name: "TBA SAS",
      email: "dir@tba.fr",
    });
    assert.equal(customerTravelerPickLabel(member), "Marie Dupont — marie@example.com · rattaché");
    assert.equal(customerBillingPickLabel(admin), "Marie Dupont · TBA SAS · admin société");
    const peer = customer({
      company_role: "admin",
      billing_parent_id: "wallet",
      email: "dir@tba.fr",
    });
    assert.equal(customerTravelerPickLabel(peer), "Marie Dupont — dir@tba.fr · admin société");
  });

  it("sépare deux homonymes par l’e-mail, la société, la naissance et les dossiers", () => {
    const detail = customerPickDetail(
      customer({
        email: "john@johndalia.com",
        phone: "+33610330020",
        company_name: "JOHN DALIA",
        company_role: "admin",
        birth_date: "1980-03-04",
        dossier_count: 2,
      })
    );
    assert.match(detail, /john@johndalia.com/);
    assert.match(detail, /\+33610330020/);
    assert.match(detail, /JOHN DALIA/);
    assert.match(detail, /né\(e\) le/);
    assert.match(detail, /2 dossiers/);
    assert.match(detail, /admin société/);
    assert.equal(customerPickDetail(customer({ email: "", phone: null, birth_date: null })), "—");
  });

  it("place les propositions en tête de liste", () => {
    const a = customer({ id: "a", last_name: "Alpha" });
    const b = customer({ id: "b", first_name: "Paul", last_name: "Beta" });
    const { suggested, rest } = filterCustomersForPick([a, b], "", ["b"]);
    assert.deepEqual(
      suggested.map((c) => c.id),
      ["b"]
    );
    assert.deepEqual(
      rest.map((c) => c.id),
      ["a"]
    );
  });
});
