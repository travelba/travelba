import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "./agency-log";
import { missingDbColumn } from "./optional-column";
import { HOTEL_DESK_LABELS, containsCardNumber } from "./hotel-desk";
import { noticeHotelName } from "./hotel-reply-notice";
import { McpWriteError } from "./mcp-write";
import { fold } from "./text";
import { HOTEL_DESK_KINDS, type HotelDeskKind } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENT = new Set(["sent", "follow_up", "replied"]);
const NOTE_MAX = 500;

export type HotelCourrierActor = {
  staffId: string | null;
  name: string;
};

type LetterRow = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  kind: string;
  status: string;
  classified_at: string | null;
  classified_by_name: string | null;
  classified_note: string | null;
};

type ItemRow = {
  id: string;
  title: string | null;
  details: { hotel_name?: unknown } | null;
};

function cleanName(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  if (!note) return null;
  if (containsCardNumber(note)) throw new McpWriteError("La note ne peut pas contenir un numéro de carte.");
  return note;
}

/** Libellé français ou clé du bureau. Null si la demande est inconnue. */
export function hotelDeskKindFromLabel(value: string): HotelDeskKind | null {
  const compact = fold(value).replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if ((HOTEL_DESK_KINDS as readonly string[]).includes(compact)) return compact as HotelDeskKind;
  for (const kind of HOTEL_DESK_KINDS) {
    if (fold(HOTEL_DESK_LABELS[kind]) === compact) return kind;
  }
  return null;
}

function hotelLabel(item: ItemRow | undefined) {
  const name = item?.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name : "";
  return noticeHotelName({ hotelName: name, title: item?.title });
}

function hotelMatches(label: string, query: string) {
  const left = fold(label);
  const right = fold(query);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function migrationMissing(error: { code?: string | null; message?: string | null } | null) {
  return missingDbColumn(error, "classified_at") || missingDbColumn(error, "classified_by");
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Classe ou rouvre un courrier hôtel déjà parti.
 * N’écrit que le classement. N’envoie aucun e-mail.
 */
export async function setHotelCourrierClass(
  db: SupabaseClient,
  input: Record<string, unknown>,
  actor: HotelCourrierActor,
  options?: { journal?: boolean; journalPath?: string }
) {
  const bookingId = textOf(input.dossier_id || input.bookingId);
  const reference = textOf(input.reference);
  if (!bookingId && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (bookingId && !UUID.test(bookingId)) throw new McpWriteError("Dossier invalide.");
  const reopen = input.rouvrir === true || input.reopen === true;
  const courrierId = textOf(input.courrier_id);
  if (courrierId && !UUID.test(courrierId)) throw new McpWriteError("Courrier invalide.");
  const carteId = textOf(input.carte_id || input.carteId);
  if (carteId && !UUID.test(carteId)) throw new McpWriteError("Carte invalide.");
  const kind = courrierId ? null : hotelDeskKindFromLabel(textOf(input.demande || input.kind));
  if (!courrierId && !kind) {
    throw new McpWriteError(
      "Demande inconnue. Lien de paiement, Transfert, Upgrade et accueil, Pré-check-in, Note de la maison, Concierge ou Autre demande."
    );
  }
  const note = reopen ? null : cleanNote(input.note);

  let bookingQuery = db.from("crm_bookings").select("id, reference");
  bookingQuery = bookingId ? bookingQuery.eq("id", bookingId) : bookingQuery.eq("reference", reference);
  const bookings = await bookingQuery.limit(2);
  if (bookings.error) throw new McpWriteError("Dossier introuvable.");
  const bookingRows = (bookings.data || []) as { id: string; reference: string | null }[];
  if (!bookingRows.length) throw new McpWriteError("Dossier introuvable.");
  if (bookingRows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookingRows[0];

  const letters = await db
    .from("crm_hotel_requests")
    .select("id, booking_id, booking_item_id, kind, status, classified_at, classified_by_name, classified_note")
    .eq("booking_id", booking.id);
  if (letters.error) {
    if (migrationMissing(letters.error)) throw new McpWriteError("Le classement des courriers n’est pas encore en place.");
    throw new McpWriteError("Le courrier n’a pas pu être classé.");
  }
  let rows = (letters.data || []) as LetterRow[];
  if (courrierId) rows = rows.filter((row) => row.id === courrierId);
  else if (kind) rows = rows.filter((row) => row.kind === kind);
  if (carteId) rows = rows.filter((row) => row.booking_item_id === carteId);
  if (!rows.length) throw new McpWriteError("Ce courrier n’est pas sur ce dossier.");

  const itemIds = [...new Set(rows.map((row) => row.booking_item_id))];
  const items = itemIds.length
    ? await db.from("crm_booking_items").select("id, title, details").in("id", itemIds).eq("booking_id", booking.id)
    : { data: [] as ItemRow[], error: null };
  if (items.error) throw new McpWriteError("Le courrier n’a pas pu être classé.");
  const byItem = new Map(((items.data || []) as ItemRow[]).map((item) => [item.id, item]));
  const hotelQuery = textOf(input.hotel);
  if (hotelQuery) {
    rows = rows.filter((row) => hotelMatches(hotelLabel(byItem.get(row.booking_item_id)), hotelQuery));
    if (!rows.length) throw new McpWriteError("Cet hôtel n’a pas ce courrier sur le dossier.");
  }
  if (rows.length > 1) {
    const names = [...new Set(rows.map((row) => hotelLabel(byItem.get(row.booking_item_id))))];
    throw new McpWriteError(`Plusieurs hôtels ont ce courrier : ${names.join(", ")}. Indiquez l’hôtel.`);
  }
  const row = rows[0];
  const label = hotelDeskKindFromLabel(row.kind) ? HOTEL_DESK_LABELS[row.kind as HotelDeskKind] : "Courrier";
  const hotel = hotelLabel(byItem.get(row.booking_item_id));
  if (!SENT.has(row.status)) throw new McpWriteError("Ce courrier n’est pas un fil déjà parti.");

  const author = cleanName(actor.name) || "Agence";
  const staffId = actor.staffId && UUID.test(actor.staffId) ? actor.staffId : null;
  const now = new Date().toISOString();
  if (reopen && !row.classified_at) {
    return {
      reference: booking.reference || reference,
      dossier_id: booking.id,
      hotel,
      demande: label,
      courrier_id: row.id,
      classe: false,
      rouvert: false,
      deja_ouvert: true,
      classe_le: null,
      par: null,
      note: null,
      email_envoye: false,
    };
  }

  const payload = reopen
    ? {
        classified_at: null,
        classified_by: null,
        classified_by_name: null,
        classified_note: null,
      }
    : {
        classified_at: now,
        classified_by: staffId,
        classified_by_name: author,
        classified_note: note,
      };
  const saved = await db.from("crm_hotel_requests").update(payload).eq("id", row.id).eq("booking_id", booking.id);
  if (saved.error) {
    if (migrationMissing(saved.error)) throw new McpWriteError("Le classement des courriers n’est pas encore en place.");
    throw new McpWriteError("Le courrier n’a pas pu être classé.");
  }

  if (options?.journal !== false) {
    const verb = reopen ? "rouvert" : "classé";
    await recordAgencyJournal({
      staffId,
      action: "update",
      entityType: "dossier",
      entityId: booking.id,
      summary: `Courrier hôtel ${verb} (${label}, ${hotel}) par ${author}.`.slice(0, 500),
      path: options?.journalPath || "/api/mcp",
    });
  }

  return {
    reference: booking.reference || reference,
    dossier_id: booking.id,
    hotel,
    demande: label,
    courrier_id: row.id,
    classe: !reopen,
    rouvert: reopen,
    deja_ouvert: false,
    classe_le: reopen ? null : now,
    par: reopen ? null : author,
    note: reopen ? null : note,
    email_envoye: false,
  };
}
