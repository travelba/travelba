import { findMatchingItem, type MatchableItem } from "./item-match";
import { sameRecordedTraveler } from "./person-match";

/** Cartes insérées juste avant la mise à jour du mail (copie des pièces comprise). */
export const EMAIL_DETACH_MARGIN_MS = 10 * 60 * 1000;

export const IMPORT_QUOTE_NOTE = "Devis importé — tarifs non bloqués, à confirmer.";
export const IMPORT_DOCUMENTS_NOTE = "Dossier créé par lecture de documents.";
export const IMPORT_AGENCY_NOTE = "Dossier créé par l’agence.";
export const IMPORT_AUTO_NOTE = "Dossier créé automatiquement depuis un mail fournisseur.";

export const IMPORT_CREATED_BOOKING_NOTES = [
  IMPORT_QUOTE_NOTE,
  IMPORT_DOCUMENTS_NOTE,
  IMPORT_AGENCY_NOTE,
  IMPORT_AUTO_NOTE,
] as const;

const BLOCKED_MESSAGE =
  "L’arrivée hôtel a déjà avancé (lien, paiement ou message). Rien n’a été retiré.";

export type DetachExtractItem = MatchableItem;

export type DetachPerson = {
  first_name?: string | null;
  last_name?: string | null;
};

export type DetachItem = MatchableItem & {
  id: string;
  created_at: string;
  source_document_id?: string | null;
};

export type DetachDocument = {
  id: string;
  file_name?: string | null;
  storage_path?: string | null;
  booking_item_id?: string | null;
  created_at: string;
};

export type DetachTraveler = DetachPerson & {
  id: string;
  created_at: string;
};

export type DetachArrival = {
  booking_item_id: string;
  status: string;
};

export type EmailDetachInput = {
  emailId: string;
  bookingId: string;
  attachedAt: string | null;
  suggestedCustomerId: string | null;
  extractItems: DetachExtractItem[];
  extractTravelers: DetachPerson[];
  attachmentNames: string[];
  items: DetachItem[];
  documents: DetachDocument[];
  travelers: DetachTraveler[];
  arrivals: DetachArrival[];
  booking: {
    status: string;
    visible_to_client: boolean;
    notes_internal: string | null;
  };
  hasPostedCredit?: boolean;
};

export type EmailDetachPlan = {
  blocked: boolean;
  message: string | null;
  itemIds: string[];
  keptItems: { id: string; title: string }[];
  documentIds: string[];
  storagePaths: string[];
  travelerIds: string[];
  deleteBooking: boolean;
  nextStatus: "matched" | "parsed";
};

export function attachedEmailLabel(row: { subject?: string | null; extract?: unknown }) {
  const extract =
    row.extract && typeof row.extract === "object"
      ? (row.extract as { items?: { kind?: string; title?: string | null }[] })
      : null;
  const hotel = extract?.items?.find((item) => item?.kind === "hotel" && item.title?.trim());
  return hotel?.title?.trim() || row.subject?.trim() || "Réservation importée";
}

function baseName(name: string) {
  const parts = name.split(/[/\\]/);
  return (parts[parts.length - 1] || "").trim().toLowerCase();
}

function stampOf(item: DetachItem) {
  const value = item.details?.email_ingest_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createdDuringAttach(createdAt: string, attachedAt: string | null) {
  if (!attachedAt) return false;
  const created = Date.parse(createdAt);
  const attached = Date.parse(attachedAt);
  if (!Number.isFinite(created) || !Number.isFinite(attached)) return false;
  return created >= attached - EMAIL_DETACH_MARGIN_MS && created <= attached + EMAIL_DETACH_MARGIN_MS;
}

function bookingFilePath(bookingId: string, path: string | null | undefined) {
  const value = (path || "").trim();
  if (!value.startsWith(`bookings/${bookingId}/`)) return null;
  if (value.includes("email-ingest")) return null;
  return value;
}

function emptyPlan(nextStatus: "matched" | "parsed", blocked: boolean, message: string | null): EmailDetachPlan {
  return {
    blocked,
    message,
    itemIds: [],
    keptItems: [],
    documentIds: [],
    storagePaths: [],
    travelerIds: [],
    deleteBooking: false,
    nextStatus,
  };
}

export function planEmailDetach(input: EmailDetachInput): EmailDetachPlan {
  const nextStatus = input.suggestedCustomerId ? "matched" : "parsed";
  const removeIds = new Set<string>();
  const kept = new Map<string, DetachItem>();

  for (const item of input.items) {
    if (stampOf(item) === input.emailId) removeIds.add(item.id);
  }

  for (const incoming of input.extractItems) {
    const hit = findMatchingItem(input.items, incoming);
    if (!hit) continue;
    const stamp = stampOf(hit);
    if (stamp && stamp !== input.emailId) {
      kept.set(hit.id, hit);
      continue;
    }
    if (removeIds.has(hit.id) || createdDuringAttach(hit.created_at, input.attachedAt)) {
      removeIds.add(hit.id);
      kept.delete(hit.id);
      continue;
    }
    kept.set(hit.id, hit);
  }

  const advancing = input.arrivals.some(
    (arrival) => removeIds.has(arrival.booking_item_id) && arrival.status !== "pending"
  );
  if (advancing) return emptyPlan(nextStatus, true, BLOCKED_MESSAGE);

  const names = new Set(input.attachmentNames.map(baseName).filter(Boolean));
  const documentIds: string[] = [];
  const storagePaths: string[] = [];
  const sourceIds = new Set(
    input.items
      .filter((item) => removeIds.has(item.id) && item.source_document_id)
      .map((item) => item.source_document_id as string)
  );

  for (const doc of input.documents) {
    const path = bookingFilePath(input.bookingId, doc.storage_path);
    const linkedToRemoved = Boolean(doc.booking_item_id && removeIds.has(doc.booking_item_id));
    const linkedToOther = Boolean(doc.booking_item_id && !removeIds.has(doc.booking_item_id));
    const named =
      Boolean(doc.file_name && names.has(baseName(doc.file_name))) &&
      createdDuringAttach(doc.created_at, input.attachedAt);
    const sourced = sourceIds.has(doc.id);
    if (!path) continue;
    if (linkedToRemoved || sourced || (named && !linkedToOther)) {
      documentIds.push(doc.id);
      storagePaths.push(path);
    }
  }

  const travelerIds = input.travelers
    .filter((traveler) => {
      if (!createdDuringAttach(traveler.created_at, input.attachedAt)) return false;
      return input.extractTravelers.some((person) =>
        sameRecordedTraveler(
          { first_name: person.first_name || null, last_name: person.last_name || null },
          { first_name: traveler.first_name || null, last_name: traveler.last_name || null }
        )
      );
    })
    .map((traveler) => traveler.id);

  const remainingItems = input.items.filter((item) => !removeIds.has(item.id));
  const remainingTravelers = input.travelers.filter((traveler) => !travelerIds.includes(traveler.id));
  const notes = (input.booking.notes_internal || "").trim();
  const deleteBooking =
    remainingItems.length === 0 &&
    remainingTravelers.length === 0 &&
    (IMPORT_CREATED_BOOKING_NOTES as readonly string[]).includes(notes) &&
    input.booking.status === "draft" &&
    input.booking.visible_to_client === false &&
    input.hasPostedCredit !== true;

  return {
    blocked: false,
    message: null,
    itemIds: [...removeIds],
    keptItems: [...kept.values()].map((item) => ({
      id: item.id,
      title: (item.title || "").trim() || "Carte",
    })),
    documentIds,
    storagePaths,
    travelerIds,
    deleteBooking,
    nextStatus,
  };
}
