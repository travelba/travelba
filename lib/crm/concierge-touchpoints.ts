import { addIsoDays } from "./dates";
import { civilDate } from "./concierge-when";
import { conciergeTemplate, renderConciergeTemplate, templateIsArmed } from "./concierge-templates";
import type { ConciergeDossier, ReplyLang } from "./whatsapp-concierge";

/** Note d’agence. Elle ne part jamais au client. */
export const TEMPLATE_NOT_SUBMITTED = "Modèle non soumis à Meta.";

export const TOUCHPOINT_KINDS = ["predeparture", "checkin", "feedback"] as const;

export type TouchpointKind = (typeof TOUCHPOINT_KINDS)[number];

export type TouchpointFacts = {
  flightNumber?: string | null;
  flightClock?: string | null;
  hotelName?: string | null;
  /** true : un hôtel commence aujourd’hui. false : des hôtels, aucun aujourd’hui. Absent : on se fie au début du séjour. */
  hotelArrival?: boolean;
  /** true : un passeport est au coffre. false : aucun. Absent : on ne tranche pas. */
  passportInVault?: boolean | null;
};

/**
 * Définitions Utility prêtes à soumettre. Rien ici n’appelle Twilio ni Meta.
 * Hors fenêtre de 24 h, l’envoi attend qu’un modèle soit approuvé.
 */
export const TOUCHPOINT_CONTENT_DRAFTS = [
  {
    friendly_name: "concierge_veille",
    language: "fr",
    category: "UTILITY",
    submitted: false,
    variables: { "1": "Camille", "2": "à Tel Aviv", "3": "Votre vol LY320 décolle à 9h15." },
    types: {
      "twilio/text": {
        body: "Bonjour {{1}}, votre séjour {{2}} commence demain. {{3}} Vos pièces sont dans votre carnet.",
      },
    },
  },
  {
    friendly_name: "concierge_arrivee",
    language: "fr",
    category: "UTILITY",
    submitted: false,
    variables: { "1": "Camille", "2": "à The Norman" },
    types: {
      "twilio/text": {
        body: "Bonjour {{1}}, bienvenue {{2}}. Besoin de quelque chose ?",
      },
    },
  },
  {
    friendly_name: "concierge_merci",
    language: "fr",
    category: "UTILITY",
    submitted: false,
    variables: { "1": "Camille", "2": "à Tel Aviv" },
    types: {
      "twilio/text": {
        body: "Bonjour {{1}}, merci pour ce séjour {{2}}. Comment s’est-il passé ?",
      },
    },
  },
] as const;

export function safeFlightNumber(value: string | null | undefined) {
  const token = (value || "").trim().toUpperCase();
  return /^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(token) ? token : "";
}

export function speakClock(clock: string | null | undefined, lang: ReplyLang) {
  const match = (clock || "").match(/^(\d{1,2})h(\d{2})$/);
  if (!match) return "";
  const hour = String(Number(match[1]));
  if (lang === "en") return match[2] === "00" ? `${hour}:00` : `${hour}:${match[2]}`;
  return match[2] === "00" ? `${hour}h` : `${hour}h${match[2]}`;
}

export function clientTouchpointBody(body: string) {
  return body
    .split("\n")
    .filter((line) => line.trim() !== TEMPLATE_NOT_SUBMITTED)
    .join("\n")
    .trim();
}

export function touchpointDay(now: Date) {
  return civilDate(now, "Europe/Paris");
}

export function touchpointSendable(dueAt: string, now: Date) {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return civilDate(due, "Europe/Paris") === touchpointDay(now);
}

function papersLine(lang: ReplyLang, passport: boolean | null | undefined) {
  if (lang === "en") {
    if (passport === true) return "Your passport is in the vault.";
    if (passport === false) return "I don’t see the passport in the vault.";
    return "Your documents are in your travel journal.";
  }
  if (lang === "he") {
    if (passport === true) return "הדרכון בכספת.";
    if (passport === false) return "אני לא רואה את הדרכון בכספת.";
    return "המסמכים ביומן.";
  }
  if (passport === true) return "Votre passeport est au coffre.";
  if (passport === false) return "Je ne vois pas le passeport au coffre.";
  return "Vos pièces sont dans votre carnet.";
}

export function templateVolPhrase(lang: ReplyLang, facts: TouchpointFacts | undefined) {
  const number = safeFlightNumber(facts?.flightNumber);
  const clock = speakClock(facts?.flightClock, lang);
  return flightLine(lang, number, clock);
}

function flightLine(lang: ReplyLang, number: string, clock: string) {
  if (!number) return "";
  if (lang === "en") return clock ? `Your flight ${number} leaves at ${clock}.` : `Your flight ${number} is tomorrow.`;
  if (lang === "he") return clock ? `הטיסה ${number} ממריאה ב-${clock}.` : `הטיסה ${number} היא מחר.`;
  return clock ? `Votre vol ${number} décolle à ${clock}.` : `Votre vol ${number} est demain.`;
}

function named(firstName: string | null | undefined, sentence: string) {
  const name = (firstName || "").replace(/[\r\n]+/g, " ").trim();
  const body = sentence.trim();
  if (!name) return body.charAt(0).toUpperCase() + body.slice(1);
  return `${name}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
}

export function veilleSentence(
  lang: ReplyLang,
  firstName: string | null | undefined,
  destination: string,
  facts: TouchpointFacts | undefined
) {
  const number = safeFlightNumber(facts?.flightNumber);
  const clock = speakClock(facts?.flightClock, lang);
  const vol = flightLine(lang, number, clock);
  const place = destination.trim();
  let lead = "";
  if (lang === "en") {
    lead = vol || (place ? `Your stay ${place} starts tomorrow.` : "Your departure is tomorrow.");
  } else if (lang === "he") {
    lead = vol || (place ? `השהות ${place} מתחילה מחר.` : "היציאה מחר.");
  } else {
    lead = vol || (place ? `Votre séjour ${place} commence demain.` : "Votre départ est demain.");
  }
  return named(firstName, `${lead} ${papersLine(lang, facts?.passportInVault)}`);
}

export function arrivalSentence(lang: ReplyLang, firstName: string | null | undefined, hotelName: string | null | undefined, lieu: string) {
  const hotel = (hotelName || "").replace(/[\r\n]+/g, " ").trim();
  const place = hotel || lieu.replace(/^à\s+|^in\s+|^to\s+/i, "").trim();
  if (lang === "en") {
    return named(firstName, place ? `Welcome to ${place}. Do you need anything?` : "Welcome. Do you need anything?");
  }
  if (lang === "he") {
    return named(firstName, place ? `ברוכים הבאים ל-${place}. צריכים משהו?` : "ברוכים הבאים. צריכים משהו?");
  }
  return named(firstName, place ? `Bienvenue à ${place}. Besoin de quelque chose ?` : "Bienvenue. Besoin de quelque chose ?");
}

export function returnSentence(lang: ReplyLang, firstName: string | null | undefined, destination: string) {
  const place = destination.trim();
  if (lang === "en") {
    return named(firstName, place ? `Thank you for this stay ${place}. How was it?` : "Thank you for this stay. How was it?");
  }
  if (lang === "he") {
    return named(firstName, place ? `תודה על השהות ${place}. איך היה?` : "תודה על השהות. איך היה?");
  }
  return named(firstName, place ? `Merci pour ce séjour ${place}. Comment s’est-il passé ?` : "Merci pour ce séjour. Comment s’est-il passé ?");
}

export function templateTouchpointBody(
  key: "concierge_veille" | "concierge_arrivee" | "concierge_merci",
  lang: ReplyLang,
  vars: { prenom?: string | null; destination?: string | null; vol?: string | null; lieu?: string | null }
) {
  const rendered = renderConciergeTemplate(key, lang, vars);
  return `${rendered}\n${TEMPLATE_NOT_SUBMITTED}`;
}

export function decideTouchpointDelivery(input: {
  kind: string;
  templateKey?: string | null;
  windowOpen: boolean;
  preview: boolean;
  dueAt: string;
  now: Date;
}): { send: true; mode: "session" } | { send: false; error: string } {
  if (!TOUCHPOINT_KINDS.includes(input.kind as TouchpointKind)) {
    return { send: false, error: "Cette relance ne s’envoie pas." };
  }
  if (input.preview) return { send: false, error: "L’aperçu n’envoie pas." };
  if (!touchpointSendable(input.dueAt, input.now)) return { send: false, error: "Cette relance n’est plus d’actualité." };
  if (input.windowOpen) return { send: true, mode: "session" };
  const template = input.templateKey ? conciergeTemplate(input.templateKey) : null;
  if (!template || !templateIsArmed(template)) return { send: false, error: "Le modèle n’est pas encore approuvé." };
  return { send: false, error: "Le modèle n’est pas encore approuvé." };
}

export function factsFromDossier(dossier: ConciergeDossier, now: Date): {
  bookingId: string;
  stay: ConciergeDossier["stays"][number];
  firstName: string;
  lang: ReplyLang;
  facts: TouchpointFacts;
} | null {
  const { today, tomorrow } = touchpointWindow(now);
  const stay =
    dossier.stays.find((row) => row.startDate === tomorrow || row.startDate === today || row.endDate === today) ||
    dossier.stays[0] ||
    null;
  if (!stay) return null;
  const flight = stay.items.find((item) => item.kind === "flight" && item.date === tomorrow);
  const hotel = stay.items.find((item) => item.kind === "hotel" && item.date === today);
  const hotels = stay.items.some((item) => item.kind === "hotel");
  const hotelName = (hotel?.lines[0] || "").split(",")[0]?.trim() || "";
  return {
    bookingId: stay.id,
    stay,
    firstName: dossier.firstName,
    lang: dossier.language === "en" || dossier.language === "he" ? dossier.language : "fr",
    facts: {
      flightNumber: flight?.flightNumber || "",
      flightClock: flight?.clock || "",
      hotelName,
      hotelArrival: hotel ? true : hotels ? false : undefined,
      passportInVault: dossier.documents.some((doc) => /passeport|passport/i.test(doc.label)),
    } satisfies TouchpointFacts,
  };
}

export function touchpointWindow(now: Date) {
  const today = touchpointDay(now);
  return { today, tomorrow: addIsoDays(today, 1), yesterday: addIsoDays(today, -1) };
}
