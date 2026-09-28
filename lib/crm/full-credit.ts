import { hotelDisplayName, hotelRooms, itemClock, nightsBetween } from "./carnet";
import { formatDateFr, formatMoney } from "./money";
import { parisClock, shouldCloseCard } from "./visa-desk";
import type { CrmBookingItem } from "./types";

/** Plafond de pré-autorisation, pas une dépense promise ni une ligne au livre. */
export const FULL_CREDIT_NIGHT_EUR = 500;
const LEAD_MS = 48 * 60 * 60 * 1000;

export const FULL_CREDIT_STATUSES = ["demandee", "envoyee", "carte", "cloturee"] as const;
export type FullCreditStatus = (typeof FULL_CREDIT_STATUSES)[number];

export type FullCreditClientMode = "hidden" | "late" | "asked" | "ask";

export type FullCreditRecord = {
  id: string;
  booking_item_id: string;
  status: FullCreditStatus;
  nights: number;
  ceiling_cents: number;
  hotel_email: string | null;
  draft_subject: string;
  draft_body: string;
  pliant_card_id: string | null;
  payment_url: string | null;
  captured_cents: number | null;
};

const ASKED = new Set<string>(FULL_CREDIT_STATUSES);

export function isFullCreditStatus(value: string | null | undefined): value is FullCreditStatus {
  return Boolean(value && ASKED.has(value));
}

export function fullCreditExternalId(creditId: string) {
  return `full-credit:${creditId}`;
}

export function fullCreditCeilingCents(nights: number) {
  if (!Number.isInteger(nights) || nights < 1) return null;
  return nights * FULL_CREDIT_NIGHT_EUR * 100;
}

export function fullCreditTransactionCount(nights: number) {
  if (!Number.isInteger(nights) || nights < 1) return 8;
  return Math.max(8, nights * 4);
}

function parisOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(num("year"), num("month") - 1, num("day"), num("hour"), num("minute"), num("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Minuit à Paris pour un jour calendaire. */
export function parisMidnight(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utc = localAsUtc - parisOffsetMinutes(new Date(localAsUtc)) * 60_000;
  utc = localAsUtc - parisOffsetMinutes(new Date(utc)) * 60_000;
  const wall = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utc));
  const get = (type: string) => wall.find((part) => part.type === type)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  if (`${get("year")}-${get("month")}-${get("day")}` !== isoDate || hour !== "00" || get("minute") !== "00") {
    return null;
  }
  return new Date(utc);
}

/** Sans horaire réel (minuit ignoré par le carnet) : 00:00 Europe/Paris le jour d’arrivée. */
export function fullCreditArrival(startAt: string | null | undefined): Date | null {
  if (!startAt) return null;
  const day = startAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (itemClock(startAt)) {
    const parsed = new Date(startAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return parisMidnight(day);
}

export function fullCreditDeadline(startAt: string | null | undefined): Date | null {
  const arrival = fullCreditArrival(startAt);
  if (!arrival) return null;
  return new Date(arrival.getTime() - LEAD_MS);
}

export function fullCreditInTime(startAt: string | null | undefined, now: Date) {
  const deadline = fullCreditDeadline(startAt);
  if (!deadline) return false;
  return now.getTime() < deadline.getTime();
}

export function fullCreditClientMode(input: {
  visible: boolean;
  status: string;
  clientSettles: boolean;
  kind: string;
  startAt: string | null;
  endAt: string | null;
  now: Date;
  existingStatus?: string | null;
}): FullCreditClientMode {
  if (input.kind !== "hotel") return "hidden";
  if (isFullCreditStatus(input.existingStatus)) return "asked";
  if (input.clientSettles || !input.visible) return "hidden";
  if (input.status !== "confirmed" && input.status !== "travelling") return "hidden";
  if (!nightsBetween(input.startAt, input.endAt)) return "hidden";
  if (!fullCreditInTime(input.startAt, input.now)) return "late";
  return "ask";
}

export function fullCreditRefusal(input: {
  visible: boolean;
  status: string;
  clientSettles: boolean;
  kind: string;
  startAt: string | null;
  endAt: string | null;
  now: Date;
  existingStatus?: string | null;
}) {
  if (input.kind !== "hotel") return "Cette carte n’est pas un hôtel.";
  if (isFullCreditStatus(input.existingStatus)) return "Demande déjà transmise.";
  if (input.clientSettles) return "Le full credit concerne les séjours réglés par l’agence.";
  if (!input.visible) return "Séjour introuvable";
  if (input.status !== "confirmed" && input.status !== "travelling") return "Le séjour n’est pas ouvert.";
  const nights = nightsBetween(input.startAt, input.endAt);
  if (!nights || !fullCreditCeilingCents(nights)) return "Les dates de l’hôtel ne permettent pas la demande.";
  if (!fullCreditInTime(input.startAt, input.now)) return "La demande se fait au moins 48 heures avant l’arrivée.";
  return null;
}

export function fullCreditWhatsappHref(phone: string, reference: string, hotelName: string) {
  const text = `Bonjour, je voudrais un full credit pour ${hotelName} — ${reference}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function redactFullCreditText(text: string) {
  return text.replace(/(?:\d[ -]?){13,19}/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    return "•••";
  });
}

export function usableHotelEmail(value: string | null | undefined) {
  const email = (value || "").trim();
  if (!email || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (redactFullCreditText(email) !== email) return null;
  return email;
}

export function usablePaymentUrl(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function eurosToCents(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const cents = Math.round(value * 100);
    return cents > 0 ? cents : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return cents > 0 ? cents : null;
}

function guestLine(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean || "Client";
}

export function fullCreditHotelLetter(input: {
  guestName: string;
  hotelName: string;
  city?: string | null;
  reference: string;
  confirmationRef?: string | null;
  startAt: string | null;
  endAt: string | null;
  nights: number;
  ceilingCents: number;
  rooms?: { room?: string | null; confirmation_ref?: string | null }[];
}) {
  const guest = guestLine(input.guestName);
  const hotel = input.hotelName.trim() || "l’hôtel";
  const city = (input.city || "").trim();
  const place = city ? `${hotel}, ${city}` : hotel;
  const start = formatDateFr((input.startAt || "").slice(0, 10));
  const end = formatDateFr((input.endAt || "").slice(0, 10));
  const nightsLabel = `${input.nights} nuit${input.nights > 1 ? "s" : ""}`;
  const ceiling = formatMoney(input.ceilingCents / 100, "EUR");
  const confirmation = (input.confirmationRef || "").trim();
  const rooms = (input.rooms || [])
    .map((room) => [room.room, room.confirmation_ref].filter(Boolean).join(" · "))
    .filter(Boolean);
  const lines = [
    "Bonjour,",
    "",
    `Nous confirmons le séjour de ${guest} à ${place}, du ${start} au ${end} (${nightsLabel}).`,
    `Référence agence : ${input.reference.trim() || "dossier"}.`,
    confirmation ? `Référence hôtel : ${confirmation}.` : "",
    rooms.length ? `Chambres : ${rooms.join(" ; ")}.` : "",
    "",
    "La chambre est déjà réglée par Travel Business Agency. Merci de ne pas la facturer à nouveau.",
    "",
    "Nous souhaitons garantir uniquement les dépenses dans l’hôtel : restaurant, bar, room service et spa.",
    `Merci de placer une pré-autorisation de ${ceiling} (${nightsLabel} × ${FULL_CREDIT_NIGHT_EUR} €).`,
    "",
    "Les dépenses hors de l’hôtel, les avances d’espèces et tout ce qui dépasse ce plafond restent à la charge du client, sur place.",
    "",
    "Pouvez-vous nous envoyer un lien de paiement pour cette pré-autorisation ? Si ce n’est pas possible, confirmez-nous que nous pouvons vous transmettre les détails de carte par un canal sûr.",
    "",
    "Travel Business Agency",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
  const subject = `Full credit — extras seulement — ${guest} — ${hotel} — ${input.reference.trim() || "dossier"}`;
  return {
    subject: redactFullCreditText(subject),
    text: redactFullCreditText(lines.join("\n")),
  };
}

export function fullCreditLetterForItem(input: {
  guestName: string;
  reference: string;
  item: Pick<CrmBookingItem, "title" | "start_at" | "end_at" | "confirmation_ref" | "details" | "kind">;
}) {
  const nights = nightsBetween(input.item.start_at, input.item.end_at);
  const ceilingCents = nights ? fullCreditCeilingCents(nights) : null;
  if (!nights || !ceilingCents) return null;
  const rooms = hotelRooms(input.item as CrmBookingItem);
  return fullCreditHotelLetter({
    guestName: input.guestName,
    hotelName: hotelDisplayName(input.item as CrmBookingItem),
    city: typeof input.item.details?.city === "string" ? input.item.details.city : "",
    reference: input.reference,
    confirmationRef: input.item.confirmation_ref,
    startAt: input.item.start_at,
    endAt: input.item.end_at,
    nights,
    ceilingCents,
    rooms,
  });
}

export function fullCreditAgencyNotice(input: { reference: string; hotelName: string }) {
  const hotel = input.hotelName.trim() || "l’hôtel";
  const reference = input.reference.trim() || "Dossier";
  return {
    subject: redactFullCreditText(`Full credit · ${reference} · ${hotel}`),
    text: redactFullCreditText(
      `Le client a demandé le full credit pour ${hotel}. Le brouillon est dans le dossier. L’hôtel n’a pas été contacté.`
    ),
  };
}

export function fullCreditLedgerLabel(hotelName: string, reference: string) {
  const hotel = hotelName.trim() || "Hôtel";
  return redactFullCreditText(`Extras hôtel · ${hotel} — ${reference.trim() || "dossier"}`);
}

export function statusAfterSend(current: FullCreditStatus): FullCreditStatus | null {
  if (current === "cloturee") return null;
  if (current === "carte") return "carte";
  return "envoyee";
}

export function statusAfterCard(current: FullCreditStatus): FullCreditStatus | null {
  if (current === "cloturee") return null;
  return "carte";
}

export function fullCreditShouldClose(endAt: string | null | undefined, now: Date, closedAt: string | null | undefined) {
  if (closedAt) return false;
  const end = (endAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return shouldCloseCard(end, now);
}

export function parisToday(now: Date) {
  return parisClock(now).date;
}

export const FULL_CREDIT_STATUS_LABEL: Record<FullCreditStatus, string> = {
  demandee: "Demande reçue",
  envoyee: "Courrier envoyé",
  carte: "Carte émise",
  cloturee: "Close",
};
