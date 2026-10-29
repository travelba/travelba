import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_MOBILE_TABS,
  activeAdminNavHref,
  adminNavBadge,
  adminNavGroups,
  adminPageTitle,
  EMPTY_NAV_COUNTS,
  mobileTabActive,
  mobileTabBadge,
  openAdminNavGroups,
  parseCollapsedGroups,
  staffInitials,
  toggleCollapsedGroup,
} from "./admin-nav";

test("cinq entrées puis Réglages ; les agents n’y voient que les modèles et les e-mails", () => {
  const agent = adminNavGroups({ role: "agent", showExample: false });
  assert.deepEqual(
    agent.map((group) => group.label),
    ["Accueil", "Dossiers", "Clients", "Boîte de réception", "Argent", "Réglages"]
  );
  assert.deepEqual(
    agent.find((g) => g.id === "reglages")?.items.map((item) => item.label),
    ["Modèles WhatsApp", "E-mails au client"]
  );
  const admin = adminNavGroups({ role: "admin", showExample: true });
  const reglages = admin.find((g) => g.id === "reglages")!;
  assert.ok(reglages.items.some((item) => item.href === "/admin/equipe"));
  assert.ok(reglages.items.some((item) => item.href === "/admin/reglages/gmail"));
  assert.ok(reglages.items.some((item) => item.href === "/exemple" && item.newTab));
  const partner = adminNavGroups({ role: "partner", showExample: true });
  assert.deepEqual(
    partner.flatMap((group) => group.items.map((item) => item.href)),
    ["/admin/little-emperors"]
  );
});

test("une icône par entrée principale, toutes différentes", () => {
  const groups = adminNavGroups({ role: "admin", showExample: true });
  const icons = groups.map((group) => group.items[0].icon);
  assert.equal(new Set(icons).size, icons.length);
  const boite = groups.find((g) => g.id === "boite")!.items.map((item) => item.icon);
  assert.equal(new Set(boite).size, boite.length);
  const argent = groups.find((g) => g.id === "argent")!.items.map((item) => item.icon);
  assert.equal(new Set(argent).size, argent.length);
});

test("l’entrée active suit le chemin, l’onglet l’emporte, le premier onglet s’allume sans requête", () => {
  const groups = adminNavGroups({ role: "admin" });
  assert.equal(activeAdminNavHref(groups, "/admin"), "/admin");
  assert.equal(activeAdminNavHref(groups, "/admin/clients"), "/admin/clients");
  assert.equal(activeAdminNavHref(groups, "/admin/clients/abc"), "/admin/clients");
  assert.equal(activeAdminNavHref(groups, "/admin/clients", "?filtre=echeance&page=2"), "/admin/clients?filtre=echeance");
  assert.equal(activeAdminNavHref(groups, "/admin/clients", "?filtre=veille"), "/admin/clients");
  assert.equal(activeAdminNavHref(groups, "/admin/boite"), "/admin/boite?onglet=fournisseurs");
  assert.equal(activeAdminNavHref(groups, "/admin/boite", "?onglet=hotels"), "/admin/boite?onglet=hotels");
  assert.equal(activeAdminNavHref(groups, "/admin/argent", "?onglet=a-pointer&source=pliant"), "/admin/argent?onglet=a-pointer");
  assert.equal(activeAdminNavHref(groups, "/admin/argent"), "/admin/argent?onglet=a-encaisser");
  assert.equal(activeAdminNavHref(groups, "/admin/reglages/gmail"), "/admin/reglages/gmail");
  assert.equal(activeAdminNavHref(groups, "/admin/reglages"), "/admin/reglages");
  assert.equal(activeAdminNavHref(groups, "/admin/recherche", "?q=rome"), null);
  assert.equal(activeAdminNavHref(groups, "/admin/reservations/nouveau"), "/admin/reservations");
  assert.equal(activeAdminNavHref(groups, "/admin/reservations", "?vue=formalites"), "/admin/reservations?vue=formalites");
  assert.equal(activeAdminNavHref(groups, "/admin/reservations", "?vue=services"), "/admin/reservations?vue=services");
  assert.equal(activeAdminNavHref(groups, "/admin/reservations", "?vue=liste&q=rome"), "/admin/reservations");
});

test("badges : seulement quand le compte est positif ; À encaisser et Fournisseurs additionnent", () => {
  const counts = { ...EMPTY_NAV_COUNTS, revolut: 3, stripe: 1, le: 1, pieces: 4, whatsapp: 2, hotels: 0, costs: 5 };
  const groups = adminNavGroups({});
  const items = groups.flatMap((group) => group.items);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/argent?onglet=a-encaisser")!, counts), 4);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/argent?onglet=a-pointer")!, counts), 5);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/boite?onglet=fournisseurs")!, counts), 1);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/boite?onglet=hotels")!, counts), null);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/boite?onglet=whatsapp")!, counts), 2);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/clients?filtre=echeance")!, counts), 4);
  assert.equal(adminNavBadge(items.find((i) => i.href === "/admin/clients")!, counts), null);
});

test("groupes repliés : mémorisés, mais celui de la page reste ouvert", () => {
  const groups = adminNavGroups({});
  assert.deepEqual(parseCollapsedGroups(null), []);
  assert.deepEqual(parseCollapsedGroups("{pas du json"), []);
  assert.deepEqual(parseCollapsedGroups('["argent", 3, "reglages"]'), ["argent", "reglages"]);
  const open = openAdminNavGroups(groups, ["argent", "reglages"], "/admin/argent?onglet=a-encaisser");
  assert.ok(open.includes("argent"));
  assert.ok(!open.includes("reglages"));
  assert.deepEqual(toggleCollapsedGroup(["argent"], "argent"), []);
  assert.deepEqual(toggleCollapsedGroup([], "argent"), ["argent"]);
});

test("barre basse : les cinq entrées, Boîte et Argent portent leurs badges", () => {
  assert.deepEqual(
    ADMIN_MOBILE_TABS.map((tab) => tab.label),
    ["Accueil", "Dossiers", "Clients", "Boîte", "Argent"]
  );
  const counts = { ...EMPTY_NAV_COUNTS, revolut: 2, stripe: 1, emails: 5, le: 1, hotels: 2, costs: 4 };
  const argent = ADMIN_MOBILE_TABS.find((tab) => tab.id === "argent")!;
  const boite = ADMIN_MOBILE_TABS.find((tab) => tab.id === "boite")!;
  assert.equal(mobileTabBadge(argent, counts), 7);
  assert.equal(mobileTabBadge(boite, counts), 8);
  assert.equal(mobileTabActive(argent, "/admin/argent"), true);
  assert.equal(mobileTabActive(argent, "/admin/transactions/client/abc"), true);
  assert.equal(mobileTabActive(boite, "/admin/boite"), true);
  assert.equal(mobileTabActive(boite, "/admin/emails"), true);
  assert.equal(mobileTabActive(ADMIN_MOBILE_TABS[0], "/admin/clients"), false);
  assert.equal(mobileTabActive(ADMIN_MOBILE_TABS[0], "/admin"), true);
  const dossiers = ADMIN_MOBILE_TABS.find((tab) => tab.id === "dossiers")!;
  assert.equal(mobileTabActive(dossiers, "/admin/formalites"), true);
  assert.equal(mobileTabActive(dossiers, "/admin/reservations/abc"), true);
  assert.equal(staffInitials("Victoria Bernard"), "VB");
  assert.equal(staffInitials(""), "TB");
});

test("le titre court est le libellé du menu, ou le titre de la page à onglets", () => {
  const groups = adminNavGroups({ role: "admin", showExample: false });
  assert.equal(adminPageTitle(groups, "/admin"), "Accueil");
  assert.equal(adminPageTitle(groups, "/admin/reservations"), "Dossiers");
  assert.equal(adminPageTitle(groups, "/admin/reservations", "?vue=formalites"), "Dossiers");
  assert.equal(adminPageTitle(groups, "/admin/boite", "?onglet=hotels"), "Boîte de réception");
  assert.equal(adminPageTitle(groups, "/admin/argent"), "Argent");
  assert.equal(adminPageTitle(groups, "/admin/reglages/whatsapp"), "Réglages");
  assert.equal(adminPageTitle(groups, "/admin/equipe"), "Équipe");
  assert.equal(adminPageTitle(groups, "/admin/reservations/nouveau"), "Nouveau dossier");
  assert.equal(adminPageTitle(groups, "/admin/reservations/abc-123"), "Dossier");
  assert.equal(adminPageTitle(groups, "/admin/clients/abc"), "Fiche client");
  assert.equal(adminPageTitle(groups, "/admin/clients", "?filtre=echeance"), "Clients");
  assert.equal(adminPageTitle(groups, "/admin/recherche", "?q=x"), "Recherche");
  assert.equal(adminPageTitle(groups, "/admin/inconnu"), "Espace agence");
});
