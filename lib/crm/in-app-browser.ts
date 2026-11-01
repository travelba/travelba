/**
 * Navigateur intégré d’une application (WhatsApp, Instagram, Facebook…), d’après l’agent utilisateur.
 * Tout lien envoyé par WhatsApp (espace, carnet, pièces, règlement…) s’ouvre dans ce navigateur, qui garde
 * le client prisonnier et ne partage pas ses cookies avec Safari ou Chrome. Dès la première requête, avant
 * tout rendu, on le renvoie dans le vrai navigateur : `x-safari-https://` sur iPhone, `intent://` sur Android.
 *
 * Marqueurs connus (inapp-spy, vérifié octobre 2026) : WhatsApp signe `WAiOS/` (iPhone) et `WA4A/` (Android),
 * Meta `FBAN` / `FBAV` / `FB_IAB` / `Instagram` / `Barcelona` (Threads), Line `Line/`. Une vue intégrée
 * inconnue (WKWebView sans `Safari/`, WebView Android `wv)`) est reconnue mais jamais redirigée : trop de
 * faux positifs (application installée sur l’écran d’accueil).
 */

export type InAppPlatform = "ios" | "android" | "other";

export type InAppApp = "whatsapp" | "instagram" | "threads" | "facebook" | "messenger" | "line" | "webview";

export type InAppDetection = {
  inApp: boolean;
  app: InAppApp | null;
  platform: InAppPlatform;
  /** Vrai quand l’application est connue : la sortie vers le vrai navigateur est automatique. */
  autoOpen: boolean;
};

/** Paramètre et cookie qui disent « rester dans l’application » : sortie refusée par l’appareil, on n’insiste pas. */
export const IN_APP_STAY_PARAM = "tb_inapp";
export const IN_APP_STAY_COOKIE = "tb_inapp";
export const IN_APP_STAY_MAX_AGE = 10 * 60;

const NOT_IN_APP: InAppDetection = { inApp: false, app: null, platform: "other", autoOpen: false };

export function inAppPlatform(userAgent: string): InAppPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** Le robot d’aperçu WhatsApp (`WhatsApp/2.x A`) n’est pas un navigateur : il garde sa carte. */
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
  return { inApp: true, app, platform, autoOpen: app !== "webview" };
}

function withStayParam(url: URL) {
  const stay = new URL(url.toString());
  stay.searchParams.set(IN_APP_STAY_PARAM, "1");
  return stay.toString();
}

/**
 * Adresse qui demande au téléphone d’ouvrir le vrai navigateur, sans clic.
 * iOS : `x-safari-https://` (Safari), sauf Instagram et Threads qui ont `extbrowser` (navigateur par défaut).
 * Android : `intent://…#Intent;scheme=https;…;end` vers le navigateur par défaut, avec
 * `S.browser_fallback_url` sur la même page marquée « rester ici » : pas de boucle si l’intent échoue.
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
    const fallback = encodeURIComponent(withStayParam(url));
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end`;
  }
  return null;
}

/** Le cookie « rester ici » est posé ; ou la requête porte le paramètre qui le pose. */
export function inAppStayRequested(input: { search: string; cookie: string | null | undefined }) {
  if (new URLSearchParams(input.search).get(IN_APP_STAY_PARAM) === "1") return true;
  const cookie = input.cookie || "";
  return new RegExp(`(?:^|;\\s*)${IN_APP_STAY_COOKIE}=1(?:;|$)`).test(cookie);
}

/** Navigation de page (pas une requête fetch, une image ou un script). */
function isDocumentRequest(input: { method: string; secFetchDest: string | null | undefined; accept: string | null | undefined }) {
  if (input.method !== "GET") return false;
  const dest = (input.secFetchDest || "").toLowerCase();
  if (dest) return dest === "document";
  return /text\/html|\*\/\*/.test(input.accept || "");
}

export type InAppHandoffInput = {
  url: string;
  method: string;
  userAgent: string | null | undefined;
  secFetchDest?: string | null;
  accept?: string | null;
  cookie?: string | null;
};

export type InAppHandoffDecision =
  | { kind: "pass"; stay: boolean }
  | { kind: "handoff"; detection: InAppDetection; external: string };

/**
 * Faut-il renvoyer cette requête vers le vrai navigateur ?
 * Seules les navigations de page d’une application connue, sans « rester ici », partent.
 * Les API, les robots d’aperçu, Safari, Chrome et les vues intégrées inconnues passent.
 */
export function inAppHandoffDecision(input: InAppHandoffInput): InAppHandoffDecision {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { kind: "pass", stay: false };
  }
  const stay = inAppStayRequested({ search: url.search, cookie: input.cookie });
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return { kind: "pass", stay };
  if (!isDocumentRequest({ method: input.method, secFetchDest: input.secFetchDest, accept: input.accept })) {
    return { kind: "pass", stay };
  }
  const detection = detectInAppBrowser(input.userAgent);
  if (!detection.inApp || !detection.autoOpen) return { kind: "pass", stay };
  if (stay) return { kind: "pass", stay: true };
  const external = externalBrowserUrl(url.toString(), detection);
  if (!external) return { kind: "pass", stay };
  return { kind: "handoff", detection, external };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Réponse de sortie : la redirection est dans les tout premiers octets (script, et `meta refresh`
 * pour Instagram / Threads et sans JavaScript). Pas de page : un fond vide, puis après 1,5 s un seul
 * petit lien qui reprend le même geste si l’appareil n’a pas suivi.
 */
export function inAppHandoffHtml(external: string, detection: Pick<InAppDetection, "platform" | "app">, lang: "fr" | "en" = "fr") {
  const target = JSON.stringify(external);
  const href = escapeHtml(external);
  const declarative = detection.app === "instagram" || detection.app === "threads";
  const refresh = `<meta http-equiv="refresh" content="0;url=${href}">`;
  const label =
    detection.platform === "ios"
      ? lang === "en"
        ? "Open in Safari"
        : "Ouvrir dans Safari"
      : lang === "en"
        ? "Open in my browser"
        : "Ouvrir dans le navigateur";
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><script>location.replace(${target})</script>${
    declarative ? refresh : `<noscript>${refresh}</noscript>`
  }<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#0B192C"><title>Travel Business Agency</title><style>html,body{margin:0;min-height:100%;background:#0B192C}a{position:fixed;left:50%;bottom:calc(32px + env(safe-area-inset-bottom));transform:translateX(-50%);color:#C5A880;font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:underline;white-space:nowrap}</style></head><body><a id="tb-ouvrir" href="${href}" hidden>${escapeHtml(label)}</a><script>setTimeout(function(){document.getElementById("tb-ouvrir").hidden=false},1500)</script></body></html>`;
}
