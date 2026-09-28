import assert from "node:assert/strict";
import test from "node:test";
import { officialCompanyFromHit } from "./entreprises";

test("la recherche de société garde de quoi la reconnaître", () => {
  const company = officialCompanyFromHit(
    {
      nom_raison_sociale: "ATELIER EXEMPLE",
      nom_complet: "ATELIER EXEMPLE",
      sigle: null,
      siren: "732829320",
      nature_juridique: "5710",
      activite_principale: "79.12Z",
      etat_administratif: "A",
      date_creation: "2018-04-02",
      nombre_etablissements_ouverts: 2,
      tva: ["FR32732829320"],
      dirigeants: [{ prenoms: "CAMILLE", nom: "MARTIN", qualite: "Présidente" }],
      siege: {
        siret: "73282932000074",
        adresse: "12 RUE DE RIVOLI 75001 PARIS",
        code_postal: "75001",
        libelle_commune: "PARIS",
        numero_voie: "12",
        type_voie: "RUE",
        libelle_voie: "DE RIVOLI",
        nom_commercial: "Atelier Rivoli",
        activite_principale: "79.12Z",
        etat_administratif: "A",
      },
      matching_etablissements: [
        {
          siret: "73282932000082",
          code_postal: "69002",
          libelle_commune: "LYON",
          numero_voie: "4",
          type_voie: "RUE",
          libelle_voie: "DE LA REPUBLIQUE",
          etat_administratif: "A",
        },
      ],
    },
    "73282932000082"
  );
  assert.ok(company);
  assert.equal(company.legalName, "ATELIER EXEMPLE");
  assert.equal(company.tradeName, "Atelier Rivoli");
  assert.equal(company.legalForm, "SAS");
  assert.match(company.activity || "", /79\.12Z/);
  assert.match(company.activity || "", /voyage/i);
  assert.equal(company.city, "LYON");
  assert.equal(company.postalCode, "69002");
  assert.equal(company.site, "Établissement");
  assert.equal(company.headOfficeCity, "Paris");
  assert.equal(company.createdOn, "2018-04-02");
  assert.equal(company.openSites, 2);
  assert.match(company.directors || "", /Camille Martin, Présidente/);
  assert.equal(company.active, true);
});
