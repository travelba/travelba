import assert from "node:assert/strict";
import test from "node:test";
import { reglementChecklist, reglementCostsToPoint } from "./reglement-checklist";

const base = {
  payerKind: "company" as const,
  payerCompanyName: "RB&A",
  cardsTotal: 3,
  cardsPriced: 3,
  booking: { status: "confirmed", visible_to_client: true, include_in_ledger: true, client_settles_stay: false },
  costsToPoint: 0,
  invoice: { number: "F-2026-0012", printed: true, marginStale: false },
};

test("un dossier complet est tout vert", () => {
  const checks = reglementChecklist(base);
  assert.deepEqual(
    checks.map((check) => [check.id, check.state]),
    [
      ["payer", "done"],
      ["prices", "done"],
      ["ledger", "done"],
      ["costs", "done"],
      ["invoice", "done"],
    ]
  );
  assert.equal(checks[0]?.label, "Société · RB&A");
  assert.equal(checks[1]?.label, "Prix saisi sur 3 cartes");
  assert.equal(checks[4]?.label, "Facture n° F-2026-0012 imprimée");
});

test("société sans choix, cartes sans prix et coûts à pointer attendent l’agent", () => {
  const checks = reglementChecklist({
    ...base,
    payerCompanyName: null,
    cardsPriced: 1,
    costsToPoint: 2,
    invoice: { number: null, printed: false, marginStale: false },
  });
  assert.equal(checks[0]?.label, "Société à choisir");
  assert.equal(checks[0]?.state, "todo");
  assert.equal(checks[1]?.label, "2 cartes sans prix");
  assert.equal(checks[3]?.label, "2 coûts à pointer");
  assert.equal(checks[4]?.label, "Facture à préparer");
  assert.equal(checks[4]?.state, "todo");
});

test("le grand livre suit la visibilité et le client qui règle l’hôtel", () => {
  const hidden = reglementChecklist({ ...base, booking: { ...base.booking, visible_to_client: false } });
  assert.equal(hidden[2]?.state, "todo");
  assert.match(hidden[2]?.label || "", /montrez le séjour/);
  const settles = reglementChecklist({ ...base, booking: { ...base.booking, client_settles_stay: true } });
  assert.equal(settles[2]?.state, "info");
  assert.match(settles[2]?.label || "", /Hors agence/);
});

test("la facture dit pro forma, imprimée ou marge à corriger", () => {
  const proforma = reglementChecklist({ ...base, invoice: { number: "P-7", printed: false, marginStale: false } });
  assert.equal(proforma[4]?.label, "Pro forma n° P-7 à valider dans MB3M");
  assert.equal(proforma[4]?.state, "todo");
  const stale = reglementChecklist({ ...base, invoice: { number: "F-9", printed: true, marginStale: true } });
  assert.equal(stale[4]?.label, "Marge à corriger sur la facture n° F-9");
  assert.equal(stale[4]?.state, "todo");
});

test("un particulier sans carte reste lisible", () => {
  const checks = reglementChecklist({ ...base, payerKind: "personal", cardsTotal: 0, cardsPriced: 0 });
  assert.equal(checks[0]?.label, "Particulier");
  assert.equal(checks[1]?.label, "Aucune carte à vendre");
  assert.equal(checks[1]?.state, "info");
});

test("les coûts à pointer comptent les sorties proposées et les coûts sans vente", () => {
  assert.equal(reglementCostsToPoint(null), 0);
  assert.equal(reglementCostsToPoint({ proposed: [1, 2], unsold: [3] }), 3);
});
