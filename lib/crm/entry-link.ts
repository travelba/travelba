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

export function entryPreviewHtml(origin: string, code: string) {
  const base = origin.replace(/\/$/, "");
  const page = entryLinkUrl(base, code);
  const title = ENTRY_PREVIEW_TITLE;
  const description = ENTRY_PREVIEW_DESCRIPTION;
  const image = `${base}/og-concierge.jpg`;
  const icon = `${base}/tba-mark.png`;
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
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="${icon}" type="image/png" sizes="512x512">
<link rel="icon" href="${base}/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" sizes="180x180">
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
