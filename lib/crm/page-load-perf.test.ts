import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CUSTOMER_PICK_SELECT } from "./customer-search";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pages = [
  "app/admin/reservations/[id]/page.tsx",
  "app/mon-compte/page.tsx",
  "app/mon-compte/reservations/[reference]/page.tsx",
];

describe("page-load-perf", () => {
  it("ne réconcilie pas le foyer sur un GET de page", () => {
    for (const file of pages) {
      const src = readFileSync(join(root, file), "utf8");
      assert.equal(src.includes("reconcileCustomerParty"), false, file);
    }
  });

  it("ne charge pas tout crm_customers sur le détail réservation", () => {
    const src = readFileSync(join(root, "app/admin/reservations/[id]/page.tsx"), "utf8");
    assert.equal(src.includes('.order("last_name")'), false);
    assert.match(src, /\.in\("id", relatedIds\)/);
  });

  it("le sélecteur typeahead n’expose pas l’IBAN", () => {
    assert.equal(CUSTOMER_PICK_SELECT.includes("iban"), false);
    assert.match(CUSTOMER_PICK_SELECT, /first_name/);
    assert.match(CUSTOMER_PICK_SELECT, /company_role/);
  });
});
