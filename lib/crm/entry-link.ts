import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SET_PASSWORD_PATH, shouldForcePasswordSetup } from "./session";
import { safeInternalPath } from "./safe-path";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Huit signes : l’URL reste courte, le code n’est pas devinable. */
export const ENTRY_CODE_LENGTH = 8;

const OTP_TYPES = new Set(["magiclink", "invite", "recovery"]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Durée de vie du lien court : 24 h pour un lien magique, 30 jours pour une invitation ou une réinitialisation. */
export function entryLinkTtlMs(otpType: string | null | undefined) {
  return safeOtpType(otpType) === "magiclink" ? 24 * HOUR_MS : 30 * DAY_MS;
}

/** Ouvertures réussies au plus pour un même lien court. */
export const MAX_ENTRY_OPENS = 5;

/** `desk` : ouverture de l’espace par un agent depuis la fiche client (lib/crm/desk-mode.ts). */
export type EntryChannel = "email" | "whatsapp" | "desk";

export function isEntryChannel(value: unknown): value is EntryChannel {
  return value === "email" || value === "whatsapp" || value === "desk";
}

/** Lignes créées avant la migration : 30 jours après la création. */
export const ENTRY_LEGACY_TTL_MS = 30 * DAY_MS;

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Expiration effective d’une ligne, même sans colonne `expires_at`. */
export function entryLinkExpiresAt(row: {
  expires_at?: string | Date | null;
  created_at?: string | Date | null;
}) {
  const explicit = asDate(row.expires_at);
  if (explicit) return explicit;
  const created = asDate(row.created_at);
  if (created) return new Date(created.getTime() + ENTRY_LEGACY_TTL_MS);
  return new Date(0);
}

export type EntryReopenDecision = "session" | "open" | "regenerate" | "refuse";

/**
 * Ce que fait l’ouverture d’un lien court.
 * - révoqué : refus, même avec une session ;
 * - une session déjà ouverte : on y va sans consommer le jeton ni compter l’ouverture ;
 * - expiré, ou déjà ouvert 5 fois : refus ;
 * - jeton encore valable : ouverture ;
 * - jeton consommé (aperçu, scanner d’e-mail) : nouveau jeton, tant que le lien est dans son délai.
 */
export function entryReopenDecision(input: {
  now: Date;
  expiresAt: Date;
  revokedAt: Date | string | null | undefined;
  openCount: number | null | undefined;
  hasSession: boolean;
  tokenValid: boolean;
}): EntryReopenDecision {
  if (asDate(input.revokedAt)) return "refuse";
  if (input.hasSession) return "session";
  if (input.now.getTime() > input.expiresAt.getTime()) return "refuse";
  if ((input.openCount ?? 0) >= MAX_ENTRY_OPENS) return "refuse";
  return input.tokenValid ? "open" : "regenerate";
}

/** Un lien parti par WhatsApp et ouvert par un client vaut consentement aux messages du Concierge. */
export function entryOptInFromLink(input: { channel: string | null | undefined; staff: boolean }) {
  return input.channel === "whatsapp" && !input.staff;
}

/**
 * `/api/covers/sejour/REF?e=CODE` : la couverture ne se sert que pour un lien vivant,
 * marqué « Votre séjour », qui pointe sur cette référence.
 */
export function entryCoverAllowed(input: {
  link: {
    revoked_at?: string | Date | null;
    expires_at?: string | Date | null;
    created_at?: string | Date | null;
    show_cover?: boolean | null;
    next_path?: string | null;
  } | null | undefined;
  reference: string;
  now: Date;
}) {
  const link = input.link;
  if (!link || link.show_cover !== true) return false;
  if (asDate(link.revoked_at)) return false;
  if (input.now.getTime() > entryLinkExpiresAt(link).getTime()) return false;
  return referenceFromNextPath(link.next_path) === input.reference;
}

/** Colonne absente : la migration `entry_links_expiry` n’est pas encore appliquée. */
export function isMissingColumnError(
  error: { message?: string | null; code?: string | null } | null | undefined,
  column: string
) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return (error.message || "").includes(column);
}

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

export function safeOtpType(value: string | null | undefined) {
  return value && OTP_TYPES.has(value) ? value : "magiclink";
}

/** Chemin de retour du lien court : interne, sinon l’espace client. */
export function safeNextPath(value: string | null | undefined) {
  return safeInternalPath(value, "/mon-compte");
}

export const ENTRY_PREVIEW_TITLE = "Le Concierge";
export const ENTRY_PREVIEW_DESCRIPTION = "Votre espace personnel vous attend.";

export type EntryPreview = {
  title: string;
  description: string;
  image: string | null;
};

/** Référence derrière `/mon-compte/reservations/TB-…`. */
export function referenceFromNextPath(path: string | null | undefined) {
  if (!path) return null;
  const match = /^\/mon-compte\/reservations\/([A-Za-z0-9-]{4,40})$/.exec(path);
  return match?.[1] || null;
}

export function stayPreviewCopy(input: {
  origin: string;
  reference: string;
  place: string | null;
  hasCover: boolean;
  /** Le code du lien lui-même : la couverture se sert avec lui, jamais avec le code de partage /v/. */
  entryCode?: string | null;
}): EntryPreview {
  const base = input.origin.replace(/\/$/, "");
  const title = input.place ? `Séjour à ${input.place}` : `Réservation ${input.reference}`;
  const code = input.entryCode && isEntryCode(input.entryCode) ? input.entryCode : null;
  return {
    title,
    description: `Réservation ${input.reference} · Travel Business Agency`,
    image: input.hasCover && code ? `${base}/api/covers/sejour/${input.reference}?e=${code}` : null,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Couverture du séjour uniquement. Pas de monogramme à la place. */
function previewImage(image: string | null | undefined) {
  if (!image || /og-concierge|tba-mark/i.test(image)) return null;
  try {
    const url = new URL(image);
    if (url.protocol !== "https:") return null;
    if (!/^\/api\/covers\/sejour\/[A-Za-z0-9-]{4,40}$/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function entryPreviewHtml(
  origin: string,
  code: string,
  stay?: EntryPreview | null,
  enter = true
) {
  const base = origin.replace(/\/$/, "");
  const page = entryLinkUrl(base, code);
  const rawTitle = (stay?.title || ENTRY_PREVIEW_TITLE).trim();
  const rawDescription = (stay?.description || ENTRY_PREVIEW_DESCRIPTION).trim();
  const title = escapeHtml(rawTitle);
  const description = escapeHtml(rawDescription);
  const lead = escapeHtml(rawDescription.replace(/\s·\sTravel Business Agency$/, ""));
  const image = previewImage(stay?.image);
  const imageUrl = image ? escapeHtml(image) : "";
  const imageTags = image
    ? `<meta property="og:image" content="${imageUrl}">
<meta property="og:image:secure_url" content="${imageUrl}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${imageUrl}">`
    : `<meta name="twitter:card" content="summary">`;
  const icon = escapeHtml(`${base}/favicon.ico`);
  const action = escapeHtml(page);
  const hero = image
    ? `<div class="hero"><img src="${imageUrl}" alt="" onerror="this.closest('main').className='door plain';this.parentElement.remove()"></div>`
    : "";
  const login = escapeHtml(`${base}/connexion`);
  const door = enter
    ? `<form method="post" action="${action}">
<input type="hidden" name="ouvrir" value="1">
<button type="submit">Ouvrir mon espace</button>
</form>`
    : `<p class="note">Ce lien ne s'ouvre plus. Demandez-en un nouveau à l'agence.</p>
<p class="note"><a class="login" href="${login}">Se connecter</a></p>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0B192C">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Travel Business Agency">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${action}">
${imageTags}
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<link rel="icon" href="${icon}" type="image/x-icon" sizes="any">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: #0B192C;
    color: #F3EDE2;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .door {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .hero {
    position: relative;
    height: 52vh;
    height: 52dvh;
    min-height: 240px;
    overflow: hidden;
    background: #12263c;
  }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero::after {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 58%;
    background: linear-gradient(to bottom, rgba(11,25,44,0), #0B192C 78%);
  }
  .sheet {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: min(100%, 480px);
    margin: -92px auto 0;
    padding: 0 22px calc(28px + env(safe-area-inset-bottom));
    position: relative;
  }
  .door.plain .sheet {
    justify-content: center;
    margin-top: 0;
    min-height: 100vh;
    min-height: 100dvh;
    padding-bottom: calc(18vh + env(safe-area-inset-bottom));
  }
  .mark {
    margin: 0 0 14px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #C5A880;
  }
  h1 {
    margin: 0;
    max-width: 16ch;
    font-family: Georgia, "Iowan Old Style", Palatino, serif;
    font-size: 34px;
    font-weight: 500;
    line-height: 1.12;
  }
  .lead { margin: 12px 0 0; font-size: 16px; line-height: 1.45; color: #E4D5BE; }
  form { margin: 28px 0 0; }
  button {
    width: 100%;
    min-height: 54px;
    border: 0;
    border-radius: 999px;
    background: #C5A880;
    color: #0B192C;
    font: 600 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer;
  }
  .note {
    max-width: 32ch;
    margin: 14px auto 0;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
    color: rgba(243, 237, 226, 0.72);
  }
  .login { color: #C5A880; font-weight: 600; text-decoration: underline; }
</style>
</head>
<body>
<main class="door ${image ? "photo" : "plain"}">
${hero}
<div class="sheet">
<p class="mark">Travel Business Agency</p>
<h1>${title}</h1>
<p class="lead">${lead}</p>
${door}
</div>
</main>
${enter ? `<script>location.replace(location.pathname+"?ouvrir=1")</script>` : ""}
</body>
</html>`;
}

export async function createEntryLink(
  supabase: SupabaseClient,
  origin: string,
  input: {
    tokenHash: string;
    otpType: string;
    nextPath: string;
    email?: string | null;
    showCover?: boolean;
    /** Par où le lien part. Un lien WhatsApp ouvert vaut opt-in. */
    channel?: EntryChannel | null;
    /** Durée de vie sur mesure (lien desk : 10 minutes). Sinon selon le type de jeton. */
    ttlMs?: number;
    /** Agent qui crée le lien (desk). */
    createdByStaffId?: string | null;
  }
) {
  const otpType = safeOtpType(input.otpType);
  const nextPath = safeNextPath(input.nextPath);
  const email = storedEntryEmail(input.email);
  const ttlMs =
    typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs) && input.ttlMs > 0
      ? input.ttlMs
      : entryLinkTtlMs(otpType);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const channel = isEntryChannel(input.channel) ? input.channel : null;
  // Un lien desk sans sa date, son canal ou son agent deviendrait un lien ordinaire de 30 jours : jamais.
  const strict = channel === "desk";
  let withExtras = true;
  let attempts = 0;
  while (attempts < 5) {
    const code = entryCode();
    const row: Record<string, unknown> = {
      code,
      token_hash: input.tokenHash,
      otp_type: otpType,
      next_path: nextPath,
      email,
      show_cover: input.showCover === true,
    };
    if (withExtras) {
      row.expires_at = expiresAt;
      row.channel = channel;
      if (input.createdByStaffId) row.created_by_staff_id = input.createdByStaffId;
    }
    const { error } = await supabase.from("crm_entry_links").insert(row);
    if (!error) return entryLinkUrl(origin, code);
    if (strict && !/duplicate|unique/i.test(error.message)) throw new Error("Lien court indisponible");
    if (withExtras && (isMissingColumnError(error, "expires_at") || isMissingColumnError(error, "channel"))) {
      // Déploiement avant la migration : le lien part quand même, sans date ni canal.
      console.warn("[entry] migration entry_links_expiry non appliquée");
      withExtras = false;
      continue;
    }
    attempts += 1;
    if (!/duplicate|unique/i.test(error.message)) throw new Error("Lien court indisponible");
  }
  throw new Error("Lien court indisponible");
}

/** Corrige le canal après coup (l’invitation apprend après l’envoi si WhatsApp est parti). Best-effort. */
export async function setEntryLinkChannel(supabase: SupabaseClient, link: string, channel: EntryChannel) {
  const code = entryCodeFromLink(link);
  if (!code || !isEntryChannel(channel)) return false;
  try {
    const { error } = await supabase.from("crm_entry_links").update({ channel }).eq("code", code);
    return !error;
  } catch {
    return false;
  }
}
