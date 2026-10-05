import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientTripBody } from "../../components/account/ClientTripBody";
import { StayExpenses } from "../../components/account/StayExpenses";
import { TripSharePanel } from "../../components/account/TripSharePanel";
import { FoldedRow } from "../../components/crm/FoldedRow";

test("le séjour client suit l’ordre itinéraire, services, visa, coffre, partage, montant", () => {
  const html = renderToStaticMarkup(
    createElement(ClientTripBody, {
      intro: "Couverture",
      itinerary: "Itinéraire",
      services: "À la carte",
      visaRequest: "Demande de visa",
      receivedVisas: "Visas reçus",
      passports: "Coffre",
      share: "Partager le voyage",
      amount: "Montant du séjour",
      expenses: "Dépenses du séjour",
      tail: "Pièces jointes",
    })
  );
  const marks = [
    "Couverture",
    'data-section="itinerary"',
    'data-section="services"',
    'data-section="visa-request"',
    'data-section="received-visas"',
    'data-section="passports"',
    'data-section="share"',
    'data-section="amount"',
    'data-section="expenses"',
    "Pièces jointes",
  ];
  let at = -1;
  for (const mark of marks) {
    const next = html.indexOf(mark);
    assert.ok(next > at, mark);
    at = next;
  }
});

test("la section Dépenses liste le libellé et le montant", () => {
  const html = renderToStaticMarkup(
    createElement(StayExpenses, {
      lines: [
        { id: "fee", title: "Frais d’agence 10 %", amountLabel: "100,00 €" },
        { id: "tip", title: "Pourboire", amountLabel: "40,00 €" },
      ],
    })
  );
  assert.match(html, /Dépenses/);
  assert.match(html, /En plus du montant du séjour/);
  assert.match(html, /Frais d’agence 10 %/);
  assert.match(html, /100,00 €/);
  assert.match(html, /Pourboire/);
  assert.match(html, /40,00 €/);
  assert.equal(renderToStaticMarkup(createElement(StayExpenses, { lines: [] })), "");
});

test("partager le voyage et les visas reçus sont repliés sur une ligne", () => {
  const share = renderToStaticMarkup(
    createElement(TripSharePanel, {
      bookingId: "b1",
      shareUrl: "https://travelba.fr/v/ABCDEFGH",
      companions: [],
    })
  );
  const summary = share.match(/<summary[\s\S]*?<\/summary>/)?.[0] || "";
  assert.match(share, /<details/);
  assert.doesNotMatch(share, /<details[^>]*\sopen(?:=""|\s|>)/);
  assert.match(summary, /Partager le voyage/);
  assert.match(summary, /whitespace-nowrap/);
  assert.doesNotMatch(summary, /Ce lien ouvre/);

  const visas = renderToStaticMarkup(
    createElement(FoldedRow, { title: "Visas reçus" }, "Détail")
  );
  const visaSummary = visas.match(/<summary[\s\S]*?<\/summary>/)?.[0] || "";
  assert.match(visaSummary, /Visas reçus/);
  assert.match(visaSummary, /whitespace-nowrap/);
  assert.doesNotMatch(visas, /<details[^>]*\sopen(?:=""|\s|>)/);
});
