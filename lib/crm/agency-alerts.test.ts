import assert from "node:assert/strict";
import test from "node:test";
import { agencyAlerts, receivedPaymentPopup } from "./agency-alerts";

test("un e-mail et un WhatsApp deviennent chacun une alerte, sans adresse", () => {
  const alerts = agencyAlerts({
    emails: [{ id: "m1", subject: "Confirmation Sofitel", receivedAt: "2026-10-26T12:00:00.000Z" }],
    chats: [{ id: "w1", body: "Bonjour, le vol est décalé.", createdAt: "2026-10-26T12:05:00.000Z" }],
  });
  assert.deepEqual(
    alerts.map((row) => row.kicker),
    ["E-mail", "WhatsApp"]
  );
  assert.equal(alerts[0]?.href, "/admin/boite?onglet=fournisseurs");
  assert.equal(alerts[0]?.title, "Confirmation Sofitel");
  assert.equal(alerts[1]?.body, "Bonjour, le vol est décalé.");
  assert.equal(alerts[1]?.href, "/admin/boite?onglet=whatsapp&filtre=non-lus");
  assert.equal(JSON.stringify(alerts).includes("@"), false);
});

test("un doublon de billets ouvre le dossier, sans nom de passager", () => {
  const alerts = agencyAlerts({
    emails: [],
    chats: [],
    tickets: [{ id: "item-1", at: "2026-11-17T09:30:00.000Z", bookingId: "stay-1", reference: "TB-2026-0206" }],
  });
  assert.equal(alerts[0]?.kicker, "Billet");
  assert.equal(alerts[0]?.title, "Possible doublon de billets");
  assert.equal(alerts[0]?.href, "/admin/reservations/stay-1");
  assert.match(alerts[0]?.body || "", /TB-2026-0206/);
});

test("une modification du concierge ouvre le dossier", () => {
  const alerts = agencyAlerts({
    emails: [],
    chats: [],
    changes: [
      {
        id: "a1",
        summary: "J’ai ajouté le numéro de Victoria : +33 6 12 34 56 78.",
        createdAt: "2026-10-27T10:00:00.000Z",
        bookingId: "stay-1",
      },
    ],
  });
  assert.equal(alerts[0]?.kicker, "Concierge");
  assert.equal(alerts[0]?.href, "/admin/reservations/stay-1");
  assert.match(alerts[0]?.body || "", /Victoria/);
  assert.equal(alerts[0]?.title, "Modification du concierge");
});

test("un WhatsApp rattaché à un dossier ouvre le séjour, sans numéro", () => {
  const alerts = agencyAlerts({
    emails: [],
    chats: [
      {
        id: "w9",
        body: "Où est mon transfert ?",
        createdAt: "2026-11-02T08:00:00.000Z",
        bookingId: "11111111-1111-4111-8111-111111111111",
      },
    ],
  });
  assert.equal(alerts[0]?.href, "/admin/reservations/11111111-1111-4111-8111-111111111111?tab=whatsapp");
  assert.equal(alerts[0]?.id, "wa:w9");
  assert.equal(JSON.stringify(alerts).includes("+33"), false);
});

test("chaque type d’alerte du journal ouvre une page, sans IBAN", () => {
  const booking = "22222222-2222-4222-8222-222222222222";
  const client = "33333333-3333-4333-8333-333333333333";
  const alerts = agencyAlerts({
    emails: [],
    chats: [],
    payments: [
      { id: "p1", summary: "Virement reçu", createdAt: "2026-11-02T09:00:00.000Z", customerId: client },
      {
        id: "p2",
        summary: "Prélèvement SEPA reçu",
        createdAt: "2026-11-02T09:01:00.000Z",
        customerId: null,
        queue: true,
      },
    ],
    stored: [
      {
        id: "c1",
        kind: "card_reveal",
        summary: "Carte ouverte (numéro complet).",
        createdAt: "2026-11-02T09:02:00.000Z",
        entityType: "card",
        entityId: booking,
      },
      {
        id: "r1",
        kind: "role_change",
        summary: "Rôle modifié.",
        createdAt: "2026-11-02T09:03:00.000Z",
        entityType: "user",
        entityId: client,
      },
      {
        id: "pl1",
        kind: "pliant",
        summary: "Lecture du compte refusée. FR76 3000 6000 0112 3456 7890 189",
        createdAt: "2026-11-02T09:04:00.000Z",
        entityType: "card",
        entityId: null,
      },
      {
        id: "x1",
        kind: "inconnu",
        summary: "",
        createdAt: "2026-11-02T09:05:00.000Z",
        entityType: null,
        entityId: null,
      },
    ],
  });
  const byId = Object.fromEntries(alerts.map((row) => [row.id, row]));
  assert.equal(byId["pay:p1"]?.href, `/admin/clients/${client}`);
  assert.equal(byId["pay:p1"]?.title, "Paiement client");
  assert.equal(byId["pay:p2"]?.href, "/admin/argent?onglet=a-encaisser");
  assert.equal(byId["pay:p2"]?.title, "Prélèvement SEPA");
  assert.equal(byId["alert:c1"]?.href, `/admin/reservations/${booking}`);
  assert.equal(byId["alert:c1"]?.kicker, "Carte ouverte");
  assert.equal(byId["alert:r1"]?.href, "/admin/equipe");
  assert.equal(byId["alert:pl1"]?.href, "/admin/journal");
  assert.equal(byId["alert:pl1"]?.body.includes("FR76"), false);
  assert.equal(byId["alert:x1"]?.title, "Alerte");
  assert.equal(byId["alert:x1"]?.href, "/admin/journal");
});

test("la fenêtre ne prend qu’un encaissement reçu", () => {
  const wire = receivedPaymentPopup({
    id: "w",
    kind: "payment",
    summary: "Virement reçu · 1 200 € · Cabinet",
    createdAt: "2026-11-20T09:00:00.000Z",
    entityType: "revolut",
    entityId: "tx-1",
  });
  const card = receivedPaymentPopup({
    id: "s",
    kind: "payment",
    summary: "Camille a réglé 400 € par carte.",
    createdAt: "2026-11-20T09:01:00.000Z",
    entityType: "client",
    entityId: "33333333-3333-4333-8333-333333333333",
  });
  const pliant = receivedPaymentPopup({
    id: "pl",
    kind: "pliant",
    summary: "Little Emperors a annulé le séjour TB-2026-1.",
    createdAt: "2026-11-20T09:02:00.000Z",
    entityType: "card",
    entityId: null,
  });
  const seuil = receivedPaymentPopup({
    id: "big",
    kind: "payment",
    summary: "Paiement de 6 000 €, au-dessus du seuil.",
    createdAt: "2026-11-20T09:03:00.000Z",
    entityType: "finance",
    entityId: null,
  });
  const refused = receivedPaymentPopup({
    id: "no",
    kind: "payment",
    summary: "Camille : paiement refusé · 400 € · carte.",
    createdAt: "2026-11-20T09:04:00.000Z",
    entityType: "client",
    entityId: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(wire?.kicker, "Paiement");
  assert.equal(wire?.href, "/admin/argent?onglet=a-encaisser");
  assert.match(card?.body || "", /a réglé/);
  assert.equal(pliant, null);
  assert.equal(seuil, null);
  assert.equal(refused, null);
});

test("un objet vide et un message vide restent annoncés", () => {
  const alerts = agencyAlerts({
    emails: [{ id: "", subject: "x", receivedAt: "2026-10-26T12:00:00.000Z" }, { id: "m2", subject: "  ", receivedAt: "2026-10-26T12:01:00.000Z" }],
    chats: [{ id: "w2", body: "   ", createdAt: "2026-10-26T12:02:00.000Z" }],
  });
  assert.equal(alerts[0]?.title, "Message reçu");
  assert.equal(alerts[1]?.body, "Un message WhatsApp est arrivé.");
});
