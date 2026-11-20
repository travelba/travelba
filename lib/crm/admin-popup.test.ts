import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claimOsNotify,
  mergeAdminNotices,
  noticeIcon,
  popupWaitingLabel,
  shouldShowAdminPopup,
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

test("la file et le quai passent par la même fenêtre", () => {
  assert.equal(noticeIcon("WhatsApp"), "chat");
  assert.equal(noticeIcon(undefined), "hotel");
  assert.equal(popupWaitingLabel(1), "Encore une notification");
  assert.equal(popupWaitingLabel(3), "Encore 3 notifications");
  const route = readFileSync(new URL("../../app/api/admin/hotel-replies/route.ts", import.meta.url), "utf8");
  assert.match(route, /crm_whatsapp_messages/);
  assert.match(route, /read_at/);
  assert.equal(route.includes("chats: []"), false);
  assert.equal(route.includes('.eq("kind", "payment")'), false);
});
