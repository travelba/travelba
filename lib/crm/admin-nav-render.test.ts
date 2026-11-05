import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSignOutButton } from "../../components/admin/AdminSignOutButton";
import { MobileTabBar, SidebarGroups, UserMenu, UserMenuPanel } from "../../components/admin/AdminNavParts";
import { AccountMenuPanel } from "../../components/account/AccountUserMenu";
import { SignOutButton } from "../../components/account/SignOutButton";
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
  assert.match(html, /href="\/admin\/reservations\?vue=formalites"/);
  assert.match(html, /href="\/admin\/reservations\?vue=services"/);
  assert.match(html, /href="\/admin\/clients\?filtre=echeance"/);
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
  assert.doesNotMatch(html, /Déconnexion|Se déconnecter/);
});

test("le menu ouvert est fixed et montre Se déconnecter sous Réglages", () => {
  const html = renderToStaticMarkup(
    createElement(UserMenuPanel, {
      id: "menu-agence",
      name: "Victoria Bernard",
      role: "admin",
      onClose: () => {},
      onSignOut: () => {},
      style: { top: 120, left: 80 },
    })
  );
  assert.match(html, /Victoria Bernard/);
  assert.match(html, /Réglages/);
  assert.match(html, /WhatsApp agence/);
  assert.match(html, /Se déconnecter/);
  assert.match(html, /class="fixed /);
  assert.match(html, /safe-area-inset-bottom/);
  assert.doesNotMatch(html, /absolute top-12/);
  assert.doesNotMatch(html, /Sortir/);
});

test("le bouton de Réglages reste au-dessus de la barre et de la bulle", () => {
  const html = renderToStaticMarkup(createElement(AdminSignOutButton));
  assert.match(html, /Se déconnecter/);
  assert.match(html, /pb-\[calc\(4rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  assert.match(html, /lg:pb-2/);
});

test("l’espace client a Se déconnecter dans le menu et en bas de Vous", () => {
  const menu = renderToStaticMarkup(
    createElement(AccountMenuPanel, {
      id: "menu-client",
      href: "/mon-compte/profil",
      transition: "nav-fade",
      onClose: () => {},
      onSignOut: () => {},
    })
  );
  assert.match(menu, /Mon compte/);
  assert.match(menu, /href="\/mon-compte\/profil"/);
  assert.match(menu, /Se déconnecter/);
  assert.match(menu, /class="fixed /);
  assert.match(menu, /safe-area-inset-bottom/);
  const page = renderToStaticMarkup(createElement(SignOutButton));
  assert.match(page, /Se déconnecter/);
  assert.doesNotMatch(page, />Déconnexion</);
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
