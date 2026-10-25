import { addIsoDays } from "./dates";
import type { AdminTodoLine } from "./admin-todo";
import { dockDiscussionsHref } from "./whatsapp-inbox";

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

/** Dernier jour inclus : aujourd’hui et les deux jours suivants (sous 72 h). */
export function departures72hEnd(today: string) {
  return addIsoDays(today, 2);
}

/** Horizon des passeports manquants sur le tableau de bord. */
export function missingDocumentHorizon(today: string) {
  return addIsoDays(today, 14);
}

export type AgencyAttentionInput = {
  pendingMessages: number;
  conciergeRequests: number;
  departures72h: number;
  missingDocuments: number;
  importToReview: number;
};

/**
 * Ce qui attend l’agence, dans l’ordre du travail :
 * messages à envoyer, demandes du Concierge, départs sous 72 h, passeports, import.
 */
export function agencyAttentionLines(input: AgencyAttentionInput): AdminTodoLine[] {
  const lines: AdminTodoLine[] = [
    {
      id: "pending-messages",
      count: input.pendingMessages,
      label: plural(input.pendingMessages, "message à envoyer", "messages à envoyer"),
      href: dockDiscussionsHref("envoyer"),
    },
    {
      id: "concierge-requests",
      count: input.conciergeRequests,
      label: plural(input.conciergeRequests, "demande du Concierge", "demandes du Concierge"),
      href: dockDiscussionsHref("escalade"),
    },
    {
      id: "departures-72h",
      count: input.departures72h,
      label: plural(input.departures72h, "départ sous 72 h", "départs sous 72 h"),
      href: "/admin/reservations?etat=a-venir&sous=72h",
    },
    {
      id: "missing-documents",
      count: input.missingDocuments,
      label: plural(input.missingDocuments, "passeport manquant", "passeports manquants"),
      href: "/admin/reservations?etat=a-venir",
    },
    {
      id: "import-review",
      count: input.importToReview,
      label: plural(input.importToReview, "import à valider", "imports à valider"),
      href: "/admin/emails",
    },
  ];
  return lines.filter((line) => line.count > 0);
}

export type PassportTraveler = {
  id: string;
  bookingId: string;
  companionId: string | null;
  holder: boolean;
};

export type PassportHit = {
  travelerId: string | null;
  companionId: string | null;
  bookingId: string | null;
  customerId: string | null;
};

/** Voyageurs sans passeport relié (séjour, compagnon ou coffre du titulaire). Aucun numéro. */
export function travelersMissingPassport(
  travelers: PassportTraveler[],
  passports: PassportHit[],
  bookingCustomer: Record<string, string>
) {
  return travelers.filter((traveler) => {
    const customerId = bookingCustomer[traveler.bookingId] || "";
    return !passports.some((doc) => {
      if (doc.travelerId && doc.travelerId === traveler.id) return true;
      if (traveler.companionId && doc.companionId === traveler.companionId) return true;
      if (traveler.holder && !doc.companionId && !doc.bookingId && doc.customerId === customerId) return true;
      return false;
    });
  });
}

export type MissingPassportCard = { bookingId: string; label: string; count: number };

/** Une ligne par dossier, prénom et lieu, jamais un numéro de pièce. */
export function missingPassportCards(
  missing: PassportTraveler[],
  bookings: { id: string; reference: string; place: string | null }[],
  names: Record<string, string>
): MissingPassportCard[] {
  const byBooking = new Map<string, PassportTraveler[]>();
  for (const traveler of missing) {
    const list = byBooking.get(traveler.bookingId) || [];
    list.push(traveler);
    byBooking.set(traveler.bookingId, list);
  }
  const cards: MissingPassportCard[] = [];
  for (const [bookingId, rows] of byBooking) {
    const booking = bookings.find((row) => row.id === bookingId);
    const who = rows.map((row) => names[row.id]).filter(Boolean).slice(0, 3).join(", ");
    const place = booking?.place ? ` · ${booking.place}` : "";
    const reference = booking?.reference || "Dossier";
    cards.push({
      bookingId,
      count: rows.length,
      label: `${who ? `${who} · ` : ""}${reference}${place}`,
    });
  }
  return cards.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}
