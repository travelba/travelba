import {
  pieceEstRetiree,
  readPieceArchive,
  withoutPieceArchive,
  withPieceArchive,
  type PieceArchive,
} from "@/lib/crm/dossier-piece";

/** Pièce du dossier, assez pour décider ce qui devient orphelin. */
export type StayDocumentRow = {
  id: string;
  booking_item_id?: string | null;
  content_sha256?: string | null;
  extracted?: unknown;
  visible_to_client?: boolean | null;
  created_at?: string | null;
};

/** Carte du dossier : le lien `source_document_id` compte autant que `booking_item_id`. */
export type StayItemRef = {
  id: string;
  source_document_id?: string | null;
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
  for (const item of items) {
    if (item.id && item.source_document_id === doc.id) links.add(item.id);
  }
  return links;
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
    const remaining = [...links].filter((id) => !deleted.has(id)).sort();
    if (remaining.length) {
      if (doc.booking_item_id && deleted.has(doc.booking_item_id)) {
        relink.push({ id: doc.id, bookingItemId: remaining[0] });
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
