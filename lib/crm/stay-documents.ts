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

/**
 * Avant de supprimer des cartes : une empreinte ne doit laisser qu’une pièce active sans carte.
 * Les autres sont retirées (marqueur `tri_piece`), pas effacées du stockage.
 * `removeIds` : l’agence a choisi « Supprimer aussi les billets/pièces » pour ces lignes.
 * Une pièce encore liée à une carte qui reste n’est pas touchée.
 */
export function planDocumentRelease(input: {
  documents: StayDocumentRow[];
  deletedItemIds: string[];
  removeIds?: string[];
  now: string;
}): DocumentRelease[] {
  const deleted = new Set(input.deletedItemIds.filter(Boolean));
  const remove = new Set((input.removeIds || []).filter(Boolean));
  if (!deleted.size && !remove.size) return [];
  const active = input.documents.filter((doc) => doc.id && !pieceEstRetiree(doc.extracted));
  const stays = (doc: StayDocumentRow) => Boolean(doc.booking_item_id) && !deleted.has(doc.booking_item_id || "");
  const orphanSha = new Set(
    active
      .filter((doc) => !doc.booking_item_id && (doc.content_sha256 || "").trim())
      .map((doc) => (doc.content_sha256 || "").trim())
  );

  const forced = new Set<string>();
  const candidates: StayDocumentRow[] = [];
  for (const doc of active) {
    if (stays(doc)) continue;
    const onDeleted = Boolean(doc.booking_item_id) && deleted.has(doc.booking_item_id || "");
    const chosen = remove.has(doc.id) && (onDeleted || !doc.booking_item_id);
    if (chosen) {
      forced.add(doc.id);
      continue;
    }
    if (onDeleted) candidates.push(doc);
  }

  const release = new Map<string, StayDocumentRow>();
  const bySha = new Map<string, StayDocumentRow[]>();
  for (const doc of candidates) {
    const sha = (doc.content_sha256 || "").trim();
    if (!sha) continue;
    const group = bySha.get(sha) || [];
    group.push(doc);
    bySha.set(sha, group);
  }
  for (const [sha, group] of bySha) {
    const sorted = group.slice().sort(byAge);
    if (orphanSha.has(sha)) {
      for (const doc of sorted) release.set(doc.id, doc);
      continue;
    }
    if (sorted.length > 1) {
      for (const doc of sorted.slice(1)) release.set(doc.id, doc);
    }
  }
  for (const doc of active) {
    if (forced.has(doc.id)) release.set(doc.id, doc);
  }
  return [...release.values()].sort(byAge).map((doc) => releaseOf(doc, input.now));
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
