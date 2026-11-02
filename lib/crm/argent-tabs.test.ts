import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArgentTabs } from "@/components/admin/argent/ArgentTabs";
import {
  ARGENT_TAB_IDS,
  ARGENT_TAB_LABELS,
  argentHref,
  argentTabFromParam,
  LEGACY_ARGENT_ROUTES,
  pointerViewFromParam,
} from "./argent-tabs";

const root = process.cwd();

describe("Argent : quatre onglets, un par geste", () => {
  it("les onglets sont À encaisser, À pointer, Grand livre, Comptes", () => {
    assert.deepEqual(ARGENT_TAB_IDS, ["a-encaisser", "a-pointer", "grand-livre", "comptes"]);
    assert.deepEqual(Object.values(ARGENT_TAB_LABELS), ["À encaisser", "À pointer", "Grand livre", "Comptes"]);
  });

  it("un paramètre inconnu ou absent ouvre À encaisser ; les anciens noms sont des alias", () => {
    assert.equal(argentTabFromParam(undefined), "a-encaisser");
    assert.equal(argentTabFromParam("n-importe-quoi"), "a-encaisser");
    assert.equal(argentTabFromParam(["comptes"]), "comptes");
    assert.equal(argentTabFromParam("revolut"), "a-encaisser");
    assert.equal(argentTabFromParam("pliant"), "a-pointer");
    assert.equal(argentTabFromParam("transactions"), "grand-livre");
    assert.equal(pointerViewFromParam("pliant"), "pliant");
    assert.equal(pointerViewFromParam("autre"), "file");
  });

  it("argentHref garde les paramètres non vides, dans l’ordre onglet d’abord", () => {
    assert.equal(argentHref("a-pointer"), "/admin/argent?onglet=a-pointer");
    assert.equal(
      argentHref("a-encaisser", { client: "abc", connected: null, error: undefined }),
      "/admin/argent?onglet=a-encaisser&client=abc"
    );
  });

  it("chaque ancienne page redirige vers son onglet", () => {
    for (const [route, tab] of Object.entries(LEGACY_ARGENT_ROUTES)) {
      const source = readFileSync(join(root, `app${route}/page.tsx`), "utf8");
      assert.match(source, /redirect\(/, route);
      assert.ok(source.includes(`argentHref("${tab}"`), `${route} → ${tab}`);
    }
    assert.ok(readFileSync(join(root, "app/admin/pliant/page.tsx"), "utf8").includes('vue: "pliant"'));
  });

  it("la barre d’onglets marque l’onglet ouvert et porte les pastilles", () => {
    const html = renderToStaticMarkup(
      createElement(ArgentTabs, { active: "a-pointer", counts: { "a-encaisser": 3, "a-pointer": 120 } })
    );
    assert.match(html, /aria-current="page"[^>]*href="\/admin\/argent\?onglet=a-pointer"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, />3</);
    assert.match(html, />99\+</);
    assert.equal(html.includes("Transactions"), false);
  });

  it("les statuts parlent le même français partout : À encaisser, Encaissé, Refusé, À pointer", () => {
    const revolut = readFileSync(join(root, "lib/crm/revolut-labels.ts"), "utf8");
    const stripe = readFileSync(join(root, "lib/crm/stripe-labels.ts"), "utf8");
    for (const source of [revolut, stripe]) {
      assert.match(source, /"À encaisser"/);
      assert.match(source, /"Encaissé"/);
      assert.match(source, /"Refusé"/);
      assert.equal(/À rapprocher|Rapproché|Ignoré/.test(source), false);
    }
  });

  it("la fiche client renvoie vers À encaisser et ne crédite plus sur place", () => {
    const fiche = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
    assert.match(fiche, /ClientPaymentsToCredit/);
    assert.equal(/ClientRevolutSuggestions|ClientStripeSuggestions/.test(fiche), false);
    const link = readFileSync(join(root, "components/admin/argent/ClientPaymentsToCredit.tsx"), "utf8");
    assert.match(link, /argentHref\("a-encaisser", \{ client: customerId \}\)/);
    assert.equal(link.includes("fetch("), false);
  });
});
