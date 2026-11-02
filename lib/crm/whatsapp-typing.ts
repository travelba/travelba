const TYPING_URL = "https://messaging.twilio.com/v2/Indicators/Typing.json";

/**
 * Indicateur de saisie WhatsApp. Twilio marque aussi le message comme lu.
 * Échec ignoré : la réponse ne l’attend pas.
 */
export async function signalWhatsappTyping(input: {
  messageSid: string;
  accountSid: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}) {
  const sid = input.messageSid.trim();
  const accountSid = input.accountSid.trim();
  const token = input.authToken.trim();
  if (!sid || !accountSid || !token) return;
  const body = new URLSearchParams({ messageId: sid, channel: "whatsapp" });
  try {
    await (input.fetchImpl || fetch)(TYPING_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(1500),
    });
  } catch (err) {
    console.error("[whatsapp-concierge] typing", err instanceof Error ? err.name : "error");
  }
}
