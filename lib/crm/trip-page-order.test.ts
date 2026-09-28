import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientTripBody } from "../../components/account/ClientTripBody";
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
    "Pièces jointes",
  ];
  let at = -1;
  for (const mark of marks) {
    const next = html.indexOf(mark);
    assert.ok(next > at, mark);
    at = next;
  }
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
    createElement(FoldedRow, { title: "Visas reçus", children: "Détail" })
  );
  const visaSummary = visas.match(/<summary[\s\S]*?<\/summary>/)?.[0] || "";
  assert.match(visaSummary, /Visas reçus/);
  assert.match(visaSummary, /whitespace-nowrap/);
  assert.doesNotMatch(visas, /<details[^>]*\sopen(?:=""|\s|>)/);
});
