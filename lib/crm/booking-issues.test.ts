import assert from "node:assert/strict";
import test from "node:test";
import {
  collectExtractIssues,
  collectManualCreateIssues,
  collectPublishIssues,
  issuesSummary,
} from "./booking-issues";

test("création manuelle : client et titre obligatoires", () => {
  const issues = collectManualCreateIssues({ customerId: "", title: "" });
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /client/i);
  assert.match(issues[1].message, /titre/i);
  assert.equal(collectManualCreateIssues({ customerId: "c1", title: "Marrakech" }).length, 0);
});

test("extrait identité bloque, les passagers du PDF sont enregistrés même hors foyer", () => {
  const identity = collectExtractIssues({ document_status: "identity", items: [] });
  assert.match(identity[0].message, /identité/);
  assert.equal(identity.some((issue) => /prix du document/i.test(issue.message)), false);
  assert.equal(
    collectExtractIssues({
      items: [{ title: "Vol" }],
    }).length,
    0
  );
});

test("prix document facultatif : hôtel, vol et transfert sans montant n’empêchent pas l’enregistrement", () => {
  const card = {
    title: "Nantipa",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: 900,
  };
  const missing = collectExtractIssues({
    items: [
      { ...card, kind: "hotel", details: {} },
      { ...card, kind: "flight", title: "Paris → Tel Aviv", details: { document_currency: "USD" } },
      { ...card, kind: "transfer", title: "Talixo", details: { document_amount: 0 } },
      { ...card, kind: "visa", title: "ETA", details: {} },
    ],
  });
  assert.equal(missing.length, 0);
  const priced = collectExtractIssues({
    items: [
      {
        kind: "flight",
        title: "Orly → Tel Aviv",
        amount: null,
        details: { document_amount: "247.96", document_currency: "EUR" },
      },
      { kind: "checkin", title: "Enregistrement", details: {} },
    ],
  });
  assert.equal(priced.length, 0);
});

test("carte sans titre et publication sans carte métier", () => {
  const empty = collectExtractIssues({ items: [{ title: "  " }] });
  assert.match(empty[0].message, /titre/);
  assert.equal(collectPublishIssues([{ kind: "fee" }]).length, 1);
  assert.equal(collectPublishIssues([{ kind: "expense" }]).length, 1);
  assert.equal(collectPublishIssues([{ kind: "hotel" }]).length, 0);
  assert.match(issuesSummary([{ field: "a", message: "Un" }, { field: "b", message: "Deux" }]), /2 points/);
});
