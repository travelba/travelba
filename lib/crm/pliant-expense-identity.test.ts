import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PliantExpenseIdentity } from "../../components/admin/PliantExpenseIdentity";

test("la liste Pliant montre le dossier et le client avant Benjamin, et revient à la ligne", () => {
  const html = renderToStaticMarkup(
    createElement(PliantExpenseIdentity, {
      dossier: {
        reference: "TB-2026-0088",
        title: "Phuket & Krabi",
        client: "Andréa Bensaïd",
        company: "AB GLOBAL VENTURES",
      },
      holderName: "Benjamin Boukris",
      type: "PURCHASE",
      category: "FOOD_AND_DRINKS",
      href: "/admin/reservations/6ca304b2-ed11-4a68-882f-e6833b07359d?tab=argent",
    })
  );
  const dossier = html.indexOf("TB-2026-0088");
  const client = html.indexOf("Andréa Bensaïd");
  const company = html.indexOf("AB GLOBAL VENTURES");
  const holder = html.indexOf("Benjamin Boukris");
  assert.ok(dossier >= 0 && client > dossier && company > client && holder > company);
  assert.match(html, /break-words/);
  assert.match(html, /text-sm/);
  assert.match(html, /font-semibold/);
  assert.match(html, /Phuket &amp; Krabi|Phuket & Krabi/);
});
