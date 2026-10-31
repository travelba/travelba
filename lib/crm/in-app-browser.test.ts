import assert from "node:assert/strict";
import test from "node:test";
import { detectInAppBrowser, externalBrowserUrl } from "./in-app-browser";
import { ENTRY_DOOR_PARTNER, entryEscapeHtml } from "./entry-link";

const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WHATSAPP_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WAiOS/25.30.74";
const WHATSAPP_ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 WA4A/2.25.30.76";
const INSTAGRAM_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.92 (iPhone15,2; iOS 17_5; fr_FR; fr; scale=3.00; 1179x2556; 621234567)";
const FACEBOOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.47.73;]";
const WKWEBVIEW_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("le navigateur intégré est reconnu, les vrais navigateurs passent", () => {
  assert.deepEqual(detectInAppBrowser(WHATSAPP_IPHONE), { inApp: true, app: "whatsapp", platform: "ios", autoOpen: true });
  assert.deepEqual(detectInAppBrowser(WHATSAPP_ANDROID), { inApp: true, app: "whatsapp", platform: "android", autoOpen: true });
  assert.equal(detectInAppBrowser(INSTAGRAM_IPHONE).app, "instagram");
  assert.equal(detectInAppBrowser(FACEBOOK_ANDROID).app, "facebook");
  // Vue intégrée inconnue : proposée, pas forcée.
  assert.deepEqual(detectInAppBrowser(WKWEBVIEW_IPHONE), { inApp: true, app: "webview", platform: "ios", autoOpen: false });

  assert.equal(detectInAppBrowser(SAFARI_IPHONE).inApp, false);
  assert.equal(detectInAppBrowser(CHROME_IPHONE).inApp, false);
  assert.equal(detectInAppBrowser(CHROME_ANDROID).inApp, false);
  assert.equal(detectInAppBrowser(DESKTOP_CHROME).inApp, false);
  assert.equal(detectInAppBrowser(null).inApp, false);
  assert.equal(detectInAppBrowser("").inApp, false);
  // Le robot d’aperçu WhatsApp n’est pas un navigateur intégré.
  assert.equal(detectInAppBrowser("WhatsApp/2.23.20.72 A").inApp, false);
});

test("l’adresse de sortie suit la plateforme", () => {
  const page = "https://travelba.fr/e/c/K7MQ2PX4";
  assert.equal(externalBrowserUrl(page, { platform: "ios", app: "whatsapp" }), "x-safari-https://travelba.fr/e/c/K7MQ2PX4");
  assert.equal(
    externalBrowserUrl(page, { platform: "android", app: "whatsapp" }),
    "intent://travelba.fr/e/c/K7MQ2PX4#Intent;scheme=https;action=android.intent.action.VIEW;end"
  );
  assert.equal(
    externalBrowserUrl(page, { platform: "ios", app: "instagram" }),
    "instagram://extbrowser/?url=https%3A%2F%2Ftravelba.fr%2Fe%2Fc%2FK7MQ2PX4"
  );
  assert.equal(externalBrowserUrl(page, { platform: "other", app: null }), null);
  // En local, l’adresse est en http : Safari a aussi `x-safari-http://`.
  assert.equal(externalBrowserUrl("http://localhost:3000/e/c/K7MQ2PX4", { platform: "ios", app: "whatsapp" }), "x-safari-http://localhost:3000/e/c/K7MQ2PX4");
  assert.equal(externalBrowserUrl("ftp://travelba.fr/e/c/K7MQ2PX4", { platform: "ios", app: "whatsapp" }), null);
  assert.equal(externalBrowserUrl("pas une adresse", { platform: "ios", app: "whatsapp" }), null);
});

test("la porte de sortie ne consomme pas le jeton et garde une issue dans l’application", () => {
  const html = entryEscapeHtml("https://travelba.fr", "K7MQ2PX4", detectInAppBrowser(WHATSAPP_IPHONE));
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Ouvrir dans Safari/);
  assert.match(html, /href="x-safari-https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /location\.href="x-safari-https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /Le navigateur de WhatsApp ne garde pas votre connexion/);
  assert.match(html, /appui long sur le lien/);
  assert.match(html, /« Ouvrir dans Safari »/);
  // « Continuer ici » : le formulaire poste, la session se pose dans la vue intégrée si besoin.
  assert.match(html, /method="post" action="https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /name="ouvrir"/);
  assert.match(html, /Continuer ici/);
  // Le jeton n’est pas ouvert au chargement : pas de `?ouvrir=1` automatique.
  assert.equal(html.includes("?ouvrir=1"), false);
  assert.equal(html.includes("token"), false);
  assert.equal(html.includes("/connexion"), false);

  const android = entryEscapeHtml("https://travelba.fr", "K7MQ2PX4", detectInAppBrowser(WHATSAPP_ANDROID));
  assert.match(android, /Ouvrir dans le navigateur/);
  assert.match(android, /href="intent:\/\/travelba\.fr\/e\/c\/K7MQ2PX4#Intent;scheme=https;action=android\.intent\.action\.VIEW;end"/);
  assert.match(android, /« Ouvrir dans Chrome »/);

  // Vue intégrée inconnue : le bouton reste, la redirection automatique non.
  const generic = entryEscapeHtml("https://travelba.fr", "K7MQ2PX4", detectInAppBrowser(WKWEBVIEW_IPHONE));
  assert.match(generic, /href="x-safari-https:/);
  assert.equal(generic.includes("location.href"), false);
  assert.match(generic, /cette application/);

  const partner = entryEscapeHtml("https://travelba.fr", "K7MQ2PX4", detectInAppBrowser(WHATSAPP_IPHONE), ENTRY_DOOR_PARTNER);
  assert.match(partner, /<html lang="en">/);
  assert.match(partner, /Open in Safari/);
  assert.match(partner, /Little Emperors/);
});
