/**
 * Navigateur intégré d’une application (WhatsApp, Instagram, Facebook…), d’après l’agent utilisateur.
 * Le lien de l’espace client arrive par WhatsApp : son navigateur intégré garde le client prisonnier
 * et ne partage pas ses cookies avec Safari ou Chrome. On le reconnaît pour l’envoyer dehors.
 *
 * Marqueurs connus (inapp-spy, vérifié octobre 2026) : WhatsApp signe `WAiOS/` (iPhone) et `WA4A/` (Android),
 * Meta `FBAN` / `FBAV` / `FB_IAB` / `Instagram` / `Barcelona` (Threads), Line `Line/`, Telegram n’est pas
 * reconnaissable par l’agent. Un WKWebView sans `Safari/` et un WebView Android `wv)` sont des vues intégrées
 * génériques : on propose la sortie sans la forcer.
 */

export type InAppPlatform = "ios" | "android" | "other";

export type InAppApp = "whatsapp" | "instagram" | "threads" | "facebook" | "messenger" | "line" | "webview";

export type InAppDetection = {
  inApp: boolean;
  app: InAppApp | null;
  platform: InAppPlatform;
  /** Vrai quand l’application est connue pour laisser passer l’ouverture automatique du navigateur. */
  autoOpen: boolean;
};

const NOT_IN_APP: InAppDetection = { inApp: false, app: null, platform: "other", autoOpen: false };

export function inAppPlatform(userAgent: string): InAppPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** Le robot d’aperçu WhatsApp (`WhatsApp/2.x A`) n’est pas un navigateur. */
function isPreviewRobot(userAgent: string) {
  return /^WhatsApp\//i.test(userAgent.trim());
}

export function detectInAppBrowser(userAgent: string | null | undefined): InAppDetection {
  const ua = (userAgent || "").trim();
  if (!ua || isPreviewRobot(ua)) return NOT_IN_APP;
  const platform = inAppPlatform(ua);

  let app: InAppApp | null = null;
  if (/\b(WAiOS|WA4A)\//i.test(ua) || /\bWhatsApp\b/i.test(ua)) app = "whatsapp";
  else if (/\bInstagram/i.test(ua)) app = "instagram";
  else if (/\bBarcelona/i.test(ua)) app = "threads";
  else if (/\bFB[\w_]+\/Messenger/i.test(ua)) app = "messenger";
  else if (/\bFB[\w_]+\/|\bFBAN\b|\bFBAV\b|\bFB_IAB\b/i.test(ua)) app = "facebook";
  else if (/\bLine\//i.test(ua)) app = "line";
  else if (platform === "android" && /\bwv\)/.test(ua)) app = "webview";
  else if (platform === "ios" && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) app = "webview";

  if (!app) return { ...NOT_IN_APP, platform };
  if (platform === "other") return { ...NOT_IN_APP, platform };
  // WhatsApp, Facebook et Line laissent passer l’ouverture scriptée ; Instagram et Threads ont leur propre
  // schéma (`extbrowser`). Une vue intégrée inconnue reçoit le bouton, pas la redirection.
  const autoOpen = app !== "webview";
  return { inApp: true, app, platform, autoOpen };
}

/**
 * Adresse qui demande au téléphone d’ouvrir le vrai navigateur.
 * iOS : `x-safari-https://` (Safari), sauf Instagram et Threads qui ont `extbrowser` (navigateur par défaut).
 * Android : `intent://…#Intent;scheme=https;end` — le navigateur par défaut, Chrome ou autre.
 * Rien pour un ordinateur.
 */
export function externalBrowserUrl(httpsUrl: string, detection: Pick<InAppDetection, "platform" | "app">) {
  let url: URL;
  try {
    url = new URL(httpsUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const scheme = url.protocol.slice(0, -1);
  if (detection.platform === "ios") {
    if (detection.app === "instagram") return `instagram://extbrowser/?url=${encodeURIComponent(url.toString())}`;
    if (detection.app === "threads") return `barcelona://extbrowser/?url=${encodeURIComponent(url.toString())}`;
    return `x-safari-${scheme}://${url.host}${url.pathname}${url.search}`;
  }
  if (detection.platform === "android") {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
  }
  return null;
}
