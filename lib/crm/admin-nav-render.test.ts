import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileTabBar, SidebarGroups, UserMenu } from "../../components/admin/AdminNavParts";
import { adminNavGroups, EMPTY_NAV_COUNTS, openAdminNavGroups } from "./admin-nav";

const counts = { ...EMPTY_NAV_COUNTS, revolut: 3, emails: 2, pieces: 1 };

test("la sidebar rend les cinq entrées, Réglages, l’entrée active et les badges", () => {
  const groups = adminNavGroups({ role: "admin", showExample: true });
  const active = "/admin/argent?onglet=a-encaisser";
  const html = renderToStaticMarkup(
    createElement(SidebarGroups, {
      groups,
      activeHref: active,
      counts,
      openIds: openAdminNavGroups(groups, ["reglages"], active),
      onToggle: () => {},
    })
  );
  for (const label of ["Accueil", "Dossiers", "Clients", "Boîte de réception", "Argent", "Réglages"]) {
    assert.match(html, new RegExp(label), label);
  }
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /aria-current="page"[^>]*href="\/admin\/argent\?onglet=a-encaisser"/);
  assert.match(html, /href="\/admin\/reservations"/);
  assert.match(html, /href="\/admin\/clients\?pieces=echeance"/);
  assert.match(html, /<a(?=[^>]*target="_blank")[^>]*href="\/exemple"/);
  assert.match(html, /aria-expanded="false"[^>]*aria-controls="admin-nav-reglages"/);
  assert.match(html, /id="admin-nav-reglages" hidden/);
  assert.doesNotMatch(html, /Sortir/);
  assert.match(html, />3</, "À encaisser porte Revolut + Stripe");
  assert.match(html, />2</, "Fournisseurs porte les e-mails");
  assert.match(html, />1</, "Pièces à échéance");
});

test("le menu utilisateur reste fermé au rendu, avec l’avatar en initiales", () => {
  const html = renderToStaticMarkup(
    createElement(UserMenu, { name: "Victoria Bernard", role: "admin", onSignOut: () => {} })
  );
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, />VB</);
  assert.doesNotMatch(html, /role="menu"/);
  assert.doesNotMatch(html, /Déconnexion/);
});

test("la barre basse a cinq liens, aria-current et les badges Boîte et Argent", () => {
  const html = renderToStaticMarkup(createElement(MobileTabBar, { pathname: "/admin/revolut", counts }));
  for (const label of ["Accueil", "Dossiers", "Clients", "Boîte", "Argent"]) assert.match(html, new RegExp(label));
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /aria-current="page"[^>]*href="\/admin\/argent"/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.doesNotMatch(html, /Plus/);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, />3</);
  assert.match(html, />2</);
});
