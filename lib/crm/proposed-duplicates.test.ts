import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposedDuplicates, proposedDuplicateHeading } from "../../components/admin/ProposedDuplicates";

const rows = [
  { id: "hotel-a", label: "Casa Test" },
  { id: "ticket", label: "Fw: reçu de billet MARTIN" },
  { id: "hotel-b", label: "Four Seasons Hotel Milan" },
];

function summaryOf(html: string) {
  return html.match(/<summary[\s\S]*?<\/summary>/)?.[0] || "";
}

test("le bandeau fermé annonce les doublons et leur nombre", () => {
  assert.equal(proposedDuplicateHeading(1), "1 doublon");
  assert.equal(proposedDuplicateHeading(5), "5 doublons");

  const html = renderToStaticMarkup(
    createElement(ProposedDuplicates, {
      duplicates: rows,
      onDismiss: () => {},
    })
  );
  const summary = summaryOf(html);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=""|\s|>)/);
  assert.match(summary, /3 doublons/);
  assert.doesNotMatch(summary, /Écarter/);
  assert.doesNotMatch(summary, /Casa Test/);
  assert.match(html, /Casa Test/);
  assert.match(html, /Fw: reçu de billet MARTIN/);
  assert.equal((html.match(/Écarter/g) || []).length, 3);
});

test("un seul doublon reste au singulier, et la liste vide ne s’affiche pas", () => {
  const one = renderToStaticMarkup(
    createElement(ProposedDuplicates, {
      duplicates: [{ id: "only", label: "Casa Test" }],
      onDismiss: () => {},
    })
  );
  assert.match(summaryOf(one), /1 doublon/);
  assert.doesNotMatch(summaryOf(one), /1 doublons/);
  assert.equal((one.match(/Écarter/g) || []).length, 1);
  assert.equal(
    renderToStaticMarkup(createElement(ProposedDuplicates, { duplicates: [], onDismiss: () => {} })),
    ""
  );
});
