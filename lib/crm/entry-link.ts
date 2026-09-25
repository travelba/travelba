import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Le robot d’aperçu (WhatsApp/…, facebookexternalhit) reste sur la page.
 * Un navigateur, même ouvert depuis WhatsApp, entre dans l’espace.
 */
export function shouldServePreview(userAgent: string | null, _secFetchUser: string | null) {
  const ua = userAgent || "";
  if (/^WhatsApp\//i.test(ua.trim())) return true;
  return /facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|skypeuripreview|iframely|pinterest|redditbot|vkshare/i.test(
    ua
  );
}

export function entryOpenRequested(search: string) {
  return new URLSearchParams(search).get("ouvrir") === "1";
}

export function safeOtpType(value: string | null | undefined) {
  return value && OTP_TYPES.has(value) ? value : "magiclink";
}

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/mon-compte";
  }
  return value;
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
}): EntryPreview {
  const base = input.origin.replace(/\/$/, "");
  const title = input.place ? `Séjour à ${input.place}` : `Réservation ${input.reference}`;
  return {
    title,
    description: `Réservation ${input.reference} · Travel Business Agency`,
    image: input.hasCover ? `${base}/api/covers/sejour/${input.reference}` : null,
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

export function entryPreviewHtml(origin: string, code: string, stay?: EntryPreview | null) {
  const base = origin.replace(/\/$/, "");
  const page = entryLinkUrl(base, code);
  const title = escapeHtml((stay?.title || ENTRY_PREVIEW_TITLE).trim());
  const description = escapeHtml((stay?.description || ENTRY_PREVIEW_DESCRIPTION).trim());
  const image = previewImage(stay?.image);
  const imageTags = image
    ? `<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(image)}">`
    : `<meta name="twitter:card" content="summary">`;
  const icon = `${base}/favicon.ico`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Travel Business Agency">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${page}">
${imageTags}
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<link rel="icon" href="${icon}" type="image/x-icon" sizes="any">
</head>
<body style="margin:0;background:#0B192C;color:#F3EDE2;font-family:Georgia,serif">
<p style="margin:0;padding:48px;font-size:28px">${title}</p>
<p style="margin:0;padding:0 48px 48px;font-size:18px">${description}</p>
<form method="post" action="${page}">
<input type="hidden" name="ouvrir" value="1">
<button type="submit" style="background:#C5A880;color:#0B192C;border:0;padding:14px 22px;font:inherit;cursor:pointer">Ouvrir mon espace</button>
</form>
</body>
</html>`;
}

export async function createEntryLink(
  supabase: SupabaseClient,
  origin: string,
  input: { tokenHash: string; otpType: string; nextPath: string }
) {
  const otpType = safeOtpType(input.otpType);
  const nextPath = safeNextPath(input.nextPath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = entryCode();
    const { error } = await supabase.from("crm_entry_links").insert({
      code,
      token_hash: input.tokenHash,
      otp_type: otpType,
      next_path: nextPath,
    });
    if (!error) return entryLinkUrl(origin, code);
    if (!/duplicate|unique/i.test(error.message)) throw new Error("Lien court indisponible");
  }
  throw new Error("Lien court indisponible");
}
