import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_APP_UA_MARK,
  isNativeAppUserAgent,
  isNativeBlockedPath,
  isPortalPath,
  nativeAdminRedirect,
  portalNavigation,
  pushTargetPath,
} from "./native-portal";

const IPHONE = `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ${NATIVE_APP_UA_MARK}`;

test("l’application se reconnaît à sa marque, Safari non", () => {
  assert.equal(isNativeAppUserAgent(IPHONE), true);
  assert.equal(isNativeAppUserAgent("Mozilla/5.0 (iPhone) Safari/605"), false);
  assert.equal(isNativeAppUserAgent(null), false);
});

test("le portail client reste dans l’application, l’agence jamais", () => {
  assert.equal(isPortalPath("/mon-compte/reservations/TB-2026-0001"), true);
  assert.equal(isPortalPath("/connexion/mot-de-passe"), true);
  assert.equal(isPortalPath("/inscription/i/jeton"), true);
  assert.equal(portalNavigation({ url: "https://travelba.fr/inscription" }), "allow");
  assert.equal(isPortalPath("/e/abc"), true);
  assert.equal(isPortalPath("/acces/jeton"), true);
  assert.equal(isPortalPath("/compte-supprime"), true);
  assert.equal(isPortalPath("/auth/callback"), true);
  assert.equal(isPortalPath("/api/client/devices"), true);
  assert.equal(isNativeBlockedPath("/admin"), true);
  assert.equal(isNativeBlockedPath("/admin/login"), true);
  assert.equal(isNativeBlockedPath("/api/admin/clients"), true);
  assert.equal(isNativeBlockedPath("/api/mcp"), true);
  assert.equal(isPortalPath("/admin"), false);
  assert.equal(portalNavigation({ url: "https://travelba.fr/mon-compte" }), "allow");
  assert.equal(portalNavigation({ url: "https://www.travelba.fr/connexion" }), "allow");
  assert.equal(portalNavigation({ url: "https://travelba.fr/admin/reservations" }), "block");
  assert.equal(portalNavigation({ url: "https://travelba.fr/" }), "external");
  assert.equal(portalNavigation({ url: "https://wa.me/33756841315" }), "external");
  assert.equal(portalNavigation({ url: "mailto:contact@travelba.fr" }), "system");
  assert.equal(portalNavigation({ url: "tel:+33756841315" }), "system");
  assert.equal(portalNavigation({ url: "sms:+33756841315" }), "system");
  assert.equal(portalNavigation({ url: "https://evil.example/mon-compte" }), "external");
});

test("une navigation agence dans l’application revient à la connexion", () => {
  assert.equal(nativeAdminRedirect("/admin", IPHONE), "/connexion?error=application");
  assert.equal(nativeAdminRedirect("/mon-compte", IPHONE), null);
  assert.equal(nativeAdminRedirect("/admin", "Safari"), null);
});

test("une notification n’ouvre qu’un chemin du compte", () => {
  assert.equal(pushTargetPath("/mon-compte/reservations/TB-2026-0001"), "/mon-compte/reservations/TB-2026-0001");
  assert.equal(pushTargetPath("/admin"), null);
  assert.equal(pushTargetPath("https://travelba.fr/mon-compte"), null);
  assert.equal(pushTargetPath("//evil.example"), null);
  assert.equal(pushTargetPath("/mon-compte/../../admin"), null);
});
