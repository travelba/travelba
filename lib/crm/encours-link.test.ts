import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("accueil client : le bloc Encours ouvre les transactions", () => {
  const src = source("app/mon-compte/page.tsx");
  const at = src.indexOf(">Encours<");
  assert.ok(at >= 0);
  const block = src.slice(at);
  assert.match(block, /Voir les transactions/);
  assert.match(src, /href="\/mon-compte\/transactions"/);
  assert.equal(src.includes("crm_customer_balances"), true);
});

test("accueil agence : les encours négatifs ouvrent les transactions", () => {
  const src = source("app/admin/page.tsx");
  assert.match(src, /hint: "Encours négatifs · voir les transactions"/);
  assert.match(src, /href: "\/admin\/transactions"/);
  assert.match(src, /Math\.max\(0, -Number\(row\.balance\)/);
});

test("fiche client : la carte Encours ouvre le grand livre du client", () => {
  const src = source("app/admin/clients/[id]/page.tsx");
  const card = src.slice(src.indexOf("Encours ${b.currency}"));
  assert.match(card, /Voir les transactions/);
  assert.match(src, /href=\{clientLedgerAdminHref\(c\.id\)\}/);
});
