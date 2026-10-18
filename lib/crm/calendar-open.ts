export type PhoneCalendarLink = { google: string | null };

export type PhoneCalendarLinks = {
  stay: PhoneCalendarLink;
  items: Record<string, PhoneCalendarLink>;
};

export type CalendarClickPlan =
  | { action: "google"; url: string }
  | { action: "external"; url: string }
  | { action: "navigate"; url: string };

export function isAndroidUa(ua: string) {
  return /Android/i.test(ua);
}

/** Safari sur iPhone ou iPad (y compris Chrome iOS, qui est WebKit). */
export function isAppleMobileBrowser(ua: string) {
  return /iPhone|iPad|iPod/i.test(ua);
}

/**
 * Safari affiche la feuille Calendrier quand le fichier est inline.
 * Chrome affiche le texte brut : on force le téléchargement.
 */
export function calendarFileDisposition(ua: string): "inline" | "attachment" {
  if (isAppleMobileBrowser(ua)) return "inline";
  if (
    /Macintosh/i.test(ua) &&
    /Version\/[\d.]+ Safari/i.test(ua) &&
    !/Chrome|Chromium|Edg\/|OPR\/|Firefox|CriOS/i.test(ua)
  ) {
    return "inline";
  }
  return "attachment";
}

/** Android : Google Agenda crée l’événement. iPhone garde le fichier .ics (un événement, pas un flux). */
export function calendarOpenTarget(opts: { ua: string; googleHref?: string | null }) {
  if (isAndroidUa(opts.ua) && opts.googleHref) return opts.googleHref;
  return null;
}

export function chosenCalendarHref(
  httpsHref: string,
  phone: PhoneCalendarLink | null | undefined,
  ua: string
) {
  return calendarOpenTarget({ ua, googleHref: phone?.google }) || httpsHref;
}

export function calendarResponsePlan(opts: {
  ua: string;
  googleHref?: string | null;
}): { kind: "redirect"; url: string } | { kind: "file"; disposition: "inline" | "attachment" } {
  const url = calendarOpenTarget(opts);
  if (url) return { kind: "redirect", url };
  return { kind: "file", disposition: calendarFileDisposition(opts.ua) };
}

/**
 * Écran d’accueil iOS : le webview affiche le .ics comme du texte.
 * On ouvre l’URL https hors de l’app pour que Safari propose Calendrier.
 * Pas de webcal : ce serait un abonnement, pas un événement.
 */
export function calendarClickPlan(opts: {
  href: string;
  googleHref?: string | null;
  ua: string;
  navigatorStandalone?: boolean;
  displayModeStandalone?: boolean;
}): CalendarClickPlan {
  const google = calendarOpenTarget({ ua: opts.ua, googleHref: opts.googleHref });
  if (google && google !== opts.href) return { action: "google", url: google };
  if (leaveIosStandalone(opts)) return { action: "external", url: opts.href };
  return { action: "navigate", url: opts.href };
}

function leaveIosStandalone(opts: {
  ua: string;
  navigatorStandalone?: boolean;
  displayModeStandalone?: boolean;
}) {
  if (isAndroidUa(opts.ua)) return false;
  if (opts.navigatorStandalone) return true;
  return Boolean(opts.displayModeStandalone && isAppleMobileBrowser(opts.ua));
}

/** Lien secondaire, quand le bouton principal n’ouvre pas déjà Google Agenda. */
export function showGoogleCalendarFallback(opts: { href: string; googleHref?: string | null; ua: string }) {
  if (!opts.googleHref || opts.googleHref === opts.href) return false;
  return !isAndroidUa(opts.ua);
}

/** Lien d’une carte : l’URL se termine par .ics, sans query, pour que le téléphone l’ouvre comme un événement. */
export function itemCalendarHref(calendarBase: string, itemId: string) {
  const id = encodeURIComponent(itemId);
  if (calendarBase.endsWith(".ics")) return `${calendarBase.slice(0, -4)}/${id}.ics`;
  return `${calendarBase}?item_id=${id}`;
}

/** Segment `…/agenda/{id}.ics` → id de la carte. */
export function calendarItemIdFromSegment(segment: string) {
  let value = segment;
  try {
    value = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (!value.toLowerCase().endsWith(".ics")) return null;
  const id = value.slice(0, -4);
  if (!id || id.includes("/") || id.includes("\\")) return null;
  return id;
}
