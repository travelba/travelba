import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileTabBar, SidebarGroups, UserMenu } from "../../components/admin/AdminNavParts";
import { adminNavGroups, openAdminNavGroups } from "./admin-nav";

const counts = { revolut: 3, emails: 2, le: 0, pieces: 1 };

test("la sidebar rend les groupes, l’entrée active et les badges", () => {
  const groups = adminNavGroups({ role: "admin", showExample: true });
  const html = renderToStaticMarkup(
    createElement(SidebarGroups, {
      groups,
      activeHref: "/admin/revolut",
      counts,
      openIds: openAdminNavGroups(groups, ["outils"], "/admin/revolut"),
      onToggle: () => {},
    })
  );
  for (const label of ["Activité", "Clients", "Dossiers", "Argent", "Boîtes de réception", "Outils", "Équipe"]) {
    assert.match(html, new RegExp(label), label);
  }
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="\/admin\/revolut"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/admin\/revolut"/);
  assert.match(html, /href="\/admin\/reservations\b/);
  assert.match(html, /href="\/admin\/clients\?pieces=echeance"/);
  assert.match(html, /<a(?=[^>]*target="_blank")[^>]*href="\/exemple"/);
  assert.match(html, /aria-expanded="false"[^>]*aria-controls="admin-nav-outils"/);
  assert.match(html, /id="admin-nav-outils" hidden/);
  assert.doesNotMatch(html, /Sortir/);
  assert.match(html, />3</);
  assert.match(html, />2</);
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

test("la barre basse a cinq entrées, aria-current et les badges Argent / Plus", () => {
  const html = renderToStaticMarkup(
    createElement(MobileTabBar, { pathname: "/admin/revolut", counts, moreOpen: false, onMore: () => {} })
  );
  for (const label of ["Accueil", "Clients", "Dossiers", "Argent", "Plus"]) assert.match(html, new RegExp(label));
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /aria-controls="admin-more-sheet"/);
  assert.match(html, />3</);
  assert.match(html, />2</);
});
