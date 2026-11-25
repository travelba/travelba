import assert from "node:assert/strict";
import test from "node:test";
import { itemSellingAmount } from "./bookings";
import {
  automaticTicketingWrites,
  cardPriceError,
  clientSeesCardPrice,
  forfaitPriceError,
  mcpPriceChoice,
  plannedSaleLines,
  readCardPriceMode,
  readForfaitAmount,
  readStayPriceMode,
  withCardPriceMode,
} from "./card-price";

function card(partial: {
  id: string;
  kind?: string;
  amount?: number | null;
  details?: Record<string, unknown>;
  visible_to_client?: boolean;
  lifecycle?: string;
}) {
  return {
    ...partial,
    kind: partial.kind || "hotel",
    selling: itemSellingAmount({
      kind: partial.kind || "hotel",
      amount: partial.amount,
      details: partial.details,
    }),
  };
}

test("une carte avec un prix non nul est « Avec prix », sinon « Sans prix »", () => {
  assert.equal(readCardPriceMode({ amount: 800 }), "avec");
  assert.equal(readCardPriceMode({ amount: 0 }), "sans");
  assert.equal(readCardPriceMode({ amount: null }), "sans");
  assert.equal(readCardPriceMode({ amount: 800, details: { price_mode: "sans" } }), "sans");
  assert.equal(readCardPriceMode({ amount: null, price_mode: "avec" }), "avec");
  assert.equal(readCardPriceMode({ amount: 900, price_mode: "sans", details: { price_mode: "avec" } }), "avec");
  assert.equal(readCardPriceMode({ amount: 900, price_mode: "avec", details: { price_mode: "sans" } }), "sans");
  assert.equal(readCardPriceMode({ amount: 640, price_mode: "avec", details: {} }), "avec");
});

test("« Avec prix » exige un montant, « Sans prix » n’affiche rien au client", () => {
  assert.equal(cardPriceError("avec", null), "Indiquez le prix de vente.");
  assert.equal(cardPriceError("avec", 0), "Indiquez le prix de vente.");
  assert.equal(cardPriceError("avec", 120), null);
  assert.equal(cardPriceError("sans", null), null);
  assert.equal(clientSeesCardPrice({ amount: 120, details: { price_mode: "sans" } }), false);
  assert.equal(clientSeesCardPrice({ amount: 120, details: withCardPriceMode({}, "avec") }), true);
  assert.equal(clientSeesCardPrice({ amount: 120, details: { price_mode: "avec" } }, "forfait"), false);
});

test("une carte masquée « Avec prix » a sa ligne, « Sans prix » n’en a pas", () => {
  const lines = plannedSaleLines({
    stayVisible: true,
    stayMode: "cartes",
    cards: [
      card({ id: "hotel", amount: 900, visible_to_client: false, details: { price_mode: "avec" } }),
      card({ id: "vol", kind: "flight", amount: 400, visible_to_client: true, details: { price_mode: "sans" } }),
      card({ id: "train", kind: "rail", amount: null, visible_to_client: true }),
    ],
  });
  assert.deepEqual(lines, [{ key: "carte", itemId: "hotel", amount: 900, visible: false }]);
});

test("le forfait est une seule ligne, les cartes n’en ont plus", () => {
  assert.equal(forfaitPriceError("forfait", null), "Indiquez le prix forfait du voyage.");
  assert.equal(forfaitPriceError("cartes", null), null);
  assert.equal(readStayPriceMode({ price_mode: "forfait" }), "forfait");
  assert.equal(readForfaitAmount({ forfait_amount: "2480.5" }), 2480.5);
  const lines = plannedSaleLines({
    stayVisible: true,
    stayMode: "forfait",
    forfaitAmount: 2480,
    cards: [card({ id: "hotel", amount: 900, details: { price_mode: "avec" } })],
  });
  assert.deepEqual(lines, [{ key: "forfait", amount: 2480 }]);
});

test("cacher le séjour, l’annuler ou l’archiver retire les lignes de vente", () => {
  const cards = [card({ id: "hotel", amount: 900, details: { price_mode: "avec" } })];
  assert.deepEqual(plannedSaleLines({ stayVisible: false, stayMode: "cartes", cards }), []);
  assert.deepEqual(plannedSaleLines({ stayVisible: true, cancelled: true, stayMode: "cartes", cards }), []);
  assert.deepEqual(plannedSaleLines({ stayVisible: true, archived: true, stayMode: "forfait", forfaitAmount: 1000, cards }), []);
});

test("passer en sans prix ou supprimer la carte retire sa ligne", () => {
  const hiddenPrice = plannedSaleLines({
    stayVisible: true,
    stayMode: "cartes",
    cards: [card({ id: "hotel", amount: 900, details: { price_mode: "sans" } })],
  });
  assert.deepEqual(hiddenPrice, []);
  const removed = plannedSaleLines({
    stayVisible: true,
    stayMode: "cartes",
    cards: [card({ id: "hotel", amount: 900, lifecycle: "cancelled", details: { price_mode: "avec" } })],
  });
  assert.deepEqual(removed, []);
});

test("le retour au prix par carte recrée les lignes et retire le forfait", () => {
  const lines = plannedSaleLines({
    stayVisible: true,
    stayMode: "cartes",
    forfaitAmount: 2480,
    cards: [
      card({ id: "hotel", amount: 900, visible_to_client: false, details: { price_mode: "avec" } }),
      card({ id: "vol", kind: "flight", amount: 250, details: { price_mode: "avec", ticket_count: 2 } }),
    ],
  });
  assert.deepEqual(lines, [
    { key: "carte", itemId: "hotel", amount: 900, visible: false },
    { key: "carte", itemId: "vol", amount: 500, visible: true },
  ]);
});

test("aucun frais de billeterie n’est ajouté ou retiré tout seul", () => {
  assert.equal(automaticTicketingWrites(), false);
});

test("l’outil choisit avec ou sans prix, et refuse un montant manquant", () => {
  assert.deepEqual(mcpPriceChoice({ prix: 320 }), { mode: "avec" });
  assert.deepEqual(mcpPriceChoice({}), { mode: null });
  assert.deepEqual(mcpPriceChoice({ sans_prix: true }), { mode: "sans" });
  assert.deepEqual(mcpPriceChoice({ prix: 0 }), { mode: "sans" });
  const missingPrice = mcpPriceChoice({ avec_prix: true });
  assert.equal("error" in missingPrice ? missingPrice.error : "", "Indiquez le prix de vente.");
  const pricedSans = mcpPriceChoice({ sans_prix: true, prix: 10 });
  assert.equal("error" in pricedSans ? pricedSans.error : "", "Sans prix ne porte pas de montant.");
});
