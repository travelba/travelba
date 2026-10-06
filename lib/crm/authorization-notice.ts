import {
  conciergeContentDrafts,
  conciergeContentSid,
  conciergeContentVariables,
  conciergePhotoTemplate,
  type ConciergeTemplate,
} from "./concierge-notices";
import { greetingGivenName } from "./identity";
import { whatsappAddress } from "./whatsapp";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";

/** Les quatre cas, pour l’ESTA et pour l’ETA Royaume-Uni. */
export const AUTHORIZATION_CASES = ["manquant", "expire", "ancien_passeport", "approuve"] as const;

export type AuthorizationCase = (typeof AUTHORIZATION_CASES)[number];
export type AuthorizationKind = "esta" | "uk_eta";

const CLOSED = new Set(["a_verifier", "non_concerne", "erreur"]);

function isoDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Trois derniers caractères, pour comparer. Le numéro complet ne sort pas d’ici. */
function last3(value: string | null | undefined) {
  const clean = String(value || "").replace(/[^A-Za-z0-9]/g, "");
  if (clean.length < 3) return null;
  return clean.slice(-3).toUpperCase();
}

export function formatAuthorizationDate(value: string | null | undefined) {
  const day = isoDay(value);
  if (!day) return null;
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function authorizationTravelerName(first: string | null | undefined, last?: string | null) {
  const given = greetingGivenName(first);
  if (given) return given;
  const full = [first, last].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
  return full || "voyageur";
}

function expiresBeforeTrip(validUntil?: string | null, returnOn?: string | null, departureOn?: string | null) {
  const valid = isoDay(validUntil);
  if (!valid) return false;
  const back = isoDay(returnOn);
  const departure = isoDay(departureOn);
  if (back && valid < back) return true;
  if (departure && valid < departure) return true;
  return false;
}

function tiedToOtherPassport(input: {
  currentNumber?: string | null;
  boundLast3?: string | null;
  currentDocumentId?: string | null;
  boundDocumentId?: string | null;
  passportIssuedOn?: string | null;
  authorizationOn?: string | null;
}) {
  const current = last3(input.currentNumber);
  const bound = last3(input.boundLast3);
  if (bound && current && bound !== current) return true;
  if (input.boundDocumentId && input.currentDocumentId && input.boundDocumentId !== input.currentDocumentId) {
    return true;
  }
  if (bound && current && bound === current) return false;
  const issued = isoDay(input.passportIssuedOn);
  const granted = isoDay(input.authorizationOn);
  return Boolean(issued && granted && issued > granted);
}

/**
 * Cas du message client.
 * Introuvable → manquant. Valable mais fin avant le retour ou le départ → expire.
 * Autre passeport (3 derniers, autre pièce, ou passeport délivré après l’autorisation) → ancien.
 * Valable pour tout le séjour → approuvé. Refus, attente et erreur n’ont pas de modèle dédié.
 */
export function authorizationNoticeCase(input: {
  status: string | null | undefined;
  validUntil?: string | null;
  returnOn?: string | null;
  departureOn?: string | null;
  passportExpires?: string | null;
  currentNumber?: string | null;
  boundLast3?: string | null;
  currentDocumentId?: string | null;
  boundDocumentId?: string | null;
  passportIssuedOn?: string | null;
  authorizationOn?: string | null;
}): AuthorizationCase | null {
  const status = String(input.status || "").trim();
  if (!status || CLOSED.has(status)) return null;
  if (status === "none") return "manquant";
  if (tiedToOtherPassport(input)) return "ancien_passeport";
  if (status === "introuvable") return "manquant";
  if (status !== "approuve") return null;
  if (expiresBeforeTrip(input.validUntil, input.returnOn, input.departureOn)) return "expire";
  const passportEnd = isoDay(input.passportExpires);
  const back = isoDay(input.returnOn);
  const valid = isoDay(input.validUntil);
  if (passportEnd && back && passportEnd < back) return null;
  if (passportEnd && valid && passportEnd < valid) return null;
  if (!valid) return null;
  return "approuve";
}

export function authorizationTextTemplate(kind: AuthorizationKind, notice: AuthorizationCase): ConciergeTemplate {
  const prefix = kind === "esta" ? "esta" : "eta_uk";
  return `${prefix}_${notice}_carte` as ConciergeTemplate;
}

export function authorizationChannelBlock(input: {
  phone?: string | null;
  email?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  textSid?: string | null;
  photoSid?: string | null;
}) {
  if (!whatsappAddress(input.phone)) return "Pas de téléphone pour WhatsApp.";
  if (!String(input.email || "").trim()) return "Pas d’adresse pour préparer le lien du séjour.";
  if (!proactiveWhatsappAllowed({ whatsapp_opt_in_at: input.optInAt, whatsapp_opt_out_at: input.optOutAt })) {
    return "WhatsApp n’est pas accepté.";
  }
  if (!input.textSid?.trim() && !input.photoSid?.trim()) return "Le modèle n’est pas encore approuvé.";
  return null;
}

export function authorizationTemplateReady(kind: AuthorizationKind, notice: AuthorizationCase) {
  const text = authorizationTextTemplate(kind, notice);
  const photo = conciergePhotoTemplate(text);
  return {
    text,
    photo,
    textSid: conciergeContentSid(text),
    photoSid: photo ? conciergeContentSid(photo) : "",
  };
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

/** Texte du modèle, variables remplies. Le bouton n’est pas dans le corps. */
export function authorizationPreview(input: {
  kind: AuthorizationKind;
  notice: AuthorizationCase;
  name: string;
  place: string | null;
  reference: string | null;
  validUntil?: string | null;
}) {
  const template = authorizationTextTemplate(input.kind, input.notice);
  const date = formatAuthorizationDate(input.validUntil);
  const variables = conciergeContentVariables({
    template,
    buttonSuffix: "c/23456789",
    place: input.place,
    reference: input.reference,
    variable: input.name,
    date,
  });
  if (!variables) return null;
  const draft = conciergeContentDrafts().find((row) => row.template === template);
  const types = draft?.create.types as { "twilio/call-to-action"?: { body?: string } } | undefined;
  const body = types?.["twilio/call-to-action"]?.body;
  if (!body) return null;
  const filled = applyVars(body, variables);
  if (/\{\{\d+\}\}/.test(filled)) return null;
  return filled;
}

export function authorizationClientFields(input: {
  kind: AuthorizationKind;
  status: string | null | undefined;
  validUntil?: string | null;
  returnOn?: string | null;
  departureOn?: string | null;
  passportExpires?: string | null;
  currentNumber?: string | null;
  boundLast3?: string | null;
  currentDocumentId?: string | null;
  boundDocumentId?: string | null;
  passportIssuedOn?: string | null;
  authorizationOn?: string | null;
  name: string;
  place: string | null;
  reference: string | null;
  sent: boolean;
  phone?: string | null;
  email?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
}) {
  const notice = authorizationNoticeCase(input);
  if (!notice) return null;
  const ready = authorizationTemplateReady(input.kind, notice);
  const preview = authorizationPreview({
    kind: input.kind,
    notice,
    name: input.name,
    place: input.place,
    reference: input.reference,
    validUntil: input.validUntil,
  });
  const sendBlock = authorizationSendBlock({
    phone: input.phone,
    email: input.email,
    optInAt: input.optInAt,
    optOutAt: input.optOutAt,
    preview,
    textSid: ready.textSid,
    photoSid: ready.photoSid,
  });
  const open = !sendBlock;
  return {
    notice,
    preview,
    sendBlock,
    canSend: open && !input.sent,
    canResend: open && input.sent,
  };
}

export function authorizationSendBlock(input: {
  phone?: string | null;
  email?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  preview: string | null;
  textSid?: string | null;
  photoSid?: string | null;
}) {
  if (!input.preview) return "Le lieu du séjour n’est pas assez précis pour ce message.";
  return authorizationChannelBlock(input);
}
