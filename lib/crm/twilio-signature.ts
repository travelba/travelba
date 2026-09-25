import { createHmac, timingSafeEqual } from "node:crypto";

/** Signature Twilio : HMAC-SHA1 du token sur l’URL puis les champs POST triés. */
export function twilioRequestSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
) {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null | undefined;
}) {
  const signature = input.signature?.trim() || "";
  const token = input.authToken.trim();
  if (!signature || !token || !input.url) return false;
  const expected = twilioRequestSignature(token, input.url, input.params);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function formParams(params: URLSearchParams | Record<string, string>) {
  if (params instanceof URLSearchParams) return Object.fromEntries(params.entries());
  return params;
}

/** URL publique que Twilio a signée (proxy inclus). */
export function twilioWebhookUrl(request: Request) {
  const pinned = process.env.TWILIO_WHATSAPP_WEBHOOK_URL?.trim();
  if (pinned) return pinned;
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}
