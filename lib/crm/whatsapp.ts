import { entryButtonSuffix, entryCodeFromLink } from "./entry-code";
import { resolveContentSid } from "./twilio-content-sid";
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

/** Enlève une signature de fin, répétée, avec ou sans point. Le « Le Concierge » d’une phrase reste. */
function stripConciergeSignature(body: string) {
  let text = body.replace(/\s+$/u, "");
  const tail = /(?:^|\n)[ \t]*le concierge\.?[ \t]*$/i;
  while (tail.test(text)) {
    text = text.replace(tail, "").replace(/\s+$/u, "");
  }
  return text.trim();
}

export function withConciergeSignature(body: string) {
  const trimmed = stripConciergeSignature(body);
  if (!trimmed) return CONCIERGE_SIGNATURE;
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
  return deliverTwilioContent({
    to,
    contentSid: await resolveContentSid("TWILIO_CONTENT_CONNEXION", input.fetchImpl),
    variables,
    fetchImpl: input.fetchImpl,
  });
}

export function twilioFromNumber() {
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
  if (!from) return "";
  return from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

export function twilioReady() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      twilioFromNumber()
  );
}

/** Modèle Utility déjà approuvé. Sans SID, aucun appel Twilio. */
export async function sendContentTemplate(input: {
  phone: string | null | undefined;
  contentSid: string;
  variables: Record<string, string> | null;
  fetchImpl?: typeof fetch;
}): Promise<WhatsappSendResult> {
  const to = whatsappAddress(input.phone);
  if (!to) return { ok: false, reason: "no_phone" };
  const contentSid = input.contentSid.trim();
  if (!contentSid || !twilioReady()) return { ok: false, reason: "not_configured" };
  if (!input.variables) return { ok: false, reason: "rejected", detail: "variables absentes" };
  return deliverTwilioContent({
    to,
    contentSid,
    variables: input.variables,
    fetchImpl: input.fetchImpl,
  });
}

function twilioErrorCode(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^\d{3,6}$/.test(value.trim())) return value.trim();
  return "";
}

/**
 * Twilio a accepté le message. `failed`, `undelivered` ou un `error_code`
 * (souvent 63016, hors fenêtre) ne comptent pas comme un envoi.
 */
export function twilioAcceptedSend(payload: {
  sid?: string | null;
  error_code?: number | string | null;
  status?: string | null;
} | null): { ok: true; sid: string } | { ok: false; detail?: string } {
  const sid = payload?.sid?.trim() || "";
  if (!sid) return { ok: false };
  const status = (payload?.status || "").trim().toLowerCase();
  const code = twilioErrorCode(payload?.error_code);
  if (code || status === "failed" || status === "undelivered") {
    return { ok: false, detail: [status || "failed", code].filter(Boolean).join(" ") };
  }
  return { ok: true, sid };
}

export function redactTwilioDetail(value: string | null | undefined) {
  return (value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Phrase française pour un accusé Twilio. Le numéro de téléphone n’y entre pas. */
export function whatsappFailureSentence(code: string | null | undefined, detail?: string | null) {
  const normalized = twilioErrorCode(code) || (detail || "").match(/\b(63016|470)\b/)?.[1] || "";
  const text = redactTwilioDetail(detail);
  if (normalized === "63016" || normalized === "470" || /outside the allowed window|24 hour|fenêtre de 24/i.test(text)) {
    return "Hors des 24 heures. WhatsApp refuse un message libre si la personne n’a pas écrit aujourd’hui.";
  }
  if (normalized) return `WhatsApp n’a pas remis le message (erreur ${normalized}).`;
  return "WhatsApp n’a pas remis le message.";
}

/** Erreur à écrire sur un accusé `failed` ou `undelivered`. Null pour les autres statuts. */
export function whatsappCallbackFailure(status: string, code?: string | null, message?: string | null) {
  const normalized = status.trim().toLowerCase();
  if (normalized !== "failed" && normalized !== "undelivered") return null;
  const sentence = whatsappFailureSentence(code, message);
  const known = twilioErrorCode(code);
  if (known && !sentence.includes(known)) return `${sentence} (${known})`.slice(0, 300);
  return sentence;
}

async function deliverTwilioContent(input: {
  to: string;
  contentSid: string;
  variables: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<WhatsappSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = twilioFromNumber();
  const body = new URLSearchParams({
    From: from,
    To: input.to,
    ContentSid: input.contentSid,
    ContentVariables: JSON.stringify(input.variables),
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
  const payload = (await response.json().catch(() => null)) as {
    sid?: string;
    error_code?: number | null;
    status?: string;
  } | null;
  const accepted = twilioAcceptedSend(payload);
  if (!accepted.ok) return { ok: false, reason: "rejected", detail: accepted.detail };
  return { ok: true, sid: accepted.sid };
}
