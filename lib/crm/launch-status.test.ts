import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingsListEmptyMessage,
  buildLaunchItems,
  ledgerEmptyMessage,
  revolutInboxEmptyMessage,
  visibleLaunchItems,
  type LaunchSnapshot,
} from "./launch-status";

const prodGap: LaunchSnapshot = {
  customerCount: 2,
  customersWithoutPhone: 2,
  bookingCount: 0,
  publishedCount: 0,
  revolutConfigured: true,
  revolutConnected: false,
  stripeConfigured: false,
  stripeWebhookConfigured: false,
};

test("prod vide : carnet + Revolut bloquent, téléphone et Stripe en option", () => {
  const items = buildLaunchItems(prodGap);
  const visible = visibleLaunchItems(items);
  assert.deepEqual(
    visible.map((item) => item.id),
    ["carnet", "phone", "revolut", "stripe"]
  );
  assert.equal(visible.find((item) => item.id === "carnet")?.optional, false);
  assert.equal(visible.find((item) => item.id === "revolut")?.optional, false);
  assert.equal(visible.find((item) => item.id === "phone")?.optional, true);
  assert.equal(visible.find((item) => item.id === "stripe")?.optional, true);
  assert.match(visible.find((item) => item.id === "carnet")!.description, /Pas de séjour fictif/);
  assert.match(visible.find((item) => item.id === "revolut")!.description, /Connecter Revolut/);
  assert.match(visible.find((item) => item.id === "phone")!.description, /Ne pas inventer/);
  assert.match(visible.find((item) => item.id === "stripe")!.description, /Cartes fermées/);
});

test("brouillon sans publication : encore le geste Publier", () => {
  const items = buildLaunchItems({ ...prodGap, bookingCount: 1, publishedCount: 0 });
  const carnet = items.find((item) => item.id === "carnet")!;
  assert.equal(carnet.done, false);
  assert.match(carnet.description, /brouillon/);
});

test("carnet publié et Revolut connecté : la carte se masque", () => {
  const items = buildLaunchItems({
    ...prodGap,
    customersWithoutPhone: 0,
    bookingCount: 1,
    publishedCount: 1,
    revolutConnected: true,
  });
  assert.equal(visibleLaunchItems(items).length, 0);
});

test("Revolut encore déconnecté garde la carte même avec un carnet publié", () => {
  const items = buildLaunchItems({
    ...prodGap,
    bookingCount: 1,
    publishedCount: 1,
  });
  assert.deepEqual(
    visibleLaunchItems(items).map((item) => item.id),
    ["phone", "revolut", "stripe"]
  );
});

test("zéro client : fiche titulaire requise, pas de client fictif", () => {
  const items = buildLaunchItems({ ...prodGap, customerCount: 0, customersWithoutPhone: 0 });
  const customers = items.find((item) => item.id === "customers")!;
  assert.equal(customers.done, false);
  assert.match(customers.description, /Pas de client fictif/);
  assert.ok(visibleLaunchItems(items).some((item) => item.id === "customers"));
});

test("Revolut connecté : uniquement les crédits reçus", () => {
  const items = buildLaunchItems({ ...prodGap, revolutConnected: true });
  const revolut = items.find((item) => item.id === "revolut")!;
  assert.match(revolut.description, /crédits reçus/);
});

test("inbox Revolut : connecter d’abord, auto si sans ambiguïté", () => {
  assert.match(revolutInboxEmptyMessage({ configured: false, connected: false }), /non installée côté serveur/);
  assert.match(
    revolutInboxEmptyMessage({ configured: true, connected: false }),
    /Connecter Revolut/
  );
  assert.match(
    revolutInboxEmptyMessage({ configured: true, connected: true }),
    /rapprochés automatiquement/
  );
});

test("listes vides : distinguer absence réelle et filtre", () => {
  assert.match(bookingsListEmptyMessage(false), /Visible dans l’espace/);
  assert.equal(bookingsListEmptyMessage(true), "Aucune réservation trouvée.");
  assert.match(ledgerEmptyMessage(false), /virement crédit/);
  assert.equal(ledgerEmptyMessage(true), "Aucun virement pour ces filtres.");
});
