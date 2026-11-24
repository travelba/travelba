import { mergeFlightPassengers, type FlightPassengerRow, type MatchableItem } from "@/lib/crm/item-match";
import { countRealTickets } from "@/lib/crm/ticket-party";

export const TICKET_DUPLICATE_MESSAGE = "Possible doublon de billets.";

export type TicketCardPlan = {
  /** Référence à écrire. Null : la carte n’a pas de PNR et le reçu non plus. */
  confirmationRef: string | null;
  details: Record<string, unknown>;
  /** Le PNR déjà sur la carte est conservé. */
  alert: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pnrTokens(item: { confirmation_ref?: string | null; details?: Record<string, unknown> | null }) {
  const raw = `${item.confirmation_ref || ""} ${text(item.details?.pnr)}`;
  return [
    ...new Set(
      raw
        .split(/[^A-Za-z0-9]+/)
        .map((token) => token.toUpperCase())
        .filter((token) => token.length >= 5 && !/^\d{8}$/.test(token))
    ),
  ];
}

function day(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function ticketNumbers(passengers: FlightPassengerRow[], details: Record<string, unknown>) {
  const fromPeople = passengers.map((row) => row.ticket_number).filter((value): value is string => Boolean(value));
  const stored = details.ticket_numbers;
  const previous = Array.isArray(stored) ? stored.map((value) => String(value || "")).filter((value) => /^\d{13}$/.test(value)) : [];
  return [...new Set([...previous, ...fromPeople])];
}

/**
 * Même vol, même jour, mêmes passagers.
 * Sans PNR sur la carte : on écrit le PNR, le numéro de billet et la place.
 * Avec un autre PNR : on ne touche pas à ces champs, on signale un doublon.
 * Le nom déjà complet (passeport) n’est pas raccourci. Pas de date de naissance.
 */
export function planTicketOnExistingCard(existing: MatchableItem, incoming: MatchableItem): TicketCardPlan {
  const current = { ...(existing.details || {}) };
  const next = { ...(incoming.details || {}) };
  const had = pnrTokens(existing);
  const want = pnrTokens(incoming);
  const same = had.some((token) => want.includes(token));
  const conflict = had.length > 0 && want.length > 0 && !same;
  const passengers = mergeFlightPassengers(current, next, !conflict);
  const details: Record<string, unknown> = { ...current };
  if (!current.client_hidden) delete details.client_hidden;

  if (!conflict) {
    if (!had.length && want.length) {
      details.pnr = want[0];
    }
    const numbers = ticketNumbers(passengers, conflict ? current : { ...current, ...next });
    if (numbers.length) details.ticket_numbers = numbers;
    const seats = [...new Set(passengers.map((row) => row.seat).filter(Boolean))];
    if (!text(current.seat) && seats.length === 1) details.seat = seats[0];
    if (passengers.length) {
      details.passengers = passengers;
      details.ticket_count = countRealTickets(passengers) ?? passengers.length;
    }
  } else if (passengers.length) {
    const kept = mergeFlightPassengers(current, { passengers: [] }, false);
    details.passengers = kept.length ? kept : passengers;
  }

  if (conflict) {
    const flight = text(next.flight_number) || text(current.flight_number);
    const when = day(incoming.start_at) || day(existing.start_at);
    details.ticket_duplicate = {
      message: TICKET_DUPLICATE_MESSAGE,
      pnr: want[0],
      vol: flight,
      date: when,
    };
    details.needs_review = true;
    const reason = text(current.review_reason);
    details.review_reason = reason.includes("doublon de billets")
      ? reason
      : reason
        ? `${reason.replace(/[.!?…]$/, "")}. ${TICKET_DUPLICATE_MESSAGE}`
        : TICKET_DUPLICATE_MESSAGE;
  }

  const confirmationRef = conflict || had.length ? had[0] || text(existing.confirmation_ref) || null : want[0] || null;
  if (confirmationRef && !conflict) details.pnr = text(details.pnr) || confirmationRef;
  if (conflict && had[0]) details.pnr = had[0];
  return { confirmationRef, details, alert: conflict };
}
