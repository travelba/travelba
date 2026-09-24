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

export function entryLinkUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/e/${code}`;
}

const CRAWLER =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|skypeuripreview|applebot|iframely|pinterest|redditbot|vkshare|meta-externalagent/i;

export function isLinkCrawler(userAgent: string | null) {
  return CRAWLER.test(userAgent || "");
}

/** Aperçu (WhatsApp, collage) : pas de redirection, le jeton n’est pas consommé. */
export function shouldServePreview(userAgent: string | null, secFetchUser: string | null) {
  if (isLinkCrawler(userAgent)) return true;
  return secFetchUser !== "?1";
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

export function entryPreviewHtml(origin: string, code: string) {
  const base = origin.replace(/\/$/, "");
  const page = entryLinkUrl(base, code);
  const title = "Le Concierge TBA";
  const description = "Votre espace vous attend.";
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
<meta property="og:image" content="${base}/og-concierge.png">
<meta property="og:image:secure_url" content="${base}/og-concierge.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${base}/og-concierge.png">
<link rel="icon" href="${base}/favicon.ico" sizes="any">
<link rel="icon" href="${base}/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="${base}/favicon.png" type="image/png" sizes="512x512">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" sizes="180x180">
</head>
<body style="margin:0;background:#0B192C;color:#F3EDE2;font-family:Georgia,serif">
<form id="go" method="post" action="${page}" style="padding:48px">
<p style="margin:0 0 24px;font-size:28px">${title}</p>
<button type="submit" style="background:#C5A880;color:#0B192C;border:0;padding:14px 22px;font:inherit;cursor:pointer">Ouvrir mon espace</button>
</form>
<script>document.getElementById("go").submit()</script>
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
