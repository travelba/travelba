import assert from "node:assert/strict";
import { test } from "node:test";
import { conciergeContentDrafts } from "./concierge-notices";
import { connexionMessage } from "./whatsapp";
import { tripShareMessage } from "./trip-share";
import { whatsappCatalog, whatsappCatalogTemplates } from "./whatsapp-catalog";

test("chaque modèle rédigé apparaît dans le récapitulatif", () => {
  const catalog = whatsappCatalog();
  const blob = JSON.stringify(catalog);
  const names = new Set<string>();
  for (const group of catalog) {
    for (const message of group.messages) {
      if (message.bubble.modelName) names.add(message.bubble.modelName);
      if (message.fallback?.modelName) names.add(message.fallback.modelName);
      if (message.earlier?.modelName) names.add(message.earlier.modelName);
    }
  }
  for (const draft of conciergeContentDrafts()) {
    assert.equal(names.has(draft.friendlyName), true, draft.friendlyName);
  }
  assert.match(blob, /connexion_espace/);
  assert.equal(blob.includes("{{"), false);
});

test("les textes qui partent reprennent les fonctions d’envoi", () => {
  const catalog = whatsappCatalog();
  const byId = new Map(catalog.flatMap((group) => group.messages.map((message) => [message.id, message])));
  const connexion = byId.get("connexion");
  assert.equal(connexion?.bubble.body, connexionMessage("Camille"));
  assert.equal(connexion?.bubble.button, "Ouvrir mon espace");
  assert.equal(connexion?.bubble.body.includes("http"), false);

  const stay = byId.get("sejour-photo");
  assert.match(stay?.bubble.body || "", /Votre séjour à Avoriaz, réservation TB-2026-0028, est dans votre espace\./);
  assert.equal(stay?.bubble.photo, true);
  assert.equal(stay?.bubble.button, "Voir le séjour");

  const hotel = byId.get("piece-hotel");
  assert.match(hotel?.bubble.body || "", /confirmation d'hôtel pour le séjour à Avoriaz/);
  assert.equal(hotel?.bubble.photo, true);
  assert.match(hotel?.bubble.image || "", /\/whatsapp\/hotel\.jpg$/);
  assert.equal(hotel?.bubble.imageAlt, "Hôtel TBA");
  assert.match(byId.get("piece-vol")?.bubble.image || "", /\/whatsapp\/billet\.jpg$/);
  assert.match(byId.get("formalite-prete")?.bubble.image || "", /\/whatsapp\/visa\.jpg$/);
  assert.match(byId.get("passeport")?.bubble.image || "", /\/whatsapp\/passeport\.jpg$/);
  assert.equal((hotel?.bubble.image || "").includes("/api/covers/sejour/"), false);
  assert.match(byId.get("sejour-photo")?.bubble.image || "", /\/api\/covers\/sejour\/TB-2026-0028$/);
  assert.match(hotel?.fallback?.body || "", /confirmation d'hôtel pour le séjour à Avoriaz/);
  assert.equal(hotel?.fallback?.photo, false);
  assert.match(hotel?.earlier?.body || "", /Votre confirmation d'hôtel, réservation TB-2026-0028/);
  const hello = byId.get("reponse-Bonjour");
  assert.match(hello?.bubble.image || "", /\/api\/covers\/sejour\/TB-2026-0028$/);
  assert.equal(byId.get("numero-inconnu")?.bubble.image, null);
  assert.equal(byId.get("reponse-Fait absent du dossier")?.bubble.image, null);

  const share = byId.get("partage");
  assert.equal(
    share?.bubble.body,
    tripShareMessage({
      firstName: "Camille",
      title: "Avoriaz",
      url: "https://travelba.fr/v/23456789",
    })
  );

  const attente = catalog.find((group) => group.id === "attente");
  assert.ok(attente);
  assert.equal(attente.messages.every((message) => message.wired === false), true);
  assert.equal(whatsappCatalogTemplates().unwired.has("rappel"), true);
  const missing = byId.get("reponse-Fait absent du dossier");
  assert.match(missing?.bubble.body || "", /Je n’ai pas l’horaire dans votre dossier\./);
  assert.equal(
    catalog.reduce((count, group) => count + group.messages.filter((message) => message.wired).length, 0) > 10,
    true
  );
});
