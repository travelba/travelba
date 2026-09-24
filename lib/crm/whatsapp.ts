import { entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { greetingGivenName } from "./identity";
import { toE164 } from "./phone";

export const CONCIERGE_SIGNATURE = "Le Concierge";

/** Texte du modèle « connexion ». Le lien magique est le bouton, pas le corps. */
export function connexionMessage(firstName: string) {
  const name = firstName.trim();
  const hello = name ? `Enchanté ${name},` : "Enchanté,";
  return [
    hello,
    "Je suis Le Concierge de chez TBA.",
    "Votre espace personnel vous attend.",
    "Ce lien vous y conduit, il reste valable 24 heures.",
    "",
    CONCIERGE_SIGNATURE,
  ].join("\n");
}

export function greetingForWhatsapp(firstName: string | null | undefined) {
  return greetingGivenName(firstName) || "";
}

export function withConciergeSignature(body: string) {
  const trimmed = body.replace(/\s+$/u, "");
  if (trimmed.endsWith(CONCIERGE_SIGNATURE)) return trimmed;
  return `${trimmed}\n\n${CONCIERGE_SIGNATURE}`;
}

export function whatsappAddress(phone: string | null | undefined) {
  const raw = phone?.trim();
  if (!raw) return null;
  const valid = toE164(raw, "FR");
  if (!valid) return null;
  return `whatsapp:${valid}`;
}

/** Bouton du modèle Utility. {{2}} est le code court, le domaine reste fixe. */
export const CONNEXION_BUTTON_TITLE = "Ouvrir mon espace";
export const CONNEXION_BUTTON_URL = "https://travelba.fr/e/{{2}}";
export const CONNEXION_TEMPLATE_NAME = "connexion_espace";

/** Corps soumis à Meta. {{1}} = prénom. Le lien n’est pas dans le texte. */
export function connexionTemplateBody() {
  return [
    "Enchanté {{1}},",
    "Je suis Le Concierge de chez TBA.",
    "Votre espace personnel vous attend.",
    "Ce lien vous y conduit, il reste valable 24 heures.",
    "",
    CONCIERGE_SIGNATURE,
  ].join("\n");
}

/** Charge utile Twilio Content. Aucun secret dedans. */
export function connexionContentCreateBody() {
  return {
    friendly_name: CONNEXION_TEMPLATE_NAME,
    language: "fr",
    variables: { "1": "Voyageur", "2": "23456789" },
    types: {
      "twilio/call-to-action": {
        body: connexionTemplateBody(),
        actions: [
          {
            type: "URL",
            title: CONNEXION_BUTTON_TITLE,
            url: CONNEXION_BUTTON_URL,
          },
        ],
      },
    },
  };
}

/**
 * {{1}} prénom, {{2}} suffixe `c/CODE`.
 * Le bouton approuvé est `https://travelba.fr/e/{{2}}`, donc l’adresse
 * prévisualisée devient `https://travelba.fr/e/c/CODE`.
 */
export function connexionContentVariables(
  firstName: string | null | undefined,
  link: string
) {
  const code = entryCodeFromLink(link);
  if (!code) return null;
  const name = (greetingForWhatsapp(firstName) || "").replace(/[\r\n]+/g, " ").trim();
  return { "1": name || " ", "2": entryButtonSuffix(code) };
}

/** Uniquement le modèle « Enchanté… Le Concierge ». L’ancien SID générique dit autre chose. */
export function connexionContentSid() {
  return process.env.TWILIO_CONTENT_CONNEXION?.trim() || "";
}

export function whatsappConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim() &&
      connexionContentSid()
  );
}

export type WhatsappSendResult =
  | { ok: true; sid: string }
  | { ok: false; reason: "not_configured" | "no_phone" | "rejected"; detail?: string };

export function inviteWhatsappNotice(result: WhatsappSendResult) {
  if (result.ok) return "Invitation envoyée par e-mail et sur WhatsApp.";
  if (result.reason === "no_phone") {
    return "E-mail envoyé. Ce client n’a pas de téléphone valide pour WhatsApp.";
  }
  if (result.reason === "not_configured") return "E-mail envoyé. WhatsApp n’est pas configuré.";
  return "E-mail envoyé. WhatsApp a refusé le message.";
}

/**
 * Envoie le modèle Utility « connexion ».
 * {{1}} prénom, {{2}} code du bouton « Ouvrir mon espace ».
 * N’écrit ni le lien ni le numéro dans les logs.
 */
export async function sendConnexionWhatsapp(input: {
  phone: string | null | undefined;
  firstName: string | null | undefined;
  link: string;
  fetchImpl?: typeof fetch;
}): Promise<WhatsappSendResult> {
  const to = whatsappAddress(input.phone);
  if (!to) return { ok: false, reason: "no_phone" };
  if (!whatsappConfigured()) return { ok: false, reason: "not_configured" };

  const variables = connexionContentVariables(input.firstName, input.link);
  if (!variables) return { ok: false, reason: "rejected", detail: "lien court absent" };

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM!.trim();
  const contentSid = connexionContentSid();
  const body = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: to,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  });

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
        body,
        signal: AbortSignal.timeout(12_000),
      }
    );
  } catch {
    return { ok: false, reason: "rejected" };
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    const detail = (payload?.message || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\+?\d{8,}/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return { ok: false, reason: "rejected", detail: detail || undefined };
  }
  const payload = (await response.json().catch(() => null)) as { sid?: string } | null;
  if (!payload?.sid) return { ok: false, reason: "rejected" };
  return { ok: true, sid: payload.sid };
}
