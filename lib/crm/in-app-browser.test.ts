import assert from "node:assert/strict";
import test from "node:test";
import {
  IN_APP_STAY_COOKIE,
  detectInAppBrowser,
  externalBrowserUrl,
  inAppHandoffDecision,
  inAppHandoffHtml,
  inAppStayRequested,
} from "./in-app-browser";

const UA = {
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 15; Mobile; rv:136.0) Gecko/136.0 Firefox/136.0",
  desktopChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  whatsappIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WAiOS/25.30.74",
  whatsappAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 WA4A/2.25.30.76",
  whatsappRobot: "WhatsApp/2.23.20.72 A",
  instagramIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.92 (iPhone15,2; iOS 17_5; fr_FR; fr; scale=3.00; 1179x2556; 621234567)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.47.73;]",
  messengerIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/fr_FR;FBOP/5]",
  lineAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Line/14.10.0",
  wkwebviewIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  webviewAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
};

const PAGE = "https://travelba.fr/mon-compte/reservations/TB-2026-0042";

function decide(userAgent: string, extra: Partial<Parameters<typeof inAppHandoffDecision>[0]> = {}) {
  return inAppHandoffDecision({ url: PAGE, method: "GET", userAgent, secFetchDest: "document", ...extra });
}

test("le navigateur intégré est reconnu, les vrais navigateurs passent", () => {
  assert.deepEqual(detectInAppBrowser(UA.whatsappIphone), { inApp: true, app: "whatsapp", platform: "ios", autoOpen: true });
  assert.deepEqual(detectInAppBrowser(UA.whatsappAndroid), { inApp: true, app: "whatsapp", platform: "android", autoOpen: true });
  assert.equal(detectInAppBrowser(UA.instagramIphone).app, "instagram");
  assert.equal(detectInAppBrowser(UA.facebookAndroid).app, "facebook");
  assert.equal(detectInAppBrowser(UA.messengerIphone).app, "facebook");
  assert.equal(detectInAppBrowser(UA.lineAndroid).app, "line");
  // Vue intégrée inconnue : reconnue, jamais redirigée (application sur l’écran d’accueil…).
  assert.deepEqual(detectInAppBrowser(UA.wkwebviewIphone), { inApp: true, app: "webview", platform: "ios", autoOpen: false });
  assert.deepEqual(detectInAppBrowser(UA.webviewAndroid), { inApp: true, app: "webview", platform: "android", autoOpen: false });

  for (const ua of [UA.safariIphone, UA.chromeIphone, UA.chromeAndroid, UA.samsungAndroid, UA.firefoxAndroid, UA.desktopChrome, UA.desktopSafari]) {
    assert.equal(detectInAppBrowser(ua).inApp, false, ua);
  }
  assert.equal(detectInAppBrowser(null).inApp, false);
  assert.equal(detectInAppBrowser("").inApp, false);
  // Le robot d’aperçu WhatsApp n’est pas un navigateur intégré : il garde sa carte.
  assert.equal(detectInAppBrowser(UA.whatsappRobot).inApp, false);
});

test("l’adresse de sortie suit la plateforme, avec le repli Android marqué « rester ici »", () => {
  assert.equal(externalBrowserUrl(PAGE, { platform: "ios", app: "whatsapp" }), "x-safari-https://travelba.fr/mon-compte/reservations/TB-2026-0042");
  assert.equal(
    externalBrowserUrl(PAGE, { platform: "android", app: "whatsapp" }),
    "intent://travelba.fr/mon-compte/reservations/TB-2026-0042#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=https%3A%2F%2Ftravelba.fr%2Fmon-compte%2Freservations%2FTB-2026-0042%3Ftb_inapp%3D1;end"
  );
  assert.equal(
    externalBrowserUrl("https://travelba.fr/e/c/K7MQ2PX4?x=1", { platform: "android", app: "whatsapp" }),
    "intent://travelba.fr/e/c/K7MQ2PX4?x=1#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=https%3A%2F%2Ftravelba.fr%2Fe%2Fc%2FK7MQ2PX4%3Fx%3D1%26tb_inapp%3D1;end"
  );
  assert.equal(
    externalBrowserUrl(PAGE, { platform: "ios", app: "instagram" }),
    "instagram://extbrowser/?url=https%3A%2F%2Ftravelba.fr%2Fmon-compte%2Freservations%2FTB-2026-0042"
  );
  assert.equal(externalBrowserUrl(PAGE, { platform: "other", app: null }), null);
  // En local, l’adresse est en http : Safari a aussi `x-safari-http://`.
  assert.equal(externalBrowserUrl("http://localhost:3000/e/c/K7MQ2PX4", { platform: "ios", app: "whatsapp" }), "x-safari-http://localhost:3000/e/c/K7MQ2PX4");
  assert.equal(externalBrowserUrl("ftp://travelba.fr/e/c/K7MQ2PX4", { platform: "ios", app: "whatsapp" }), null);
  assert.equal(externalBrowserUrl("pas une adresse", { platform: "ios", app: "whatsapp" }), null);
});

test("un agent, une décision : WhatsApp part, le reste passe", () => {
  // WhatsApp iPhone → Safari.
  const iphone = decide(UA.whatsappIphone);
  assert.equal(iphone.kind, "handoff");
  if (iphone.kind === "handoff") assert.match(iphone.external, /^x-safari-https:\/\/travelba\.fr\/mon-compte/);
  // WhatsApp Android → intent vers le navigateur par défaut.
  const android = decide(UA.whatsappAndroid);
  assert.equal(android.kind, "handoff");
  if (android.kind === "handoff") assert.match(android.external, /^intent:\/\/travelba\.fr\/mon-compte.*scheme=https.*browser_fallback_url/);
  // Instagram → extbrowser ; Facebook, Messenger, Line → même sortie que WhatsApp.
  const instagram = decide(UA.instagramIphone);
  assert.equal(instagram.kind, "handoff");
  if (instagram.kind === "handoff") assert.match(instagram.external, /^instagram:\/\/extbrowser/);
  assert.equal(decide(UA.facebookAndroid).kind, "handoff");
  assert.equal(decide(UA.messengerIphone).kind, "handoff");
  assert.equal(decide(UA.lineAndroid).kind, "handoff");
  // Vrais navigateurs : rien ne change, aucune boucle possible (Safari ouvert par x-safari-https repasse ici).
  for (const ua of [UA.safariIphone, UA.chromeIphone, UA.chromeAndroid, UA.samsungAndroid, UA.firefoxAndroid, UA.desktopChrome, UA.desktopSafari]) {
    assert.deepEqual(decide(ua), { kind: "pass", stay: false }, ua);
  }
  // Robot d’aperçu, vues intégrées inconnues : passent.
  assert.equal(decide(UA.whatsappRobot).kind, "pass");
  assert.equal(decide(UA.wkwebviewIphone).kind, "pass");
  assert.equal(decide(UA.webviewAndroid).kind, "pass");
  assert.equal(decide("").kind, "pass");
});

test("seules les navigations de page partent ; API, fetch et « rester ici » passent", () => {
  assert.equal(decide(UA.whatsappIphone, { method: "POST" }).kind, "pass");
  assert.equal(decide(UA.whatsappIphone, { method: "HEAD" }).kind, "pass");
  assert.equal(decide(UA.whatsappIphone, { secFetchDest: "empty" }).kind, "pass");
  assert.equal(decide(UA.whatsappIphone, { secFetchDest: "image" }).kind, "pass");
  assert.equal(decide(UA.whatsappIphone, { url: "https://travelba.fr/api/files?path=x" }).kind, "pass");
  // Sans Sec-Fetch-Dest (anciens WebKit) : l’en-tête Accept décide.
  assert.equal(decide(UA.whatsappIphone, { secFetchDest: null, accept: "text/html,application/xhtml+xml" }).kind, "handoff");
  assert.equal(decide(UA.whatsappIphone, { secFetchDest: null, accept: "application/json" }).kind, "pass");
  // Le lien court : même sortie, le jeton n’est pas consommé dans la vue intégrée.
  const entry = decide(UA.whatsappIphone, { url: "https://travelba.fr/e/c/K7MQ2PX4" });
  assert.equal(entry.kind, "handoff");
  if (entry.kind === "handoff") assert.equal(entry.external, "x-safari-https://travelba.fr/e/c/K7MQ2PX4");
  // « Rester ici » : paramètre (repli Android) puis cookie de dix minutes.
  assert.deepEqual(decide(UA.whatsappIphone, { url: `${PAGE}?tb_inapp=1` }), { kind: "pass", stay: true });
  assert.deepEqual(decide(UA.whatsappAndroid, { cookie: `sb-x-auth-token=abc; ${IN_APP_STAY_COOKIE}=1` }), { kind: "pass", stay: true });
  assert.equal(inAppStayRequested({ search: "", cookie: "tb_inapp=0" }), false);
  assert.equal(inAppStayRequested({ search: "", cookie: "autre_tb_inapp=1" }), false);
  assert.equal(inAppStayRequested({ search: "?tb_inapp=1", cookie: null }), true);
});

test("la sortie tient dans les premiers octets, sans page ni consigne", () => {
  const external = "x-safari-https://travelba.fr/e/c/K7MQ2PX4";
  const html = inAppHandoffHtml(external, { platform: "ios", app: "whatsapp" });
  // Le script de redirection précède tout le reste.
  assert.ok(html.indexOf('<script>location.replace("x-safari-https://travelba.fr/e/c/K7MQ2PX4")</script>') < 120);
  assert.match(html, /<noscript><meta http-equiv="refresh" content="0;url=x-safari-https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"><\/noscript>/);
  // Un seul petit lien, caché 1,5 s, qui reprend le même geste.
  assert.match(html, /<a id="tb-ouvrir" href="x-safari-https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4" hidden>Ouvrir dans Safari<\/a>/);
  assert.match(html, /setTimeout\(function\(\)\{document\.getElementById\("tb-ouvrir"\)\.hidden=false\},1500\)/);
  assert.equal(html.includes("Continuer ici"), false);
  assert.equal(html.includes("appui long"), false);
  assert.equal(html.includes("?ouvrir=1"), false);
  assert.ok(html.length < 1400);

  const android = inAppHandoffHtml("intent://travelba.fr/x#Intent;scheme=https;end", { platform: "android", app: "whatsapp" });
  assert.match(android, />Ouvrir dans le navigateur<\/a>/);
  assert.match(inAppHandoffHtml(external, { platform: "ios", app: "whatsapp" }, "en"), />Open in Safari<\/a>/);
  // Instagram et Threads : la redirection déclarative est aussi hors noscript.
  const instagram = inAppHandoffHtml("instagram://extbrowser/?url=x", { platform: "ios", app: "instagram" });
  assert.match(instagram, /<\/script><meta http-equiv="refresh" content="0;url=instagram:\/\/extbrowser\/\?url=x">/);
  // Rien qui casse l’attribut : les guillemets sont échappés.
  assert.equal(inAppHandoffHtml('x-safari-https://a/"b', { platform: "ios", app: "whatsapp" }).includes('href="x-safari-https://a/&quot;b"'), true);
});
