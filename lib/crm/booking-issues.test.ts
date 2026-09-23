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
  assert.equal(
    collectExtractIssues({
      items: [{ title: "Vol" }],
    }).length,
    0
  );
});

test("carte sans titre et publication sans carte métier", () => {
  const empty = collectExtractIssues({ items: [{ title: "  " }] });
  assert.match(empty[0].message, /titre/);
  assert.equal(collectPublishIssues([{ kind: "fee" }]).length, 1);
  assert.equal(collectPublishIssues([{ kind: "expense" }]).length, 1);
  assert.equal(collectPublishIssues([{ kind: "hotel" }]).length, 0);
  assert.match(issuesSummary([{ field: "a", message: "Un" }, { field: "b", message: "Deux" }]), /2 points/);
});
