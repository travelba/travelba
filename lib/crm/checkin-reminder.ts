import { flightNumber } from "./carnet";
import {
  isBoardingPassDocument,
  parseOnlineCheckinStatus,
  passMatchesFlight,
} from "./online-checkin";
import type { CrmBookingItem } from "./types";

const SENT = new Set(["sent", "delivered", "read"]);
const TEMPLATES = new Set(["carte_embarquement", "cartes_embarquement"]);

export type ReminderDocument = {
  id: string;
  booking_id: string;
  booking_item_id?: string | null;
  file_name?: string | null;
  kind?: string | null;
};

export type ReminderMessage = {
  booking_id: string;
  template_key?: string | null;
  status?: string | null;
  body?: string | null;
  payload?: unknown;
};

export type ReminderFlight = {
  id: string;
  booking_id: string;
  source_document_id?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
};

function compact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function documentIdOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const id = (payload as { document_id?: unknown }).document_id;
  return typeof id === "string" ? id : "";
}

function asFlight(flight: ReminderFlight) {
  return flight as unknown as CrmBookingItem;
}

function flightCode(flight: ReminderFlight) {
  return compact(flightNumber(asFlight(flight)));
}

/** Carte d’embarquement de ce vol : lien de carte, ou le numéro de vol dans le nom du fichier. */
export function boardingPassForFlight(flight: ReminderFlight, documents: ReminderDocument[]) {
  return documents.some(
    (doc) =>
      doc.booking_id === flight.booking_id &&
      isBoardingPassDocument(doc) &&
      passMatchesFlight(doc, asFlight(flight))
  );
}

function messageCoversFlight(
  message: ReminderMessage,
  flight: ReminderFlight,
  documents: ReminderDocument[],
  flightsOnBooking: number
) {
  if (!TEMPLATES.has(String(message.template_key || ""))) return false;
  if (!SENT.has(String(message.status || ""))) return false;
  if (message.booking_id !== flight.booking_id) return false;
  const code = flightCode(flight);
  const body = compact(message.body || "");
  if (code.length >= 4 && body.includes(code)) return true;
  const docId = documentIdOf(message.payload);
  if (docId) {
    const doc = documents.find((row) => row.id === docId && row.booking_id === flight.booking_id);
    if (doc && passMatchesFlight(doc, asFlight(flight))) return true;
    if (doc && flightsOnBooking === 1 && isBoardingPassDocument(doc)) return true;
    return false;
  }
  return flightsOnBooking === 1;
}

/**
 * Ne pas envoyer « l’enregistrement est ouvert » si le segment est déjà fait,
 * si les cartes sont reçues ou envoyées, si une carte d’embarquement est au dossier
 * pour ce vol, ou si le WhatsApp carte_embarquement est déjà parti.
 */
export function checkinReminderBlocked(input: {
  status?: string | null;
  flight: ReminderFlight;
  flightsOnBooking: number;
  documents: ReminderDocument[];
  messages: ReminderMessage[];
}) {
  const status = parseOnlineCheckinStatus(input.status);
  if (status === "fait" || status === "cartes_recues" || status === "envoyees") return true;
  if (boardingPassForFlight(input.flight, input.documents)) return true;
  return input.messages.some((message) =>
    messageCoversFlight(message, input.flight, input.documents, input.flightsOnBooking)
  );
}
