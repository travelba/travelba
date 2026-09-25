import assert from "node:assert/strict";
import test from "node:test";
import { CHAUFFEUR_EUR, CHECKIN_EUR } from "./extras";
import {
  ExampleStop,
  launchExampleVisa,
  orderExampleExtra,
  patchExampleCustomer,
  readExample,
  readExampleFile,
  resetExampleState,
  saveExampleDocument,
} from "./example-store";

const ESTA = {
  usAddress: "1 place de l'Exemple",
  employment: "Atelier Exemple",
  countriesVisited: "France",
  priorRefusal: "Non",
};

test("le visa s’arrête au paiement, seulement après un fichier de passeport", () => {
  resetExampleState();
  assert.throws(() => launchExampleVisa("US", ESTA), (err: unknown) => {
    assert.ok(err instanceof ExampleStop);
    assert.match(err.message, /passeport français manquant/);
    return true;
  });
  const doc = saveExampleDocument({
    docType: "passport",
    issuingCountry: null,
    expiresOn: null,
    firstName: "Camille",
    lastName: "Morel",
    companionId: null,
    fileName: "apercu.png",
    mimeType: "image/png",
    bytes: new Uint8Array([137, 80, 78, 71]),
  });
  assert.equal(doc.number, null);
  assert.equal(doc.personal_number, null);
  assert.equal(doc.issuing_country, "FR");
  assert.ok(doc.storage_path?.startsWith("exemple/"));
  assert.ok(readExampleFile(doc.storage_path || ""));
  const visa = launchExampleVisa("US", ESTA);
  assert.equal(visa.step, "paiement");
  assert.equal(visa.status, "en_cours");
  assert.equal(launchExampleVisa("US", ESTA).step, "paiement");
});

test("le chauffeur reste en attente, au tarif produit, sans confirmation", () => {
  resetExampleState();
  const result = orderExampleExtra({
    kind: "chauffeur",
    leg: "departure",
    place: "home",
    address: "1 place de l'Exemple, 69002 Lyon, FR",
  });
  assert.ok("item" in result && result.item);
  if (!("item" in result) || !result.item) return;
  const chauffeur = result.item;
  assert.equal(chauffeur.amount, CHAUFFEUR_EUR);
  assert.equal(chauffeur.confirmation_ref, null);
  assert.equal(chauffeur.details.agency_status, "pending");
  assert.equal(chauffeur.supplier, "Travelba");
  const ledger = readExample().ledger;
  assert.equal(ledger.movements.length, 1);
  assert.equal(ledger.balanceValue, -CHAUFFEUR_EUR);
  assert.ok(ledger.movements[0]?.carnetHref?.startsWith("/exemple/"));
});

test("l’enregistrement débite le tarif passager, et l’IBAN n’est pas conservé", () => {
  resetExampleState();
  const result = orderExampleExtra({ kind: "checkin" });
  assert.ok("item" in result && result.item);
  if (!("item" in result) || !result.item) return;
  const checkin = result.item;
  assert.equal(checkin.amount, CHECKIN_EUR * 2);
  assert.equal(checkin.confirmation_ref, null);
  const customer = patchExampleCustomer({ iban: "FR7630006000011234567890189", city: "Lyon" });
  assert.equal(customer.iban, null);
  assert.equal(customer.city, "Lyon");
  assert.equal(readExample().ledger.balanceValue, -(CHECKIN_EUR * 2));
});
