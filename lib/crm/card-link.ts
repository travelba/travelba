import { createHash, randomInt } from "node:crypto";
import { CARD_LINK_ALPHABET as ALPHABET, CARD_LINK_CODE_LENGTH } from "./card-link-text";

export { CARD_LINK_CODE_LENGTH, redactCardLinks } from "./card-link-text";

/**
 * Lien carte pour l’hôtel (B-04) : plus de numéro ni de cryptogramme par e-mail.
 * L’e-mail porte un lien court `/k/CODE` ; la carte s’affiche dans le cadre sécurisé de Pliant
 * (ou la carte déposée par le client), quelques fois au plus, jusqu’à peu après le départ.
 * Seule l’empreinte du code est en base ; chaque ouverture est journalisée (`crm_card_views`).
 */

/** Réception, comptabilité, une erreur : trois ouvertures suffisent. */
export const CARD_LINK_MAX_OPENS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LIFETIME_MS = 2 * DAY_MS;
const MAX_LIFETIME_MS = 45 * DAY_MS;

export type CardLinkSource = "pliant" | "client";

export function cardLinkCode(length = CARD_LINK_CODE_LENGTH) {
  let code = "";
  for (let index = 0; index < length; index += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isCardLinkCode(value: string) {
  return new RegExp(`^[${ALPHABET}]{${CARD_LINK_CODE_LENGTH}}$`).test(value);
}

/** Empreinte stockée : un accès en lecture à la base ne donne pas les liens. */
export function cardLinkHash(code: string) {
  return createHash("sha256").update(`travelba:card-link:${code}`).digest("hex");
}

export function cardLinkUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/k/${code}`;
}

/**
 * Fin de validité : le jour de fermeture de la carte (`cardCloseDate`, départ + 3 jours), fin de
 * journée à Paris. Au moins 48 h après l’envoi, au plus 45 jours.
 */
export function cardLinkExpiresAt(closeDate: string | null | undefined, now = new Date()) {
  const floor = now.getTime() + MIN_LIFETIME_MS;
  const ceiling = now.getTime() + MAX_LIFETIME_MS;
  const close = /^\d{4}-\d{2}-\d{2}$/.test(closeDate || "") ? Date.parse(`${closeDate}T22:00:00Z`) : NaN;
  const target = Number.isFinite(close) ? close : floor;
  return new Date(Math.min(ceiling, Math.max(floor, target)));
}

export type CardLinkDecision = "open" | "refuse";

export function cardLinkDecision(input: {
  now: Date;
  expiresAt: Date | string | null | undefined;
  revokedAt: Date | string | null | undefined;
  openCount: number | null | undefined;
  maxOpens?: number | null;
}): CardLinkDecision {
  if (input.revokedAt) return "refuse";
  const expires = input.expiresAt ? new Date(input.expiresAt).getTime() : NaN;
  if (!Number.isFinite(expires) || input.now.getTime() > expires) return "refuse";
  if ((input.openCount ?? 0) >= (input.maxOpens ?? CARD_LINK_MAX_OPENS)) return "refuse";
  return "open";
}

function frenchDay(date: Date) {
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

function englishDay(date: Date) {
  return date.toLocaleDateString("en-GB", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" });
}

/** Paragraphe ajouté au courrier : le lien remplace la pièce jointe. Aucun chiffre de carte. */
export function cardLinkNote(input: {
  choice: CardLinkSource;
  lang: "fr" | "en";
  url: string;
  expiresAt: Date;
  maxOpens?: number;
}) {
  const opens = input.maxOpens ?? CARD_LINK_MAX_OPENS;
  if (input.lang === "fr") {
    const what = input.choice === "client" ? "La carte du client" : "La carte d’enregistrement";
    const lines = [
      `${what} s’ouvre par ce lien sécurisé (valable jusqu’au ${frenchDay(input.expiresAt)}, ${opens} ouvertures au plus) :`,
      input.url,
      "Pour votre sécurité, le numéro de carte n’est jamais envoyé par e-mail.",
    ];
    if (input.choice === "client") lines.push("Merci de ne pas encaisser le séjour sur une autre carte.");
    return lines.join("\n");
  }
  const what = input.choice === "client" ? "The guest’s card" : "The check-in card";
  const lines = [
    `${what} opens from this secure link (valid until ${englishDay(input.expiresAt)}, up to ${opens} views):`,
    input.url,
    "For your security, card numbers are never sent by e-mail.",
  ];
  if (input.choice === "client") lines.push("Please do not charge the stay to another card.");
  return lines.join("\n");
}

/** La photo de la carte d’un client se garde jusqu’à la fermeture de la carte (départ + 3 jours), pas après. */
export function clientCardPurgeDue(closeDate: string | null | undefined, parisToday: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate || "")) return false;
  return (closeDate as string) < parisToday;
}
