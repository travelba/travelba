import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claimOsNotify,
  isPopupNotice,
  mergeAdminNotices,
  noticeIcon,
  popupCursor,
  popupWaitingLabel,
  shouldShowAdminPopup,
  takePopupBacklog,
} from "./admin-popup";
import { browserAlertBanner, browserAlertChoice, browserAlertStatus } from "./browser-alert";
import type { HotelReplyNotice } from "./hotel-reply-notice";

function notice(id: string): HotelReplyNotice {
  return {
    id,
    bookingId: "",
    itemId: "",
    hotel: "Villa Serena",
    excerpt: "Réponse",
    receivedAt: "2026-11-02T10:00:00.000Z",
    href: "/admin/reservations/stay",
  };
}

test("une notification fermée ou déjà affichée ne revient pas", () => {
  const dismissed = new Set(["deja"]);
  const merged = mergeAdminNotices([notice("ouverte")], [notice("ouverte"), notice("deja"), notice("nouvelle")], dismissed);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["ouverte", "nouvelle"]
  );
});

test("un seul onglet visible montre la fenêtre", () => {
  assert.equal(shouldShowAdminPopup({ selfId: "a", ownerId: "a", visible: false, focused: true }), false);
  assert.equal(shouldShowAdminPopup({ selfId: "a", ownerId: "b", visible: true, focused: false }), false);
  assert.equal(shouldShowAdminPopup({ selfId: "a", ownerId: "a", visible: true, focused: false }), true);
  assert.equal(shouldShowAdminPopup({ selfId: "a", ownerId: null, visible: true, focused: true }), true);
  assert.equal(shouldShowAdminPopup({ selfId: "a", ownerId: null, visible: true, focused: false }), false);
});

test("le système ne sonne pas deux fois le même identifiant", () => {
  const first = claimOsNotify([], ["mail:1", "wa:2"]);
  assert.deepEqual(first.fresh, ["mail:1", "wa:2"]);
  const second = claimOsNotify(first.next, ["mail:1", "wa:3"]);
  assert.deepEqual(second.fresh, ["wa:3"]);
});

test("le bandeau ne redemande pas après un choix", () => {
  assert.equal(browserAlertChoice({ supported: true, permission: "default", memory: null }), "ask");
  assert.equal(browserAlertChoice({ supported: true, permission: "default", memory: "later" }), "later");
  assert.equal(browserAlertChoice({ supported: true, permission: "granted", memory: null }), "granted");
  assert.equal(browserAlertChoice({ supported: true, permission: "denied", memory: null }), "denied");
  assert.equal(browserAlertChoice({ supported: false, permission: "default", memory: null }), "unsupported");
  assert.equal(browserAlertBanner("ask", null), "ask");
  assert.equal(browserAlertBanner("later", "later"), null);
  assert.equal(browserAlertBanner("denied", null), "denied");
  assert.equal(browserAlertBanner("denied", "denied-seen"), null);
  assert.equal(browserAlertBanner("unsupported", "unsupported-seen"), null);
  assert.equal(browserAlertStatus("ask").action, "Activer les notifications");
  assert.match(browserAlertStatus("unsupported").note || "", /indisponibles/);
});

test("seules une réponse d’hôtel et un paiement reçu s’ouvrent", () => {
  assert.equal(isPopupNotice(notice("hotel")), true);
  assert.equal(isPopupNotice({ kicker: "Pliant", hotel: "Pliant", excerpt: "Little Emperors a annulé le séjour." }), false);
  assert.equal(isPopupNotice({ kicker: "WhatsApp", hotel: "Message client", excerpt: "Bonjour" }), false);
  assert.equal(isPopupNotice({ kicker: "E-mail", hotel: "Message reçu", excerpt: "Un e-mail est arrivé dans la file." }), false);
  assert.equal(isPopupNotice({ kicker: "Concierge", hotel: "Modification", excerpt: "Le concierge a modifié un dossier." }), false);
  assert.equal(isPopupNotice({ kicker: "Passeport ouvert", hotel: "Passeport ouvert", excerpt: "Passeport ouvert." }), false);
  assert.equal(isPopupNotice({ kicker: "Carte ouverte", hotel: "Carte ouverte", excerpt: "Carte ouverte." }), false);
  assert.equal(isPopupNotice({ kicker: "Export", hotel: "Export", excerpt: "Export du journal." }), false);
  assert.equal(
    isPopupNotice({ kicker: "Paiement", hotel: "Paiement client", excerpt: "Virement reçu · 1 200 € · Cabinet" }),
    true
  );
  assert.equal(
    isPopupNotice({ kicker: "Paiement", hotel: "Paiement", excerpt: "Paiement de 6 000 €, au-dessus du seuil." }),
    false
  );
  const now = Date.parse("2026-11-20T09:00:00.000Z");
  assert.equal(popupCursor(null, now), new Date(now - 3 * 60 * 1000).toISOString());
  assert.equal(popupCursor("2026-11-19T09:00:00.000Z", now), new Date(now - 3 * 60 * 1000).toISOString());
  assert.equal(popupCursor("2026-11-20T08:59:00.000Z", now), "2026-11-20T08:59:00.000Z");
  assert.deepEqual(
    takePopupBacklog(["a", "b", "c", "d"]).slice(),
    ["b", "c", "d"]
  );
  const route = readFileSync(new URL("../../app/api/admin/hotel-replies/route.ts", import.meta.url), "utf8");
  assert.match(route, /receivedPaymentPopup/);
  assert.match(route, /hotelReplyNotices/);
  assert.equal(route.includes("crm_whatsapp_messages"), false);
  assert.equal(route.includes("crm_email_ingest"), false);
  assert.match(route, /\.eq\("kind", "payment"\)/);
});

test("le libellé de la file reste lisible", () => {
  assert.equal(noticeIcon(undefined), "hotel");
  assert.equal(noticeIcon("Paiement"), "payments");
  assert.equal(popupWaitingLabel(1), "Encore une notification");
  assert.equal(popupWaitingLabel(3), "Encore 3 notifications");
});
