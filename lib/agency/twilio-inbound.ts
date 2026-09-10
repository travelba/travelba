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

function parseTwilioFormBody(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const encKey = eq === -1 ? part : part.slice(0, eq);
    const encVal = eq === -1 ? "" : part.slice(eq + 1);
    const key = decodeURIComponent(encKey.replace(/\+/g, " "));
    // Twilio signe `whatsapp:+33…` avec le « + ». FormData le transforme en espace.
    const value = decodeURIComponent(encVal.replace(/\+/g, "%2B"));
    params[key] = value;
  }
  return params;
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

function webhookUrlCandidates(request: Request): string[] {
  const urls = new Set<string>();
  const configured = (process.env.TWILIO_WEBHOOK_URL || "").trim().replace(
    /\/$/,
    ""
  );
  if (configured) urls.add(configured);

  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (site) {
    const origin = site.startsWith("http") ? site : `https://${site}`;
    urls.add(`${origin}/api/webhooks/twilio/whatsapp`);
  }

  try {
    const u = new URL(request.url);
    urls.add(`${u.origin}${u.pathname}`);
    urls.add(request.url);
    if (u.host.startsWith("www.")) {
      urls.add(`${u.protocol}//${u.host.slice(4)}${u.pathname}`);
    } else {
      urls.add(`${u.protocol}//www.${u.host}${u.pathname}`);
    }
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
  const cfg = getWhatsAppBusinessConfig();
  const signature = request.headers.get("x-twilio-signature") || "";
  const skip =
    process.env.TWILIO_WEBHOOK_VALIDATE === "0" ||
    process.env.TWILIO_WEBHOOK_VALIDATE === "false";
  const urls = webhookUrlCandidates(request);
  const signatureOk = skip
    ? true
    : Boolean(cfg.authToken) &&
      Boolean(signature) &&
      urls.some((url) =>
        validateTwilioSignature(cfg.authToken, signature, url, params)
      );

  if (!signatureOk && !skip) {
    console.warn("[wa-webhook] signature invalide", {
      urls,
      from: params.From || "",
      hasSig: Boolean(signature),
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
