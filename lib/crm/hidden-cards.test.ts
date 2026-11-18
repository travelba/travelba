import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HiddenCardBadge, HiddenCardsCounter } from "../../components/admin/HiddenCards";
import { cardHiddenFromClient, hiddenCardsLabel, hiddenClientCards, type ClientHiddenCard } from "./carnet";

function card(partial: Partial<ClientHiddenCard> & Pick<ClientHiddenCard, "kind">): ClientHiddenCard {
  return { id: partial.id, lifecycle: "active", visible_to_client: true, details: {}, ...partial };
}

describe("cartes cachées au client", () => {
  it("repère une carte cachée, et une carte non montrée sur un séjour déjà visible", () => {
    const hiddenStay = card({ id: "mail", kind: "hotel", visible_to_client: false, details: { client_hidden: true } });
    const pending = card({ id: "nuit", kind: "hotel", visible_to_client: false });
    const shown = card({ id: "vol", kind: "flight", visible_to_client: true });
    const fee = card({ id: "frais", kind: "fee", visible_to_client: false, details: { client_hidden: true } });
    const retired = card({
      id: "ancien",
      kind: "hotel",
      lifecycle: "cancelled",
      visible_to_client: false,
      details: { client_hidden: true },
    });

    assert.equal(cardHiddenFromClient(hiddenStay, false), true);
    assert.equal(cardHiddenFromClient(pending, false), false);
    assert.equal(cardHiddenFromClient(pending, true), true);
    assert.equal(cardHiddenFromClient(shown, true), false);
    assert.equal(cardHiddenFromClient(fee, true), false);
    assert.equal(cardHiddenFromClient(retired, true), false);

    const listed = hiddenClientCards([shown, hiddenStay, pending, fee], true);
    assert.deepEqual(
      listed.map((row) => row.id),
      ["mail", "nuit"]
    );
    assert.equal(listed[0]?.id, "mail");
  });

  it("accorde le compteur, et le retire quand tout est montré", () => {
    assert.equal(hiddenCardsLabel(0), null);
    assert.equal(hiddenCardsLabel(1), "1 carte cachée");
    assert.equal(hiddenCardsLabel(3), "3 cartes cachées");
  });

  it("rend le badge et le compteur", () => {
    const badge = renderToStaticMarkup(createElement(HiddenCardBadge));
    assert.match(badge, /Caché au client/);
    assert.match(badge, /eye_off|svg/);

    const one = renderToStaticMarkup(createElement(HiddenCardsCounter, { count: 1, onJump: () => {} }));
    assert.match(one, /1 carte cachée/);
    assert.match(one, /<button/);
    assert.doesNotMatch(one, /1 cartes/);

    const many = renderToStaticMarkup(createElement(HiddenCardsCounter, { count: 2, onJump: () => {} }));
    assert.match(many, /2 cartes cachées/);
    assert.equal(renderToStaticMarkup(createElement(HiddenCardsCounter, { count: 0, onJump: () => {} })), "");
  });
});
