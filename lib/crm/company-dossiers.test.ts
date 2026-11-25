import assert from "node:assert/strict";
import test from "node:test";
import { openPersonalDossiers } from "./company-dossiers";

test("seuls les dossiers ouverts facturés en particulier sont proposés", () => {
  const rows = openPersonalDossiers([
    { id: "a", reference: "TB-2026-0001", status: "confirmed", payer_kind: "personal", billing_company_id: null },
    { id: "b", reference: "TB-2026-0002", status: "draft", payer_kind: null, billing_company_id: null },
    { id: "c", reference: "TB-2026-0003", status: "confirmed", payer_kind: "company", billing_company_id: "co" },
    { id: "d", reference: "TB-2026-0004", status: "cancelled", payer_kind: "personal", billing_company_id: null },
    { id: "e", reference: "TB-2026-0005", status: "confirmed", payer_kind: "personal", billing_company_id: null, archived_at: "2026-01-01" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"]
  );
});
