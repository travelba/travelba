import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TripProposalError, TripProposalSearch } from "../../components/admin/TripProposalSearch";
import { tripProposalStatusCopy } from "./trip-costs";

test("la recherche des paiements montre un squelette et la phrase", () => {
  const html = renderToStaticMarkup(createElement(TripProposalSearch));
  assert.match(html, /animate-pulse/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, new RegExp(tripProposalStatusCopy("loading").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /Réessayer/);
  assert.doesNotMatch(html, /Une sortie à rattacher/);
});

test("un échec laisse réessayer sans remplacer le reste du bloc", () => {
  let clicks = 0;
  const html = renderToStaticMarkup(createElement(TripProposalError, { onRetry: () => { clicks += 1; } }));
  assert.match(html, /n’a pas abouti/);
  assert.match(html, /Réessayer/);
  assert.match(html, /<button/);
  assert.equal(clicks, 0);
});
