import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SET_PASSWORD_PATH, shouldForcePasswordSetup } from "./session";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Huit signes : l’URL reste courte, le code n’est pas devinable. */
export const ENTRY_CODE_LENGTH = 8;

const OTP_TYPES = new Set(["magiclink", "invite", "recovery"]);

export function entryCode(length = ENTRY_CODE_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isEntryCode(value: string) {
  return new RegExp(`^[${ALPHABET}]{${ENTRY_CODE_LENGTH}}$`).test(value);
}

/**
 * Code du lien, quel que soit l’hôte.
 * L’aperçu WhatsApp est `/e/c/CODE` : une autre adresse que `/e/CODE`,
 * pour ne pas réutiliser une carte déjà mise en cache.
 */
export function entryCodeFromLink(link: string) {
  try {
    const path = new URL(link).pathname.replace(/\/+$/, "");
    const code = path.split("/").pop() || "";
    if (!isEntryCode(code)) return null;
    if (path !== `/e/${code}` && path !== `/e/c/${code}`) return null;
    return code;
  } catch {
    return null;
  }
}

/** Suffixe du bouton `https://travelba.fr/e/{{2}}`. */
export function entryButtonSuffix(code: string) {
  return `c/${code}`;
}

export function entryLinkUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/e/c/${code}`;
}

const CRAWLER =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|skypeuripreview|applebot|iframely|pinterest|redditbot|vkshare|meta-externalagent/i;

export function isLinkCrawler(userAgent: string | null) {
  return CRAWLER.test(userAgent || "");
}

export type PreviewNavigation = {
  mode?: string | null;
  dest?: string | null;
  site?: string | null;
};

/**
 * L’adresse du bouton reste l’aperçu. Un 307 ici, WhatsApp le suit
 * et ne garde que le domaine. L’ouverture est `?ouvrir=1`, posé par
 * le script : le robot ne l’exécute pas.
 */
export function shouldServePreview(
  _userAgent: string | null,
  _secFetchUser: string | null,
  _navigation?: PreviewNavigation | null
) {
  return true;
}

export function storedEntryEmail(value: string | null | undefined) {
  const email = (value || "").trim().toLowerCase();
  if (!email || email.length > 320 || /[\s<>]/.test(email)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Après la session. Jamais /connexion : le lien court ouvre l’espace ou le mot de passe. */
export function entryDestination(input: {
  nextPath: string | null | undefined;
  otpType: string | null | undefined;
  staff: boolean;
  mustSetPassword: boolean;
}) {
  const next = safeNextPath(input.nextPath);
  if (
    shouldForcePasswordSetup({
      flagged: input.mustSetPassword,
      type: safeOtpType(input.otpType),
      next,
    })
  ) {
    return SET_PASSWORD_PATH;
  }
  if (next.startsWith("/admin") && input.staff) return next;
  if (next.split("?")[0] === "/connexion") return "/mon-compte";
  return next;
}

export function entryOpenRequested(search: string) {
  return new URLSearchParams(search).get("ouvrir") === "1";
}

/** Le robot d’aperçu. Pas le navigateur intégré, dont l’agent contient « WhatsApp » plus loin. */
export function isPreviewBot(userAgent: string | null) {
  const ua = (userAgent || "").trim();
  if (!ua) return false;
  if (/^WhatsApp\//i.test(ua)) return true;
  return /facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|skypeuripreview|applebot|iframely|pinterest|redditbot|vkshare/i.test(
    ua
  );
}

function isPrefetch(purpose: string | null) {
  return /prefetch/i.test(purpose || "");
}

/**
 * Ouvre au GET seulement pour un appui humain.
 * L’adresse nue reste l’aperçu : WhatsApp suit un 307 et perd la carte.
 * `?ouvrir=1` vient du script. Le robot ne l’exécute pas.
 */
export function shouldOpenFromGet(input: {
  search: string;
  userAgent: string | null;
  secFetchUser: string | null;
  secFetchDest: string | null;
  purpose: string | null;
}) {
  if (isPrefetch(input.purpose)) return false;
  if (isPreviewBot(input.userAgent)) return false;
  if (entryOpenRequested(input.search)) return true;
  return input.secFetchUser === "?1" && (input.secFetchDest || "document") === "document";
}

export function shouldOpenFromRequest(url: string, headers: Headers) {
  return shouldOpenFromGet({
    search: new URL(url).search,
    userAgent: headers.get("user-agent"),
    secFetchUser: headers.get("sec-fetch-user"),
    secFetchDest: headers.get("sec-fetch-dest"),
    purpose: headers.get("sec-purpose") || headers.get("purpose"),
  });
}
