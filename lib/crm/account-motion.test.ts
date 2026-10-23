import assert from "node:assert/strict";
import test from "node:test";
import { accountTabDirection, accountTabIndex, stayTransitionName } from "./account-motion";

const base = "/mon-compte";

test("l’index suit l’ordre des onglets, y compris le détail", () => {
  assert.equal(accountTabIndex("/mon-compte", base), 0);
  assert.equal(accountTabIndex("/mon-compte/reservations", base), 1);
  assert.equal(accountTabIndex("/mon-compte/hotels", base), 2);
  assert.equal(accountTabIndex("/mon-compte/reservations/TB1", base), 1);
  assert.equal(accountTabIndex("/mon-compte/transactions", base), 3);
  assert.equal(accountTabIndex("/mon-compte/profil/documents", base), 4);
  assert.equal(accountTabIndex("/admin", base), -1);
});

test("aller vers la droite entre par la droite, le retour inverse", () => {
  assert.equal(accountTabDirection("/mon-compte", "/mon-compte/reservations", base), "nav-forward");
  assert.equal(accountTabDirection("/mon-compte/profil", "/mon-compte/transactions", base), "nav-back");
  assert.equal(
    accountTabDirection("/mon-compte/reservations/TB1", "/mon-compte", base),
    "nav-back"
  );
});

test("quitter un détail pour sa liste est un retour, le profil reste un fondu", () => {
  assert.equal(
    accountTabDirection("/mon-compte/reservations/TB1", "/mon-compte/reservations", base),
    "nav-back"
  );
  assert.equal(
    accountTabDirection("/mon-compte/profil", "/mon-compte/profil/documents", base),
    "nav-fade"
  );
});

test("le nom de couverture reste un identifiant", () => {
  assert.equal(stayTransitionName("TB-12"), "stay-TB-12");
  assert.equal(stayTransitionName("A B"), "stay-AB");
});
