import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OmnibarMenu } from "../../components/admin/AdminOmnibar";
import {
  OMNIBAR_DEBOUNCE_MS,
  OMNIBAR_LIMIT,
  emptyOmnibar,
  flattenOmnibar,
  foldSearch,
  loadOmnibar,
  omnibarNeedle,
  omnibarOnKey,
  readOmnibarPayload,
  shapeOmnibar,
} from "./omnibar";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const clientId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const companionId = "33333333-3333-4333-8333-333333333333";

test("le repli ignore l’accent, la casse et la ponctuation", () => {
  assert.match(foldSearch("Bensaïd"), /bensaid/);
  assert.match(foldSearch("BENSAID"), /bensaid/);
  assert.match(foldSearch("TB-2026-0088"), /0088/);
  assert.match(foldSearch("TB-2026-0088"), /tb20260088/);
  assert.equal(omnibarNeedle("Bensaïd"), "Bensaïd");
  assert.equal(omnibarNeedle("  0088 "), "0088");
  assert.equal(omnibarNeedle("a"), "");
  assert.equal(omnibarNeedle(" é "), "");
  assert.equal(omnibarNeedle("ab"), "ab");
});

test("la mise en forme groupe clients, dossiers et voyageurs", () => {
  const hit = shapeOmnibar({
    clients: [
      {
        id: clientId,
        first_name: "Sarah",
        last_name: "Bensaïd",
        company_name: "Atelier Bensaïd",
        siret: "12345678901234",
      },
    ],
    dossiers: [
      {
        id: bookingId,
        reference: "TB-2026-0088",
        title: "Avoriaz",
        destination: "Avoriaz",
        start_date: "2026-03-20",
        end_date: "2026-03-27",
        archived_at: null,
      },
    ],
    voyageurs: [
      {
        id: companionId,
        source: "companion",
        first_name: "Léa",
        last_name: "Martin",
        customer_id: clientId,
        relationship: "Conjoint",
        context: "Sarah Bensaïd",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        source: "traveler",
        first_name: "Noa",
        last_name: "Bernard",
        booking_id: bookingId,
        reference: "TB-2026-0088",
        booking_title: "Avoriaz",
      },
    ],
  });
  assert.equal(hit.clients[0].href, `/admin/clients/${clientId}`);
  assert.equal(hit.clients[0].title, "Sarah Bensaïd");
  assert.match(hit.clients[0].subtitle, /Atelier Bensaïd/);
  assert.match(hit.clients[0].subtitle, /SIRET 123 456 789 01234/);
  assert.equal(hit.dossiers[0].href, `/admin/reservations/${bookingId}`);
  assert.match(hit.dossiers[0].title, /TB-2026-0088/);
  assert.match(hit.dossiers[0].title, /Avoriaz/);
  assert.match(hit.dossiers[0].subtitle, /2026/);
  assert.doesNotMatch(hit.dossiers[0].subtitle, /Avoriaz · Avoriaz/);
  assert.equal(hit.voyageurs[0].href, `/admin/clients/${clientId}#accompagnateurs`);
  assert.match(hit.voyageurs[0].subtitle, /Conjoint/);
  assert.equal(hit.voyageurs[1].href, `/admin/reservations/${bookingId}`);
  assert.equal(flattenOmnibar(hit).length, 4);
});

test("chaque groupe s’arrête à cinq, un identifiant invalide est ignoré", () => {
  const clients = Array.from({ length: 8 }, (_, index) => ({
    id: `11111111-1111-4111-8111-11111111111${index}`,
    first_name: "Camille",
    last_name: `Client${index}`,
  }));
  clients[0].id = "pas-un-uuid";
  const hit = shapeOmnibar({ clients, dossiers: [], voyageurs: [] });
  assert.equal(hit.clients.length, OMNIBAR_LIMIT);
  assert.equal(hit.clients[0].title, "Camille Client1");
});

test("Entrée sans sélection garde la recherche complète", () => {
  assert.deepEqual(omnibarOnKey("Enter", { open: true, count: 3, index: -1 }), { type: "submit" });
  assert.deepEqual(omnibarOnKey("Enter", { open: false, count: 3, index: 0 }), { type: "submit" });
  assert.deepEqual(omnibarOnKey("Enter", { open: true, count: 3, index: 1 }), { type: "pick", index: 1 });
  assert.deepEqual(omnibarOnKey("ArrowDown", { open: true, count: 3, index: -1 }), { type: "move", index: 0 });
  assert.deepEqual(omnibarOnKey("ArrowDown", { open: true, count: 3, index: 2 }), { type: "move", index: 0 });
  assert.deepEqual(omnibarOnKey("ArrowUp", { open: true, count: 3, index: 0 }), { type: "move", index: 2 });
  assert.deepEqual(omnibarOnKey("Escape", { open: true, count: 3, index: 0 }), { type: "close" });
  assert.deepEqual(omnibarOnKey("Escape", { open: false, count: 0, index: -1 }), { type: "noop" });
  assert.equal(OMNIBAR_DEBOUNCE_MS, 280);
});

test("le endpoint ne part pas sous deux signes et passe le texte en paramètre", async () => {
  let calls = 0;
  const idle = await loadOmnibar(
    {
      rpc: async () => {
        calls += 1;
        return { data: null, error: null };
      },
    },
    "a"
  );
  assert.deepEqual(idle, emptyOmnibar());
  assert.equal(calls, 0);

  const hit = await loadOmnibar(
    {
      rpc: async (fn, args) => {
        assert.equal(fn, "crm_omnibar_suggest");
        assert.deepEqual(args, { q: "Bensaïd" });
        return {
          data: {
            clients: [{ id: clientId, first_name: "Sarah", last_name: "Bensaïd", company_name: "", siret: "" }],
            dossiers: [],
            voyageurs: [],
          },
          error: null,
        };
      },
    },
    "Bensaïd"
  );
  assert.equal(hit.clients[0].title, "Sarah Bensaïd");

  await assert.rejects(
    () =>
      loadOmnibar(
        {
          rpc: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
        },
        "0088"
      ),
    (error: { code?: string }) => error.code === "42501"
  );
});

test("un lien hors admin est écarté à la lecture", () => {
  const hit = readOmnibarPayload({
    clients: [
      { id: clientId, href: "https://evil.example/admin/clients/x", title: "Piège", subtitle: "" },
      { id: clientId, href: `/admin/clients/${clientId}`, title: "Sarah Bensaïd", subtitle: "Client" },
    ],
    dossiers: [],
    voyageurs: [],
  });
  assert.equal(hit.clients.length, 1);
  assert.equal(hit.clients[0].href, `/admin/clients/${clientId}`);
});

test("la route staff appelle la fonction, le menu reprend les états des autres champs", () => {
  const route = readFileSync(join(root, "app/api/admin/recherche/route.ts"), "utf8");
  assert.match(route, /requireStaff\(/);
  assert.match(route, /loadOmnibar\(/);
  assert.doesNotMatch(route, /\$\{q\}/);
  const sql = readFileSync(join(root, "supabase/migrations/20261018074306_omnibar_search.sql"), "utf8");
  assert.match(sql, /crm_private\.is_staff\(\)/);
  assert.match(sql, /extensions\.gin_trgm_ops/);
  assert.match(sql, /limit 5/g);
  assert.match(sql, /security invoker/);
  const ui = readFileSync(join(root, "components/admin/AdminOmnibar.tsx"), "utf8");
  assert.match(ui, /OMNIBAR_DEBOUNCE_MS/);
  assert.match(ui, /omnibarOnKey/);
  assert.match(ui, /role="combobox"/);
  assert.match(ui, /aria-autocomplete="list"/);
  assert.match(ui, /Recherche…/);
  assert.match(ui, /Aucun client, dossier ni voyageur/);
});

test("le menu affiche les groupes, le chargement, le vide et la ligne active", () => {
  const loading = renderToStaticMarkup(
    createElement(OmnibarMenu, {
      listId: "liste",
      payload: emptyOmnibar(),
      loading: true,
      error: "",
      activeIndex: -1,
      onPick: () => {},
      onHover: () => {},
    })
  );
  assert.match(loading, /Recherche…/);
  assert.match(loading, /role="listbox"/);

  const empty = renderToStaticMarkup(
    createElement(OmnibarMenu, {
      listId: "liste",
      payload: emptyOmnibar(),
      loading: false,
      error: "",
      activeIndex: -1,
      onPick: () => {},
      onHover: () => {},
    })
  );
  assert.match(empty, /Aucun client, dossier ni voyageur/);

  const payload = shapeOmnibar({
    clients: [{ id: clientId, first_name: "Sarah", last_name: "Bensaïd", company_name: "Atelier", siret: "" }],
    dossiers: [
      {
        id: bookingId,
        reference: "TB-2026-0088",
        title: "Avoriaz",
        destination: "Avoriaz",
        start_date: "2026-03-20",
        end_date: "2026-03-27",
      },
    ],
    voyageurs: [
      {
        id: companionId,
        source: "companion",
        first_name: "Léa",
        last_name: "Martin",
        customer_id: clientId,
        context: "Sarah Bensaïd",
      },
    ],
  });
  const html = renderToStaticMarkup(
    createElement(OmnibarMenu, {
      listId: "liste",
      payload,
      loading: false,
      error: "",
      activeIndex: 1,
      onPick: () => {},
      onHover: () => {},
    })
  );
  for (const label of ["Clients", "Dossiers", "Voyageurs"]) assert.match(html, new RegExp(label));
  assert.match(html, /Sarah Bensaïd/);
  assert.match(html, /TB-2026-0088/);
  assert.match(html, /Léa Martin/);
  assert.match(html, /id="liste-1"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="liste-1"/);
  assert.match(html, /Atelier/);
});
