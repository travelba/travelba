import assert from "node:assert/strict";
import test from "node:test";
import {
  CLUB_FEE_EXAMPLE,
  CLUB_HOTELS,
  CLUB_SCREENS,
  adminPublicPath,
  clubAdminInternalPath,
  clubHotel,
  clubMaquetteRequest,
  findAdmin,
  findMember,
  memberPath,
} from "./club-maquette";

test("la cotisation affichée est un montant d’exemple", () => {
  assert.equal(CLUB_FEE_EXAMPLE.example, true);
  assert.equal(CLUB_FEE_EXAMPLE.euros, 490);
  assert.match(CLUB_FEE_EXAMPLE.reason, /CRM/);
});

test("chaque écran du parcours a une adresse unique", () => {
  const hrefs = CLUB_SCREENS.map((screen) => screen.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(CLUB_SCREENS.some((screen) => screen.href === "/maquette/club/accueil"));
  assert.ok(CLUB_SCREENS.some((screen) => screen.href === "/admin/maquette-club/tableau"));
  assert.equal(findMember("/maquette/club")?.id, "index");
  assert.equal(findMember(memberPath(["tarif"]))?.id, "rate");
  assert.equal(findMember("/maquette/club/hotel/villa-brume")?.hotelSlug, "villa-brume");
  assert.equal(findMember("/maquette/club/hotel/inconnu"), null);
  assert.equal(findAdmin(adminPublicPath(["inscriptions"]))?.id, "admin-queue");
  assert.equal(findAdmin("/maquette/club/accueil"), null);
  assert.equal(clubHotel("palais-serein")?.city, "Rome");
  assert.equal(CLUB_HOTELS.length, 3);
});

test("la maquette est fermée en production et l’admin ne passe pas par la session", () => {
  assert.equal(clubMaquetteRequest("/fr", "production"), "ignore");
  assert.equal(clubMaquetteRequest("/admin", "preview"), "ignore");
  assert.equal(clubMaquetteRequest("/maquette/club", "production"), "redirect");
  assert.equal(clubMaquetteRequest("/admin/maquette-club/tableau", "production"), "redirect");
  assert.equal(clubMaquetteRequest("/maquette/club/recherche", "preview"), "next");
  assert.equal(clubMaquetteRequest("/maquette/club", undefined), "next");
  assert.equal(clubMaquetteRequest("/admin/maquette-club", "preview"), "next");
  assert.equal(
    clubAdminInternalPath("/admin/maquette-club/membres/lea-exemplaire"),
    "/maquette/admin-club/membres/lea-exemplaire"
  );
});
