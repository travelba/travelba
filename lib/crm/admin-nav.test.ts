import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_MOBILE_TABS,
  activeAdminNavHref,
  adminNavBadge,
  adminNavGroups,
  adminPageTitle,
  mobileTabActive,
  moreSheetGroups,
  mobileTabBadge,
  openAdminNavGroups,
  parseCollapsedGroups,
  staffInitials,
  toggleCollapsedGroup,
} from "./admin-nav";

test("le menu est groupé par domaine, Équipe pour les admins, aperçu hors production", () => {
  const agent = adminNavGroups({ role: "agent", showExample: false });
  assert.deepEqual(
    agent.map((group) => group.label),
    ["Activité", "Clients", "Dossiers", "Argent", "Boîtes de réception", "Outils"]
  );
  assert.equal(agent.find((g) => g.id === "outils")?.items.length, 3);
  assert.ok(agent.find((g) => g.id === "outils")?.items.some((item) => item.href === "/admin/outils/mails"));
  const admin = adminNavGroups({ role: "admin", showExample: true });
  assert.equal(admin.at(-1)?.label, "Équipe");
  assert.ok(admin.find((g) => g.id === "outils")?.items.some((item) => item.href === "/exemple" && item.newTab));
});

test("l’entrée active suit le chemin, la requête l’emporte, les ancres ne s’allument pas", () => {
  const groups = adminNavGroups({ role: "admin" });
  assert.equal(activeAdminNavHref(groups, "/admin"), "/admin");
  assert.equal(activeAdminNavHref(groups, "/admin/clients"), "/admin/clients");
  assert.equal(activeAdminNavHref(groups, "/admin/clients/abc"), "/admin/clients");
  assert.equal(activeAdminNavHref(groups, "/admin/clients", "?pieces=echeance&page=2"), "/admin/clients?pieces=echeance");
  assert.equal(activeAdminNavHref(groups, "/admin/transactions/client/abc"), "/admin/transactions");
  assert.equal(activeAdminNavHref(groups, "/admin/outils/gmail"), "/admin/outils/gmail");
  assert.equal(activeAdminNavHref(groups, "/admin/recherche", "?q=rome"), null);
  assert.equal(activeAdminNavHref(groups, "/admin/reservations/nouveau"), "/admin/reservations");
  assert.equal(activeAdminNavHref(groups, "/admin/formalites"), "/admin/formalites");
  assert.equal(activeAdminNavHref(groups, "/admin/services"), "/admin/services");
});

test("badges : seulement quand le compte est positif", () => {
  const counts = { revolut: 3, stripe: 1, emails: 0, le: 1, pieces: 4 };
  const groups = adminNavGroups({});
  const items = groups.flatMap((group) => group.items);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/revolut")!, counts), null);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/stripe")!, counts), null);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/emails")!, counts), null);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/clients?pieces=echeance")!, counts), 4);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/clients")!, counts), null);
});

test("groupes repliés : mémorisés, mais celui de la page reste ouvert", () => {
  const groups = adminNavGroups({});
  assert.deepEqual(parseCollapsedGroups(null), []);
  assert.deepEqual(parseCollapsedGroups("{pas du json"), []);
  assert.deepEqual(parseCollapsedGroups('["argent", 3, "outils"]'), ["argent", "outils"]);
  const open = openAdminNavGroups(groups, ["argent", "outils"], "/admin/revolut");
  assert.ok(open.includes("argent"));
  assert.ok(!open.includes("outils"));
  assert.deepEqual(toggleCollapsedGroup(["argent"], "argent"), []);
  assert.deepEqual(toggleCollapsedGroup([], "argent"), ["argent"]);
});

test("barre basse : cinq entrées, Plus porte les badges des boîtes", () => {
  assert.equal(ADMIN_MOBILE_TABS.length, 5);
  const counts = { revolut: 2, stripe: 1, emails: 5, le: 1, pieces: 0 };
  const argent = ADMIN_MOBILE_TABS.find((tab) => tab.id === "argent")!;
  const plus = ADMIN_MOBILE_TABS.find((tab) => tab.id === "plus")!;
  assert.equal(mobileTabBadge(argent, counts), null);
  assert.equal(mobileTabBadge(plus, counts), 6);
  assert.equal(mobileTabActive(argent, "/admin/revolut"), true);
  assert.equal(mobileTabActive(argent, "/admin/stripe"), true);
  assert.equal(mobileTabActive(plus, "/admin/outils/whatsapp"), true);
  assert.equal(mobileTabActive(ADMIN_MOBILE_TABS[0], "/admin/clients"), false);
  assert.equal(mobileTabActive(ADMIN_MOBILE_TABS[0], "/admin"), true);
  const dossiers = ADMIN_MOBILE_TABS.find((tab) => tab.id === "dossiers")!;
  assert.equal(mobileTabActive(dossiers, "/admin/formalites"), true);
  assert.equal(mobileTabActive(dossiers, "/admin/services"), true);
  assert.equal(staffInitials("Victoria Bernard"), "VB");
  assert.equal(staffInitials(""), "TB");
});

test("le titre court suit la page, la feuille Plus porte boîtes, outils et équipe", () => {
  const groups = adminNavGroups({ role: "admin", showExample: false });
  assert.equal(adminPageTitle(groups, "/admin"), "Tableau de bord");
  assert.equal(adminPageTitle(groups, "/admin/reservations"), "Réservations");
  assert.equal(adminPageTitle(groups, "/admin/formalites"), "Formalités");
  assert.equal(adminPageTitle(groups, "/admin/services"), "Services à confirmer");
  assert.equal(adminPageTitle(groups, "/admin/reservations/nouveau"), "Nouveau dossier");
  assert.equal(adminPageTitle(groups, "/admin/reservations/abc-123"), "Dossier");
  assert.equal(adminPageTitle(groups, "/admin/clients/abc"), "Fiche client");
  assert.equal(adminPageTitle(groups, "/admin/clients", "?pieces=echeance"), "Pièces à échéance");
  assert.equal(adminPageTitle(groups, "/admin/recherche", "?q=x"), "Recherche");
  assert.equal(adminPageTitle(groups, "/admin/inconnu"), "Espace agence");
  assert.deepEqual(
    moreSheetGroups(groups).map((group) => group.id),
    ["boites", "outils", "equipe"]
  );
});
