import { createHmac, timingSafeEqual } from "crypto";
import { normalizeWhatsAppDigits } from "@/lib/agency/whatsapp";
import { getWhatsAppBusinessConfig } from "@/lib/agency/whatsapp";

export type TwilioInboundMedia = {
  url: string;
  contentType: string;
};

export type TwilioInbound = {
  messageSid: string;
  accountSid: string;
  from: string;
  fromDigits: string;
  to: string;
  body: string;
  buttonPayload: string | null;
  numMedia: number;
  media: TwilioInboundMedia[];
  profileName: string | null;
  raw: Record<string, string>;
};

function envUnprefixed(name: string, value: string) {
  const trimmed = value.trim();
  const prefix = `${name}=`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
}

function restoreWhatsAppPluses(params: Record<string, string>) {
  const next: Record<string, string> = { ...params };
  for (const key of Object.keys(next)) {
    next[key] = next[key].replace(/^whatsapp:\s+/, "whatsapp:+");
  }
  return next;
}

/** application/x-www-form-urlencoded : `+` = espace, `%2B` = plus. */
function parseTwilioFormBody(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    params[key] = value;
  }
  return restoreWhatsAppPluses(params);
}

/** Variante si Twilio a envoyé un « + » littéral (pas %2B) dans From/To. */
function parseTwilioFormBodyPlusPreserving(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const encKey = eq === -1 ? part : part.slice(0, eq);
    const encVal = eq === -1 ? "" : part.slice(eq + 1);
    const key = decodeURIComponent(encKey.replace(/\+/g, " "));
    const value = decodeURIComponent(encVal.replace(/\+/g, "%2B"));
    params[key] = value;
  }
  return restoreWhatsAppPluses(params);
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken)
    .update(data, "utf8")
    .digest("base64");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function expandWebhookUrls(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const noSlash = trimmed.replace(/\/$/, "");
  const out = new Set<string>([trimmed, noSlash, `${noSlash}/`]);
  try {
    const u = new URL(noSlash);
    if (u.protocol === "https:" && !u.port) {
      out.add(`https://${u.host}:443${u.pathname}${u.search}`);
    }
  } catch {
    // ignore
  }
  return [...out];
}

function webhookUrlCandidates(request: Request): string[] {
  const urls = new Set<string>();
  const configured = envUnprefixed(
    "TWILIO_WEBHOOK_URL",
    process.env.TWILIO_WEBHOOK_URL || ""
  ).replace(/\/$/, "");
  if (configured) expandWebhookUrls(configured).forEach((u) => urls.add(u));

  const site = envUnprefixed(
    "NEXT_PUBLIC_SITE_URL",
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ""
  ).replace(/\/$/, "");
  if (site) {
    const origin = site.startsWith("http") ? site : `https://${site}`;
    expandWebhookUrls(`${origin}/api/webhooks/twilio/whatsapp`).forEach((u) =>
      urls.add(u)
    );
  }

  try {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      "";
    if (host) {
      expandWebhookUrls(
        `${proto}://${host}/api/webhooks/twilio/whatsapp`
      ).forEach((u) => urls.add(u));
    }
    const u = new URL(request.url);
    expandWebhookUrls(`${u.origin}${u.pathname}`).forEach((x) => urls.add(x));
    urls.add(request.url);
  } catch {
    // ignore
  }

  return [...urls].filter(Boolean);
}

export async function parseTwilioInbound(request: Request): Promise<{
  inbound: TwilioInbound;
  params: Record<string, string>;
  signatureOk: boolean;
}> {
  const raw = await request.text();
  const params = parseTwilioFormBody(raw);
  const paramsPlus = parseTwilioFormBodyPlusPreserving(raw);
  const cfg = getWhatsAppBusinessConfig();
  const authToken = envUnprefixed("TWILIO_AUTH_TOKEN", cfg.authToken);
  const signature = request.headers.get("x-twilio-signature") || "";
  const skip =
    process.env.TWILIO_WEBHOOK_VALIDATE === "0" ||
    process.env.TWILIO_WEBHOOK_VALIDATE === "false";
  const urls = webhookUrlCandidates(request);
  const paramSets = [params, paramsPlus];
  const signatureOk = skip
    ? true
    : Boolean(authToken) &&
      Boolean(signature) &&
      urls.some((url) =>
        paramSets.some((set) =>
          validateTwilioSignature(authToken, signature, url, set)
        )
      );

  if (!signatureOk && !skip) {
    console.warn("[wa-webhook] signature invalide", {
      urls,
      from: params.From || "",
      profileName: params.ProfileName || "",
      hasSig: Boolean(signature),
      hasToken: Boolean(authToken),
      tokenLen: authToken.length,
    });
  }

  const from = params.From || "";
  const fromDigits =
    normalizeWhatsAppDigits(from) || from.replace(/\D/g, "");
  const numMedia = Math.min(Number(params.NumMedia || 0) || 0, 10);
  const media: TwilioInboundMedia[] = [];
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params[`MediaUrl${i}`];
    if (!mediaUrl) continue;
    media.push({
      url: mediaUrl,
      contentType: params[`MediaContentType${i}`] || "application/octet-stream",
    });
  }

  const body = (params.Body || params.ButtonText || "").trim();
  const buttonPayload = (params.ButtonPayload || params.ButtonText || "").trim() || null;

  return {
    inbound: {
      messageSid: params.MessageSid || params.SmsSid || "",
      accountSid: params.AccountSid || "",
      from,
      fromDigits,
      to: params.To || "",
      body,
      buttonPayload,
      numMedia,
      media,
      profileName: params.ProfileName || null,
      raw: params,
    },
    params,
    signatureOk,
  };
}

export async function downloadTwilioMedia(
  url: string,
  contentType: string,
  index: number
) {
  const cfg = getWhatsAppBusinessConfig();
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString(
    "base64"
  );

  const first = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: "manual",
  });

  let res = first;
  if (first.status >= 300 && first.status < 400) {
    const loc = first.headers.get("location");
    if (!loc) throw new Error("Média Twilio : redirection sans Location");
    res = await fetch(loc);
  }

  if (!res.ok) {
    throw new Error(`Téléchargement média Twilio ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const type =
    res.headers.get("content-type") || contentType || "application/octet-stream";
  const ext = extensionFromMime(type);
  return {
    name: `whatsapp-${Date.now()}-${index}${ext}`,
    type,
    buffer,
    size: buffer.byteLength,
  };
}

function extensionFromMime(mime: string) {
  const t = mime.split(";")[0].trim().toLowerCase();
  if (t === "application/pdf") return ".pdf";
  if (t === "image/jpeg") return ".jpg";
  if (t === "image/png") return ".png";
  if (t === "image/webp") return ".webp";
  if (t === "image/heic" || t === "image/heif") return ".heic";
  if (t === "image/gif") return ".gif";
  return ".bin";
}

export function emptyTwiml() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    }
  );
}
