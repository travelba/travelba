import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mb3mProformaCopy, renderMb3mProformaPdf } from "./mb3m-proforma";

const model = {
  number: "4531",
  reference: "TB-2026-0034",
  title: "Marrakech",
  dates: "8 octobre 2026 — 11 octobre 2026",
  billTo: ["Ada Lovelace", "1 rue du Test", "75001 Paris"],
  lines: [{ label: "Hôtel Mamounia", amount: 1050 }],
  total: 1050,
};

describe("aperçu facture pro forma", () => {
  it("reprend le numéro et les lignes sans imprimer la pièce", () => {
    const copy = mb3mProformaCopy(model);
    assert.equal(copy.kicker, "Facture pro forma");
    assert.equal(copy.number, "N° 4531");
    assert.equal(copy.notice, "Non imprimée. Elle se valide dans MB3M.");
    assert.equal(copy.lines[0]?.label, "Hôtel Mamounia");
    assert.match(copy.total, /1[\s\u202f]?050,00/);
  });

  it("produit un PDF ouvrable", async () => {
    const pdf = await renderMb3mProformaPdf(model);
    assert.equal(Buffer.from(pdf.subarray(0, 4)).toString("utf8"), "%PDF");
  });
});
