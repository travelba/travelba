import assert from "node:assert/strict";
import test from "node:test";
import { quoteField, scoreExtractFields } from "./extract-confidence";

test("un champ cité dans le mail est sûr, un champ absent ne l’est pas", () => {
  const source = "Confirmation 64570\nHôtel Portrait, Florence";
  const quoted = quoteField("confirmation", "64570", source);
  assert.equal(quoted.confidence > 0.9, true);
  assert.match(quoted.quote, /64570/);
  const missing = quoteField("hotel", "Four Seasons", source);
  assert.equal(missing.confidence < 0.9, true);
  assert.equal(missing.quote, "");
});

test("la confiance du mail est celle du champ le plus faible", () => {
  const scored = scoreExtractFields(
    {
      title: "Florence",
      items: [{ kind: "hotel", title: "Portrait", confirmation_ref: "64570", details: { hotel_name: "Portrait" } }],
    },
    "Booking Reference 64570\nPortrait\nFlorence"
  );
  assert.equal(scored.confidence > 0.9, true);
  const weak = scoreExtractFields(
    {
      title: "Ville inventée",
      items: [{ kind: "hotel", title: "Portrait", confirmation_ref: "64570", details: {} }],
    },
    "Booking Reference 64570\nPortrait"
  );
  assert.equal(weak.confidence < 0.9, true);
});
