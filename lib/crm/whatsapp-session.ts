import { whatsappAddress } from "./whatsapp";

export function whatsappSessionConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim()
  );
}

function safeTwilioDetail(message: string) {
  return message
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/**
 * Texte libre dans la fenêtre de 24 h ouverte par le message du client.
 * Pas de modèle Meta : le corps part tel quel.
 */
export async function sendWhatsappSession(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; sid: string } | { ok: false; detail?: string }> {
  if (!whatsappSessionConfigured()) return { ok: false, detail: "not_configured" };
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM!.trim();
  const from = fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;
  const params = new URLSearchParams({
    From: from,
    To: input.to,
    Body: input.body,
  });
  if (input.mediaUrl?.startsWith("https://")) params.set("MediaUrl", input.mediaUrl);

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: AbortSignal.timeout(12_000),
      }
    );
  } catch {
    return { ok: false };
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    const detail = safeTwilioDetail(payload?.message || "");
    return { ok: false, detail: detail || undefined };
  }
  const payload = (await response.json().catch(() => null)) as { sid?: string } | null;
  if (!payload?.sid) return { ok: false };
  return { ok: true, sid: payload.sid };
}

export function sessionAddress(phone: string) {
  return whatsappAddress(phone);
}
