import assert from "node:assert/strict";
import test from "node:test";
import { agencyAlerts } from "./agency-alerts";

test("un e-mail et un WhatsApp deviennent chacun une alerte, sans adresse", () => {
  const alerts = agencyAlerts({
    emails: [{ id: "m1", subject: "Confirmation Sofitel", receivedAt: "2026-10-26T12:00:00.000Z" }],
    chats: [{ id: "w1", body: "Bonjour, le vol est décalé.", createdAt: "2026-10-26T12:05:00.000Z" }],
  });
  assert.deepEqual(
    alerts.map((row) => row.kicker),
    ["E-mail", "WhatsApp"]
  );
  assert.equal(alerts[0]?.href, "/admin/emails");
  assert.equal(alerts[0]?.title, "Confirmation Sofitel");
  assert.equal(alerts[1]?.body, "Bonjour, le vol est décalé.");
  assert.equal(alerts[1]?.href, "/admin/whatsapp");
  assert.equal(JSON.stringify(alerts).includes("@"), false);
});

test("un objet vide et un message vide restent annoncés", () => {
  const alerts = agencyAlerts({
    emails: [{ id: "", subject: "x", receivedAt: "2026-10-26T12:00:00.000Z" }, { id: "m2", subject: "  ", receivedAt: "2026-10-26T12:01:00.000Z" }],
    chats: [{ id: "w2", body: "   ", createdAt: "2026-10-26T12:02:00.000Z" }],
  });
  assert.equal(alerts[0]?.title, "Message reçu");
  assert.equal(alerts[1]?.body, "Un message WhatsApp est arrivé.");
});
