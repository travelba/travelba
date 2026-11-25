import {
  pieceEstRetiree,
  readPieceArchive,
  withoutPieceArchive,
  withPieceArchive,
  type PieceArchive,
} from "@/lib/crm/dossier-piece";
import { isActiveItem } from "@/lib/crm/types";
import { coversSharedFlight, type TicketDocumentRef, type TicketFlightRef } from "@/lib/crm/ticket-share";

/** Pièce du dossier, assez pour décider ce qui devient orphelin. */
export type StayDocumentRow = {
  id: string;
  booking_item_id?: string | null;
  kind?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  content_sha256?: string | null;
  extracted?: unknown;
  visible_to_client?: boolean | null;
  created_at?: string | null;
};

/** Carte du dossier : le lien `source_document_id` compte autant que `booking_item_id`. */
export type StayItemRef = {
  id: string;
  source_document_id?: string | null;
  kind?: string | null;
  lifecycle?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
};

/** La pièce reste sur une carte qui n’est pas supprimée : on y reporte `booking_item_id`. */
export type DocumentRelink = {
  id: string;
  bookingItemId: string;
};

/** Retrait restaurable : le fichier de stockage reste. `clearSha` sort la ligne de l’index unique. */
export type DocumentRelease = {
  id: string;
  extracted: Record<string, unknown>;
  clearSha: boolean;
};

function byAge(left: StayDocumentRow, right: StayDocumentRow) {
  const created = (left.created_at || "").localeCompare(right.created_at || "");
  if (created) return created;
  return left.id.localeCompare(right.id);
}

function releaseOf(doc: StayDocumentRow, now: string): DocumentRelease {
  const sha = (doc.content_sha256 || "").trim();
  const archive: PieceArchive = {
    retiree_at: now,
    visible_avant: doc.visible_to_client === true,
    ...(sha ? { empreinte: sha } : {}),
  };
  return {
    id: doc.id,
    extracted: withPieceArchive(doc.extracted, archive),
    clearSha: Boolean(sha),
  };
}

function linkedItemIds(doc: StayDocumentRow, items: StayItemRef[]) {
  const links = new Set<string>();
  if (doc.booking_item_id) links.add(doc.booking_item_id);
  if (!doc.id) return links;
  const ticket = doc as TicketDocumentRef;
  const flights = items as TicketFlightRef[];
  for (const item of items) {
    if (item.id && item.source_document_id === doc.id) links.add(item.id);
    if (item.kind === "flight" && item.id && coversSharedFlight(ticket, item, flights)) links.add(item.id);
  }
  return links;
}

function sameFileAlreadyOn(doc: StayDocumentRow, itemIds: string[], documents: StayDocumentRow[]) {
  const sha = (doc.content_sha256 || "").trim();
  if (!sha || !itemIds.length) return false;
  const kept = new Set(itemIds);
  return documents.some((other) => {
    if (other.id === doc.id || pieceEstRetiree(other.extracted)) return false;
    if ((other.content_sha256 || "").trim() !== sha) return false;
    return Boolean(other.booking_item_id && kept.has(other.booking_item_id));
  });
}

function preferredRemaining(ids: string[], items: StayItemRef[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sorted = [...ids].sort();
  return sorted.find((id) => isActiveItem(byId.get(id) || {})) || sorted[0] || "";
}

/**
 * Avant de supprimer des cartes : chaque justificatif qui n’est plus lié à aucune carte
 * restante est retiré (marqueur `tri_piece`), pas effacé du stockage.
 * Une pièce encore liée à une carte qui reste n’est pas retirée. Si son `booking_item_id`
 * pointait une carte supprimée, il est reporté sur une carte restante.
 */
export function planDocumentRelease(input: {
  documents: StayDocumentRow[];
  items?: StayItemRef[];
  deletedItemIds: string[];
  now: string;
}): { release: DocumentRelease[]; relink: DocumentRelink[] } {
  const deleted = new Set(input.deletedItemIds.filter(Boolean));
  if (!deleted.size) return { release: [], relink: [] };
  const items = input.items || [];
  const active = input.documents.filter((doc) => doc.id && !pieceEstRetiree(doc.extracted));
  const release: StayDocumentRow[] = [];
  const relink: DocumentRelink[] = [];
  for (const doc of active) {
    const links = linkedItemIds(doc, items);
    const onDeleted = [...links].some((id) => deleted.has(id));
    if (!onDeleted) continue;
    const remaining = [...links].filter((id) => !deleted.has(id));
    if (remaining.length) {
      if (doc.booking_item_id && deleted.has(doc.booking_item_id)) {
        if (sameFileAlreadyOn(doc, remaining, active)) {
          release.push(doc);
          continue;
        }
        const bookingItemId = preferredRemaining(remaining, items);
        if (bookingItemId) relink.push({ id: doc.id, bookingItemId });
      }
      continue;
    }
    release.push(doc);
  }
  return {
    release: release.sort(byAge).map((doc) => releaseOf(doc, input.now)),
    relink,
  };
}

/** Justificatifs qui partent si cette seule carte est retirée, les autres cartes restant. */
export function justificatifsRetiresAvec(itemId: string, items: StayItemRef[], documents: StayDocumentRow[]) {
  return planDocumentRelease({
    documents,
    items,
    deletedItemIds: [itemId],
    now: "1970-01-01T00:00:00.000Z",
  }).release.length;
}

/** Phrase de confirmation. Vide s’il n’y a aucun justificatif à retirer. */
export function mentionRetraitJustificatifs(count: number) {
  if (count <= 0) return "";
  if (count === 1) return "La carte et son justificatif seront retirés.";
  return `La carte et ses ${count} justificatifs seront retirés.`;
}

/** Restaure l’empreinte mise de côté, pour que le retrait reste réversible. */
export function restoredPieceFields(piece: {
  extracted?: unknown;
  content_sha256?: string | null;
  visible_to_client?: boolean | null;
}): { extracted: Record<string, unknown> | null; visible_to_client: boolean; content_sha256?: string } | null {
  const archive = readPieceArchive(piece.extracted);
  if (!archive) return null;
  const fields: {
    extracted: Record<string, unknown> | null;
    visible_to_client: boolean;
    content_sha256?: string;
  } = {
    extracted: withoutPieceArchive(piece.extracted),
    visible_to_client: archive.visible_avant,
  };
  if (archive.empreinte && !(piece.content_sha256 || "").trim()) fields.content_sha256 = archive.empreinte;
  return fields;
}
