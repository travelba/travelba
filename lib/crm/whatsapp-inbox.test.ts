import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedManualTemplates,
  deliveryCaption,
  deliveryLabel,
  draftTemplateRefused,
  filterThreads,
  conversationBadge,
  foldThreads,
  messageSpeaker,
  messagesNewestFirst,
  sessionWindowOpen,
  type InboxMessage,
} from "./whatsapp-inbox";

function message(patch: Partial<InboxMessage> & Pick<InboxMessage, "id" | "createdAt" | "direction" | "body">): InboxMessage {
  return {
    phone: "+33601020304",
    customerId: "c1",
    customerName: "Camille Martin",
    bookingId: "b1",
    bookingReference: "TB-1",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
    ...patch,
  };
}

test("le fil regroupe, marque le non-lu et distingue robot, agence et escalade", () => {
  const threads = foldThreads(
    [
      message({ id: "1", createdAt: "2026-10-20T08:00:00Z", direction: "inbound", body: "Bonjour" }),
      message({
        id: "2",
        createdAt: "2026-10-20T08:01:00Z",
        direction: "outbound",
        body: "Je regarde.",
        templateKey: "chat",
        tools: ["chercher_hotel"],
      }),
      message({
        id: "3",
        phone: "+33699999999",
        customerId: null,
        customerName: null,
        bookingId: null,
        bookingReference: null,
        createdAt: "2026-10-20T09:00:00Z",
        direction: "inbound",
        body: "Je cherche un hôtel",
      }),
    ],
    { paused: ["+33601020304"], escalated: ["+33699999999"], readAt: { "+33601020304": "2026-10-20T08:00:30Z" } }
  );
  assert.equal(threads[0].prospect, true);
  assert.equal(threads[0].status, "escalated");
  assert.equal(threads[0].unread, 1);
  assert.equal(threads[1].status, "agency");
  assert.equal(threads[1].held, true);
  assert.equal(threads[1].unread, 0);
  assert.equal(conversationBadge("agency", true), "Repris par l’agence");
  assert.equal(conversationBadge("escalated", false), "Escaladé · Le Concierge");
  assert.deepEqual(
    messagesNewestFirst([
      message({ id: "a", createdAt: "2026-10-20T08:00:00Z", direction: "inbound", body: "Ancien" }),
      message({ id: "b", createdAt: "2026-10-20T10:00:00Z", direction: "inbound", body: "Récent" }),
    ]).map((row) => row.body),
    ["Récent", "Ancien"]
  );
  assert.equal(messageSpeaker(message({ id: "2", createdAt: "2026-10-20T08:01:00Z", direction: "outbound", body: "x", authorName: "Victoria" })), "agency");
  assert.equal(messageSpeaker(message({ id: "2", createdAt: "2026-10-20T08:01:00Z", direction: "outbound", body: "x", templateKey: "chat" })), "robot");
  const found = filterThreads(threads, { query: "hôtel", filter: "prospects" });
  assert.equal(found.length, 1);
  assert.equal(deliveryLabel("read"), "Lu");
  assert.equal(deliveryCaption("sent"), "Envoyé");
  assert.equal(
    deliveryCaption("failed", "Hors des 24 heures. WhatsApp refuse un message libre si la personne n’a pas écrit aujourd’hui."),
    "Échec · Hors des 24 heures. WhatsApp refuse un message libre si la personne n’a pas écrit aujourd’hui."
  );
  assert.equal(deliveryCaption("undelivered"), "Échec");
  assert.equal(sessionWindowOpen("2026-10-20T08:00:00Z", new Date("2026-10-21T09:00:00Z")), false);
  assert.equal(sessionWindowOpen("2026-10-20T08:00:00Z", new Date("2026-10-20T20:00:00Z")), true);
  assert.equal(draftTemplateRefused("concierge_depart"), true);
  const approved = approvedManualTemplates({ TWILIO_CONTENT_SEJOUR_TEXTE: "HX1" }).map((row) => row.key).join(" ");
  assert.equal(approved.includes("concierge"), false);
  assert.equal(approvedManualTemplates({ TWILIO_CONTENT_SEJOUR_TEXTE: "HX1" })[0]?.key, "sejour_texte");
});
