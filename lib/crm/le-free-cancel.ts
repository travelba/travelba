import { hotelDisplayName, hotelStayLabel } from "@/lib/crm/carnet";
import { confirmationRefsAlign } from "@/lib/crm/email-match";
import { catalogNameAgrees } from "@/lib/crm/hotel-gallery";
import { isLeCancelled, type LeBooking } from "@/lib/crm/little-emperors";
import { isActiveItem, type CrmBookingItem } from "@/lib/crm/types";

/**
 * UTC+14 est le fuseau le plus en avance. Une heure sans fuseau est lue ainsi :
 * la fenêtre se ferme plus tôt, jamais après l’heure imprimée par Little Emperors.
 */
const EARLIEST_ZONE_HOURS = 14;

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const FREE_PHRASES = [
  "annulation gratuite",
  "annulations gratuites",
  "sans frais",
  "free of charge",
  "free cancellation",
  "cancellation is free",
  "cancellations are free",
  "no penalty",
  "no charge",
  "without charge",
  "without penalty",
  "without a penalty",
  "fully refundable",
  "full refund",
  "100% refund",
  "complimentary cancellation",
];

const FEE_PHRASES = [
  "penalty",
  "penalite",
  "non-refundable",
  "non refundable",
  "non remboursable",
  "non-remboursable",
  "one night",
  "1 night",
  "une nuit",
  "fee",
  "frais",
];

const AFTER_MARKERS = ["after", "thereafter", "apres", "beyond", "later than"];

export const CLIENT_CANCEL_ADVISOR = "Contactez votre conseiller.";
export const CLIENT_CANCEL_REFUSED = "Cette annulation n’est plus gratuite. Contactez votre conseiller.";
export const CLIENT_CANCEL_NOT_SENT = "Rien n’a été annulé. Contactez votre conseiller.";
export const CLIENT_CANCEL_CARD_LAG =
  "L’hôtel a annulé la réservation. Contactez votre conseiller si elle apparaît encore.";

export type LeCancelRow = {
  id: string;
  le_booking_id: number;
  confirmation_number: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  check_in: string | null;
  check_out: string | null;
  state: string | null;
  is_cancellable: boolean | null;
  cancellation_deadline: string | null;
  cancellation_policies: string[];
  status: string | null;
};

export type ClientHotelCancelOffer =
  | {
      itemId: string;
      mode: "free";
      hotelName: string;
      stayLabel: string;
      untilLabel: string;
    }
  | { itemId: string; mode: "advisor" };

type StayStamp = {
  confirmation_number: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  check_in: string | null;
  check_out: string | null;
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function stayDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function hotelIdOf(details: Record<string, unknown> | null | undefined) {
  const current = details?.le_hotel_id;
  if (current == null || current === "") return null;
  const parsed = Number(current);
  return Number.isFinite(parsed) ? parsed : null;
}

function roomRefs(details: Record<string, unknown> | null | undefined) {
  const rooms = Array.isArray(details?.rooms) ? details.rooms : [];
  const refs: string[] = [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const ref = (room as { confirmation_ref?: unknown }).confirmation_ref;
    if (typeof ref === "string" && ref.trim()) refs.push(ref);
  }
  return refs;
}

/** Même hôtel (identifiant ou nom) et mêmes dates, ou le même numéro. Jamais le nom seul. */
export function leStayMatchesCard(
  item: Pick<CrmBookingItem, "title" | "confirmation_ref" | "start_at" | "end_at" | "details">,
  stay: StayStamp
) {
  const details = item.details || {};
  const cardHotelId = hotelIdOf(details);
  if (stay.hotel_id != null && cardHotelId != null && stay.hotel_id !== cardHotelId) return false;
  const refs = [item.confirmation_ref, ...roomRefs(details)];
  if (refs.some((ref) => confirmationRefsAlign(ref, stay.confirmation_number))) return true;
  const checkIn = stayDay(stay.check_in);
  const checkOut = stayDay(stay.check_out);
  const sameDates = Boolean(checkIn && checkOut && stayDay(item.start_at) === checkIn && stayDay(item.end_at) === checkOut);
  if (!sameDates) return false;
  const sameId = stay.hotel_id != null && cardHotelId != null && stay.hotel_id === cardHotelId;
  const itemName =
    (typeof details.hotel_name === "string" && details.hotel_name.trim()) || (item.title || "").trim();
  const hotelName = (stay.hotel_name || "").trim();
  return Boolean(sameId || (itemName && hotelName && catalogNameAgrees(itemName, hotelName)));
}

export function looksLikeLittleEmperors(item: Pick<CrmBookingItem, "supplier" | "details">) {
  if ((item.supplier || "").toLowerCase().includes("little emperors")) return true;
  const details = item.details || {};
  if (details.source_family === "little_emperors") return true;
  return hotelIdOf(details) != null;
}

/** Instant de la limite. Null si la chaîne est vide ou illisible. */
export function leDeadlineInstant(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 0;
  const minute = match[5] != null ? Number(match[5]) : 0;
  const second = match[6] != null ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return new Date(wall - EARLIEST_ZONE_HOURS * 60 * 60 * 1000);
}

/** Heure murale imprimée, sans fuseau inventé. */
export function leDeadlineLabel(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  const date = `${Number(match[3])} ${month} ${match[1]}`;
  if (match[4] == null) return date;
  return `${date}, ${match[4]}:${match[5]}`;
}

function policyText(policies: string[] | null | undefined) {
  return (policies || []).map((line) => line.trim()).filter(Boolean).join("\n");
}

function policyAllowsFreeWindow(policies: string[] | null | undefined) {
  const text = policyText(policies);
  if (!text) return false;
  const folded = fold(text);
  if (!FREE_PHRASES.some((phrase) => folded.includes(fold(phrase)))) return false;
  let rest = folded;
  for (const phrase of FREE_PHRASES) rest = rest.split(fold(phrase)).join(" ");
  const fee = FEE_PHRASES.some((phrase) => rest.includes(fold(phrase)));
  if (!fee) return true;
  return AFTER_MARKERS.some((marker) => folded.includes(marker));
}

/**
 * Gratuite seulement si Little Emperors dit la réservation annulable, la limite
 * est encore devant nous, et la politique dit sans frais. Sinon refus.
 */
export function freeLeCancellation(
  booking: {
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state?: string | null;
  },
  now: Date
): { ok: true; untilLabel: string } | { ok: false } {
  if (booking.is_cancellable !== true) return { ok: false };
  if (isLeCancelled(booking.state)) return { ok: false };
  const instant = leDeadlineInstant(booking.cancellation_deadline);
  const untilLabel = leDeadlineLabel(booking.cancellation_deadline);
  if (!instant || !untilLabel) return { ok: false };
  if (!(now.getTime() < instant.getTime())) return { ok: false };
  if (!policyAllowsFreeWindow(booking.cancellation_policies)) return { ok: false };
  return { ok: true, untilLabel };
}

function usableRows(rows: LeCancelRow[]) {
  return rows.filter((row) => row.status !== "ignored" && Number.isInteger(row.le_booking_id));
}

function rowsForCard(item: CrmBookingItem, rows: LeCancelRow[]) {
  return usableRows(rows).filter((row) => leStayMatchesCard(item, row));
}

function otherCardsForRow(item: CrmBookingItem, hotels: CrmBookingItem[], row: StayStamp) {
  return hotels.filter((hotel) => hotel.id !== item.id && hotel.kind === "hotel" && isActiveItem(hotel) && leStayMatchesCard(hotel, row));
}

export function clientCancelQuestion(offer: { hotelName: string; stayLabel: string; untilLabel: string }) {
  return `Annuler ${offer.hotelName}, ${offer.stayLabel} ? Annulation gratuite jusqu’au ${offer.untilLabel}.`;
}

export function clientCancelTrace(hotelName: string, stayLabel: string, untilLabel: string) {
  const hotel = hotelName.replace(/\s+/g, " ").trim();
  const stay = stayLabel.replace(/\s+/g, " ").trim();
  const until = untilLabel.replace(/\s+/g, " ").trim();
  return `Annulation gratuite par le client : ${hotel} (${stay}), jusqu’au ${until}.`;
}

/** Bouton ou phrase conseiller, à partir de la ligne déjà en base. Le clic relit Little Emperors. */
export function clientHotelCancelOffers(
  items: CrmBookingItem[],
  rows: LeCancelRow[],
  now: Date
): ClientHotelCancelOffer[] {
  const hotels = items.filter((item) => item.kind === "hotel" && isActiveItem(item));
  const offers: ClientHotelCancelOffer[] = [];
  for (const item of hotels) {
    const matches = rowsForCard(item, rows);
    const advisor = (): ClientHotelCancelOffer => ({ itemId: item.id, mode: "advisor" });
    if (matches.length === 0) {
      if (looksLikeLittleEmperors(item)) offers.push(advisor());
      continue;
    }
    if (matches.length !== 1 || otherCardsForRow(item, hotels, matches[0]).length > 0) {
      offers.push(advisor());
      continue;
    }
    const verdict = freeLeCancellation(matches[0], now);
    if (!verdict.ok) {
      offers.push(advisor());
      continue;
    }
    offers.push({
      itemId: item.id,
      mode: "free",
      hotelName: hotelDisplayName(item),
      stayLabel: hotelStayLabel(item),
      untilLabel: verdict.untilLabel,
    });
  }
  return offers;
}

export type ClientLeCancelDecision =
  | {
      ok: true;
      rowId: string;
      leBookingId: number;
      untilLabel: string;
      hotelName: string;
      stayLabel: string;
    }
  | { ok: false };

/** Relu chez Little Emperors : une seule réservation, encore gratuite, pour cette carte seule. */
export function decideClientLeCancel(input: {
  item: CrmBookingItem;
  hotels: CrmBookingItem[];
  rows: LeCancelRow[];
  fresh: LeBooking[];
  now: Date;
}): ClientLeCancelDecision {
  if (input.item.kind !== "hotel" || !isActiveItem(input.item)) return { ok: false };
  const matches = rowsForCard(input.item, input.rows);
  if (matches.length !== 1) return { ok: false };
  const stored = matches[0];
  if (otherCardsForRow(input.item, input.hotels, stored).length > 0) return { ok: false };
  const fresh = input.fresh.find((booking) => booking.id === stored.le_booking_id);
  if (!fresh) return { ok: false };
  if (!leStayMatchesCard(input.item, fresh)) return { ok: false };
  if (otherCardsForRow(input.item, input.hotels, fresh).length > 0) return { ok: false };
  const verdict = freeLeCancellation(fresh, input.now);
  if (!verdict.ok) return { ok: false };
  return {
    ok: true,
    rowId: stored.id,
    leBookingId: fresh.id,
    untilLabel: verdict.untilLabel,
    hotelName: hotelDisplayName(input.item),
    stayLabel: hotelStayLabel(input.item),
  };
}
