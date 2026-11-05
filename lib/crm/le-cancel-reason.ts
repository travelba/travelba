import {
  deadlineStillOpen,
  leDeadlineInstantParis,
  leDeadlineIsDateOnly,
  leDeadlineParisLabel,
} from "@/lib/crm/le-self-book";

export const LE_BOOKINGS_MAIL = "bookings@littleemperors.com";

export const LE_NON_REFUNDABLE =
  "Tarif non remboursable : Little Emperors ne permet pas l’annulation sans payer la totalité du séjour.";

export type LeHiddenCancel =
  | { kind: "open" }
  | { kind: "non_refundable"; text: string }
  | { kind: "deadline"; text: string }
  | { kind: "unknown"; text: string };

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Politique « full cost » ou non remboursable, telle que Little Emperors l’écrit. */
export function lePolicyIsFullCost(policies: string[] | null | undefined) {
  const text = fold((policies || []).join("\n"));
  if (!text) return false;
  return (
    /full cost|entire cost|entire stay|totalite du sejour|total cost of the booking/.test(text) ||
    /non-refundable|non refundable|non remboursable/.test(text) ||
    /not be able to cancel|cannot be cancel|unable to cancel|no cancellation/.test(text)
  );
}

/** Instant fiable. Minuit pile n’en est pas un : c’est une date, pas une heure déjà passée. */
export function reliableLeDeadline(value: string | null | undefined): Date | null {
  if (leDeadlineIsDateOnly(value)) return null;
  return leDeadlineInstantParis(value);
}

/**
 * Pourquoi le bouton d’annulation est masqué.
 * Une deadline mal lue (date seule, minuit UTC) ne suffit pas à dire « non remboursable ».
 */
export function leHiddenCancel(input: {
  isCancellable: boolean | null;
  deadline: string | null;
  policies: string[];
  bookedAt?: string | null;
  now: Date;
}): LeHiddenCancel {
  const unknown: LeHiddenCancel = {
    kind: "unknown",
    text: "Little Emperors n’indique pas que cette réservation peut être annulée depuis l’API.",
  };
  if (input.isCancellable === true) {
    if (!input.deadline || deadlineStillOpen(input.deadline, input.now.toISOString())) return { kind: "open" };
    if (leDeadlineIsDateOnly(input.deadline)) return { kind: "open" };
  }
  if (lePolicyIsFullCost(input.policies)) return { kind: "non_refundable", text: LE_NON_REFUNDABLE };
  const instant = reliableLeDeadline(input.deadline);
  const booked = input.bookedAt ? Date.parse(input.bookedAt) : NaN;
  if (instant && Number.isFinite(booked) && instant.getTime() <= booked) {
    return { kind: "non_refundable", text: LE_NON_REFUNDABLE };
  }
  if (input.isCancellable === false && instant && instant.getTime() <= input.now.getTime()) {
    const label = leDeadlineParisLabel(input.deadline);
    const when = label ? `${label}, heure de Paris` : "heure de Paris";
    return { kind: "deadline", text: `La date limite d’annulation gratuite (${when}) est passée.` };
  }
  if (input.isCancellable === false && leDeadlineIsDateOnly(input.deadline)) return unknown;
  if (input.isCancellable === false) return unknown;
  return unknown;
}

export function leGestureMailto(hotelName: string | null | undefined) {
  const hotel = (hotelName || "réservation").replace(/\s+/g, " ").trim().slice(0, 80);
  const subject = `Demande de geste — ${hotel}`;
  const body = "Bonjour,\n\nNous souhaiterions un geste sur cette réservation.\n\nMerci.";
  return `mailto:${LE_BOOKINGS_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
