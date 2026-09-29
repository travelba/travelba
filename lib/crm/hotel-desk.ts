import { hotelDisplayName, itemClock, nightsBetween } from "./carnet";
import { hotelContact, leHotelIdFromItem, type HotelContact } from "./hotel-contact";
import {
  businessDaysBefore,
  emailAddress,
  formatArrivalAmount,
  formatStayDate,
  hotelChannel,
  hotelLanguage,
  hotelMailFrame,
  isoDate,
  linkRequestMail,
  nextBusinessDay,
  parisIsoDate,
} from "./hotel-arrival";
import type { CrmBookingItem, CrmHotelRequest, HotelDeskKind, HotelDeskStatus } from "./types";
import { HOTEL_DESK_KINDS } from "./types";

/** Expéditeur et adresse de réponse du bureau hôtel. */
export const HOTEL_DESK_FROM = "contact@travelba.fr";

export const HOTEL_DESK_LABELS: Record<HotelDeskKind, string> = {
  payment_link: "Lien de paiement",
  upgrade: "Upgrade et accueil",
  precheckin: "Pré-check-in",
  full_credit: "Full credit",
  transfer: "Transfert",
  concierge: "Concierge",
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const FULL_CREDIT_NIGHT_CENTS = 50_000;

export function hotelDeskChannel(item: CrmBookingItem) {
  const family = item.details?.source_family;
  return hotelChannel({
    sourceFamily: typeof family === "string" ? family : "",
    supplier: item.supplier,
    leHotelId: leHotelIdFromItem(item),
  });
}

/** Expedia est déjà réglé : pas de lien ni de full credit à proposer. */
export function hotelDeskSuggested(kind: HotelDeskKind, channel: ReturnType<typeof hotelDeskChannel>) {
  if (channel === "expedia" && (kind === "payment_link" || kind === "full_credit")) return false;
  return true;
}

export function hotelDeskRecipients(contact: HotelContact, kind: HotelDeskKind) {
  const people = contact.people.filter((person) => person.email);
  const preferred =
    kind === "concierge"
      ? people.filter((person) => /concierge/i.test(person.type))
      : people.filter((person) => /reserv/i.test(person.type));
  if (kind === "concierge" && preferred.length) {
    return [...new Set(preferred.map((person) => person.email.trim().toLowerCase()).filter(Boolean))];
  }
  const pool = preferred.length ? preferred : people;
  const emails = [...pool.map((person) => person.email)];
  if (contact.email) emails.unshift(contact.email);
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function containsCardNumber(text: string) {
  return /(?:\d[ -]?){13,19}/.test(text);
}

function lineLooksLikeCard(line: string) {
  if (containsCardNumber(line)) return true;
  return /(?:cryptogramme|\bcvc\b|\bcvv\b|security code|num[eé]ro de carte|card number|expiration|expiry)/i.test(line) && /\d/.test(line);
}

/** Texte de réponse à montrer dans le dossier. Les lignes de carte sont retirées. */
export function hotelReplyForDesk(text: string) {
  const cleaned = text
    .split(/\r?\n/)
    .filter((line) => !lineLooksLikeCard(line))
    .join("\n")
    .replace(/(?:\d[ -]?){13,19}/g, "")
    .trim()
    .slice(0, 4000);
  if (containsCardNumber(cleaned)) return "";
  return cleaned;
}

function detail(item: CrmBookingItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function flightLine(item: CrmBookingItem, lang: "fr" | "en") {
  const number = detail(item, "flight_number");
  const from = detail(item, "from");
  const to = detail(item, "to");
  const route = from && to ? `${from} → ${to}` : from || to;
  const when = isoDate(item.start_at);
  const clock = itemClock(item.start_at);
  const date = when ? formatStayDate(when, lang) : "";
  return [number, route, [date, clock].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

export function transferCues(items: CrmBookingItem[], hotel: CrmBookingItem, lang: "fr" | "en") {
  const checkIn = isoDate(hotel.start_at);
  const checkOut = isoDate(hotel.end_at) || checkIn;
  const flights = items.filter((item) => item.kind === "flight" && item.start_at);
  const arrival = flights
    .filter((item) => checkIn && isoDate(item.start_at) <= checkIn)
    .sort((a, b) => (b.start_at || "").localeCompare(a.start_at || ""))[0];
  const departure = flights
    .filter((item) => checkOut && isoDate(item.start_at) >= checkOut)
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""))[0];
  const missing = lang === "fr" ? "à préciser" : "to be confirmed";
  return {
    arrival: arrival ? flightLine(arrival, lang) : missing,
    departure: departure ? flightLine(departure, lang) : missing,
  };
}

export type HotelDeskDraftInput = {
  kind: HotelDeskKind;
  item: CrmBookingItem;
  items: CrmBookingItem[];
  reference: string;
  guest: string;
  currency: string;
  holidays: string[];
  relance?: boolean;
};

export function hotelDeskDraft(input: HotelDeskDraftInput) {
  const contact = hotelContact(input.item);
  const lang = hotelLanguage(contact.country);
  const hotel = hotelDisplayName(input.item) || input.item.title;
  const checkIn = isoDate(input.item.start_at);
  const checkOut = isoDate(input.item.end_at) || checkIn;
  const stay = `${formatStayDate(checkIn, lang)} – ${formatStayDate(checkOut, lang)}`;
  const ref = input.item.confirmation_ref || input.reference || "—";
  const guest = input.guest.trim() || (lang === "fr" ? "notre client" : "our guest");
  const channel = hotelDeskChannel(input.item);
  const amountCents =
    typeof input.item.amount === "number" && input.item.amount > 0 ? Math.round(input.item.amount * 100) : null;
  const amount = amountCents != null ? formatArrivalAmount(amountCents, input.currency || "EUR") : null;
  const nights = nightsBetween(checkIn, checkOut);
  const letter = letterFor({
    ...input,
    lang,
    hotel,
    stay,
    ref,
    guest,
    amount,
    nights,
    cues: transferCues(input.items, input.item, lang),
  });
  const due = checkIn ? businessDaysBefore(checkIn, 2, new Set(input.holidays)) : null;
  return {
    kind: input.kind,
    subject: letter.subject,
    body: letter.text,
    recipients: hotelDeskRecipients(contact, input.kind),
    dueOn: due,
    status: (hotelDeskSuggested(input.kind, channel) ? "waiting" : "skipped") as HotelDeskStatus,
    cardChoice: input.kind === "precheckin" ? ("pliant" as const) : null,
    attachPassports: input.kind === "precheckin",
    lang,
  };
}

function letterFor(input: {
  kind: HotelDeskKind;
  lang: "fr" | "en";
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  amount: string | null;
  nights: number | null;
  checkIn?: string;
  relance?: boolean;
  item: CrmBookingItem;
  cues: { arrival: string; departure: string };
}) {
  if (input.kind === "payment_link") {
    return linkRequestMail({
      lang: input.lang,
      hotel: input.hotel,
      reference: input.ref,
      checkIn: isoDate(input.item.start_at),
      checkOut: isoDate(input.item.end_at) || isoDate(input.item.start_at),
      amount: input.amount,
      relance: input.relance,
    });
  }
  if (input.lang === "fr") return frenchLetter(input);
  return englishLetter(input);
}

function frenchLetter(input: {
  kind: HotelDeskKind;
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  nights: number | null;
  relance?: boolean;
  cues: { arrival: string; departure: string };
}) {
  const frame = hotelMailFrame("fr", input.relance);
  const stayLine = `Notre client ${input.guest} séjourne à ${input.hotel} du ${input.stay} (confirmation ${input.ref}).`;
  if (input.kind === "upgrade") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Accueil VIP — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        "Pourriez-vous signaler cette réservation à votre équipe sur place ?",
        "",
        stayLine,
        "",
        "Pourriez-vous demander à votre équipe de préparer un bel accueil VIP dans la chambre, avec quelques attentions ? Le surclassement dépend des disponibilités au moment de l'arrivée, et s'il est possible, ce serait formidable.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "precheckin") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Pré-enregistrement — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Pourriez-vous préparer l'enregistrement de ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
        "",
        "Les documents d'identité sont joints, pour que la chambre soit prête dès l'arrivée.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "full_credit") {
    const total =
      input.nights != null
        ? ` soit ${formatArrivalAmount(input.nights * FULL_CREDIT_NIGHT_CENTS, "EUR")} pour ${input.nights} nuit${input.nights > 1 ? "s" : ""}`
        : "";
    return {
      subject: `${input.relance ? "Relance — " : ""}Full credit — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `${stayLine} Le séjour est déjà réglé par l'agence.`,
        "",
        `Pourriez-vous prendre en charge les dépenses d'hôtel (restauration, spa), à hauteur de 500 € par nuit${total} ? Un lien de paiement ou une pré-autorisation pour ce plafond serait parfait. La chambre elle-même n'est pas à encaisser de nouveau.`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "transfer") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Transfert — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Pourriez-vous organiser un transfert pour ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
        "",
        `Arrivée : ${input.cues.arrival}`,
        `Départ : ${input.cues.departure}`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  return {
    subject: `${input.relance ? "Relance — " : ""}Concierge — ${input.hotel} — ${input.ref}`,
    text: [
      ...frame.open,
      "",
      `Pourriez-vous nous aider pour une demande concernant ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
      "",
      "Demande :",
      "…",
      "",
      ...frame.close,
    ].join("\n"),
  };
}

function englishLetter(input: {
  kind: HotelDeskKind;
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  nights: number | null;
  relance?: boolean;
  cues: { arrival: string; departure: string };
}) {
  const frame = hotelMailFrame("en", input.relance);
  const prefix = input.relance ? "Follow-up — " : "";
  const stayLine = `Our guest ${input.guest} is staying at ${input.hotel}, ${input.stay} (confirmation ${input.ref}).`;
  if (input.kind === "upgrade") {
    return {
      subject: `${prefix}VIP welcome — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        "Could you please flag this booking to your team on property?",
        "",
        stayLine,
        "",
        "Could you please ask your team to arrange some nice VIP welcome amenities in the room? This is subject to availability at the time of check-in, but if an upgrade is possible, it would be amazing.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "precheckin") {
    return {
      subject: `${prefix}Pre-check-in — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Could you please arrange the pre-check-in for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
        "",
        "Identity documents are attached, so the room can be ready when they arrive.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "full_credit") {
    const total =
      input.nights != null
        ? `, ${formatArrivalAmount(input.nights * FULL_CREDIT_NIGHT_CENTS, "EUR")} for ${input.nights} night${input.nights > 1 ? "s" : ""}`
        : "";
    return {
      subject: `${prefix}Full credit — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `${stayLine} The stay has already been settled by the agency.`,
        "",
        `Could you please cover the guest's hotel extras (dining, spa) at 500 EUR per night${total}? A payment link or a pre-authorisation for this ceiling would be perfect. The room itself should not be charged again.`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "transfer") {
    return {
      subject: `${prefix}Transfer — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Could you please arrange a transfer for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
        "",
        `Arrival: ${input.cues.arrival}`,
        `Departure: ${input.cues.departure}`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  return {
    subject: `${prefix}Concierge — ${input.hotel} — ${input.ref}`,
    text: [
      ...frame.open,
      "",
      `Could you please help us with a request for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
      "",
      "Request:",
      "…",
      "",
      ...frame.close,
    ].join("\n"),
  };
}

const LOCKED: HotelDeskStatus[] = ["draft", "sent", "follow_up", "replied", "skipped"];

export function keepAgencyDraft<T extends { edited: boolean; status: HotelDeskStatus; subject: string; body: string; recipients: string[] }>(
  existing: T,
  fresh: { subject: string; body: string; recipients: string[] }
) {
  if (existing.edited || LOCKED.includes(existing.status)) {
    return {
      subject: existing.subject,
      body: existing.body,
      recipients: existing.recipients.length ? existing.recipients : fresh.recipients,
    };
  }
  return fresh;
}

export function deskNeedsAttention(row: Pick<CrmHotelRequest, "status" | "due_on">, parisToday: string) {
  if (row.status === "due" || row.status === "follow_up") return true;
  if (row.status === "waiting" || row.status === "draft") return Boolean(row.due_on && parisToday >= row.due_on);
  return false;
}

export function hotelsNeedingDesk(rows: Pick<CrmHotelRequest, "booking_item_id" | "status" | "due_on">[], parisToday: string) {
  return new Set(rows.filter((row) => deskNeedsAttention(row, parisToday)).map((row) => row.booking_item_id)).size;
}

export function deskStatusLabel(row: Pick<CrmHotelRequest, "status" | "due_on">, parisToday: string) {
  if (row.status === "skipped") return "Ignoré";
  if (row.status === "replied") return "Répondu";
  if (row.status === "sent") return "Envoyé";
  if (row.status === "follow_up") return "À relancer";
  if (row.status === "draft") return deskNeedsAttention(row, parisToday) ? "Brouillon · à faire" : "Brouillon";
  if (row.status === "due" || deskNeedsAttention(row, parisToday)) return "À faire";
  return "";
}

export function nextDeskMark(input: {
  status: HotelDeskStatus;
  dueOn: string | null;
  parisToday: string;
  sentAtMs: number | null;
  followUpCount: number;
  lastFollowUpAtMs: number | null;
  nowMs: number;
  holidays: string[];
}): HotelDeskStatus | null {
  if (input.status === "skipped" || input.status === "replied") return null;
  if ((input.status === "waiting" || input.status === "draft") && input.dueOn && input.parisToday >= input.dueOn) {
    return input.status === "draft" ? null : "due";
  }
  if (input.status !== "sent" && input.status !== "follow_up") return null;
  if (input.sentAtMs == null) return null;
  if (input.followUpCount <= 0) {
    if (input.nowMs >= input.sentAtMs + FOUR_HOURS_MS && input.status === "sent") return "follow_up";
    return null;
  }
  if (input.followUpCount === 1 && input.status === "sent") {
    const from = parisIsoDate(new Date(input.lastFollowUpAtMs ?? input.sentAtMs));
    if (input.parisToday >= nextBusinessDay(from, new Set(input.holidays))) return "follow_up";
  }
  if (input.followUpCount >= 2 && input.status === "sent" && input.nowMs >= input.sentAtMs + FOUR_HOURS_MS) {
    return "follow_up";
  }
  return null;
}

export function replyMatchesHotel(input: {
  from: string;
  receivedAtMs: number;
  sentAtMs: number;
  hotelEmails: string[];
}) {
  if (!(input.receivedAtMs >= input.sentAtMs)) return false;
  const from = emailAddress(input.from);
  return input.hotelEmails.map((email) => emailAddress(email)).includes(from);
}

export function cardSendNote(choice: "pliant" | "client" | null, lang: "fr" | "en", card: { holder: string; pan: string; expiry: string; cvc: string } | null) {
  if (choice === "client") {
    return lang === "fr"
      ? "Le client présentera sa carte personnelle à l'arrivée. Merci de ne pas encaisser le séjour sur une autre carte."
      : "The guest will present their own card on arrival. Please do not charge the stay to another card.";
  }
  if (choice !== "pliant" || !card) return "";
  if (lang === "fr") {
    return [
      "Carte pour l'enregistrement :",
      `Titulaire : ${card.holder}`,
      `Numéro : ${card.pan}`,
      `Expiration : ${card.expiry}`,
      `Cryptogramme : ${card.cvc}`,
    ].join("\n");
  }
  return [
    "Card for check-in:",
    `Cardholder: ${card.holder}`,
    `Number: ${card.pan}`,
    `Expiry: ${card.expiry}`,
    `Security code: ${card.cvc}`,
  ].join("\n");
}

export function outboundHotelLetter(body: string, note: string) {
  const extra = note.trim();
  if (!extra) return body.trim();
  return `${body.trim()}\n\n${extra}`;
}

export function cleanRecipients(values: string[]) {
  return [...new Set(values.map((value) => emailAddress(value)).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

export { HOTEL_DESK_KINDS };
