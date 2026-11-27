import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardTheoreticalCostEur, lineProfitability, profitabilityTotals } from "./theoretical-cost";

describe("coût théorique de la carte", () => {
  it("lit le net en euros, puis le net en euro, puis le prix d’achat", () => {
    assert.equal(
      cardTheoreticalCostEur({ supplier_net: 12000, supplier_currency: "MAD", supplier_net_eur: 1160, document_amount: 1400 }),
      1160
    );
    assert.equal(cardTheoreticalCostEur({ supplier_net: 1540, supplier_currency: "EUR", document_amount: 1600 }), 1540);
    assert.equal(cardTheoreticalCostEur({ supplier_net: "196" }), 196);
    assert.equal(cardTheoreticalCostEur({ document_amount: 105, document_currency: "EUR" }), 105);
    assert.equal(cardTheoreticalCostEur({ document_amount: "80" }), 80);
  });

  it("ignore une devise étrangère sans équivalent en euros, et un montant vide", () => {
    assert.equal(cardTheoreticalCostEur({ supplier_net: 2612.03, supplier_currency: "USD" }), null);
    assert.equal(cardTheoreticalCostEur({ document_amount: 1157.25, document_currency: "USD" }), null);
    assert.equal(cardTheoreticalCostEur({ supplier_net: 0, document_amount: 0 }), null);
    assert.equal(cardTheoreticalCostEur(null), null);
    assert.equal(cardTheoreticalCostEur({}), null);
  });
});

describe("marge du tableau", () => {
  it("sans débit, le coût de la carte fait la marge", () => {
    assert.deepEqual(lineProfitability({ sale: 1715, debits: [], cardCost: 1540 }), {
      sale: 1715,
      cost: 1540,
      margin: 175,
      source: "theoretical",
      theoreticalNote: null,
    });
  });

  it("un débit réel remplace le coût de la carte", () => {
    assert.deepEqual(lineProfitability({ sale: 1715, debits: [1600], cardCost: 1540 }), {
      sale: 1715,
      cost: 1600,
      margin: 115,
      source: "real",
      theoreticalNote: 1540,
    });
    const same = lineProfitability({ sale: 1715, debits: [900, 640], cardCost: 1540 });
    assert.equal(same.cost, 1540);
    assert.equal(same.margin, 175);
    assert.equal(same.source, "real");
    assert.equal(same.theoreticalNote, null);
  });

  it("ni débit ni coût de carte : coût nul, marge égale à la vente", () => {
    assert.deepEqual(lineProfitability({ sale: 90, debits: [], cardCost: null }), {
      sale: 90,
      cost: 0,
      margin: 90,
      source: "none",
      theoreticalNote: null,
    });
  });

  it("une remise n’a pas de coût", () => {
    assert.deepEqual(lineProfitability({ sale: -12.5, nature: "discount", debits: [40], cardCost: 10 }), {
      sale: -12.5,
      cost: null,
      margin: -12.5,
      source: "none",
      theoreticalNote: null,
    });
  });

  it("le total additionne le réel en priorité, et isole la part théorique", () => {
    const lines = [
      lineProfitability({ sale: 1715, debits: [], cardCost: 1540 }),
      lineProfitability({ sale: 180, debits: [105], cardCost: 105 }),
      lineProfitability({ sale: 90, debits: [], cardCost: null }),
    ];
    assert.deepEqual(profitabilityTotals(lines), {
      sale: 1985,
      cost: 1645,
      margin: 340,
      theoreticalCost: 1540,
    });
  });
});
