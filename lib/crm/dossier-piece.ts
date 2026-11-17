import { BOOKING_ITEM_LABELS, type BookingItemKind } from "@/lib/crm/types";

/** Marqueur dans `extracted` (jsonb déjà en place). Pas de colonne nouvelle. */
const ARCHIVE_KEY = "tri_piece";

export const PIECE_URL_SECONDS = 600;

export type PieceSource = "mail" | "upload" | "import";

export type PieceArchive = {
  retiree_at: string;
  visible_avant: boolean;
};

export type DossierPieceRow = {
  id: string;
  booking_id: string;
  booking_item_id?: string | null;
  kind?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  storage_path?: string | null;
  visible_to_client?: boolean | null;
  content_sha256?: string | null;
  email_ingest_id?: string | null;
  extracted?: unknown;
  created_at?: string | null;
};

export type PieceCarteVue = {
  carte_id: string;
  type: string;
  libelle: string;
  titre: string | null;
};

export type PieceVue = {
  id: string;
  nom: string;
  type_mime: string;
  taille: number | null;
  ajoute_le: string | null;
  source: PieceSource;
  carte: PieceCarteVue | null;
  visibilite: "visible" | "masquee";
  email_id: string | null;
  retiree?: true;
  retiree_le?: string;
};

const SHA_FILE = /^[a-f0-9]{64}-/i;

export function readPieceArchive(extracted: unknown): PieceArchive | null {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return null;
  const mark = (extracted as Record<string, unknown>)[ARCHIVE_KEY];
  if (!mark || typeof mark !== "object" || Array.isArray(mark)) return null;
  const row = mark as Record<string, unknown>;
  if (typeof row.retiree_at !== "string" || !row.retiree_at.trim()) return null;
  return { retiree_at: row.retiree_at, visible_avant: row.visible_avant === true };
}

export function pieceEstRetiree(extracted: unknown) {
  return readPieceArchive(extracted) != null;
}

export function piecesActives<T extends { extracted?: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => !pieceEstRetiree(row.extracted));
}

/** Conserve les champs déjà lus (passe Apple Wallet) et pose le retrait. */
export function withPieceArchive(extracted: unknown, archive: PieceArchive): Record<string, unknown> {
  const base =
    extracted && typeof extracted === "object" && !Array.isArray(extracted)
      ? { ...(extracted as Record<string, unknown>) }
      : {};
  base[ARCHIVE_KEY] = { retiree_at: archive.retiree_at, visible_avant: archive.visible_avant };
  return base;
}

/** Retire le marqueur. Null si plus rien d’autre n’est stocké. */
export function withoutPieceArchive(extracted: unknown): Record<string, unknown> | null {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return null;
  const next = { ...(extracted as Record<string, unknown>) };
  delete next[ARCHIVE_KEY];
  return Object.keys(next).length ? next : null;
}

/**
 * mail : lien ou empreinte d’un e-mail.
 * import : pièce source d’une carte, ou PDF / photo posé comme à l’import.
 * upload : autre dépôt (formulaire, outil).
 */
export function pieceSource(row: {
  email_ingest_id?: string | null;
  content_sha256?: string | null;
  storage_path?: string | null;
  kind?: string | null;
  source_document?: boolean;
}): PieceSource {
  if (row.email_ingest_id || row.content_sha256) return "mail";
  const file = (row.storage_path || "").split("/").pop() || "";
  if (SHA_FILE.test(file)) return "mail";
  if (row.source_document) return "import";
  const kind = (row.kind || "").toLowerCase();
  if (kind === "pdf" || kind === "image") return "import";
  return "upload";
}

function carteLibelle(kind: string) {
  if ((Object.keys(BOOKING_ITEM_LABELS) as string[]).includes(kind)) {
    return BOOKING_ITEM_LABELS[kind as BookingItemKind];
  }
  return kind;
}

export function pieceVue(input: {
  row: DossierPieceRow;
  item: { id: string; kind?: string | null; title?: string | null } | null;
  sourceDocument: boolean;
  taille: number | null;
}): PieceVue {
  const archive = readPieceArchive(input.row.extracted);
  const kind = input.item?.kind || "";
  const vue: PieceVue = {
    id: input.row.id,
    nom: (input.row.file_name || "").trim() || "fichier",
    type_mime: (input.row.mime_type || "").trim() || "application/octet-stream",
    taille: input.taille,
    ajoute_le: input.row.created_at || null,
    source: pieceSource({
      email_ingest_id: input.row.email_ingest_id,
      content_sha256: input.row.content_sha256,
      storage_path: input.row.storage_path,
      kind: input.row.kind,
      source_document: input.sourceDocument,
    }),
    carte: input.item
      ? {
          carte_id: input.item.id,
          type: kind,
          libelle: carteLibelle(kind),
          titre: input.item.title?.trim() || null,
        }
      : null,
    visibilite: input.row.visible_to_client === true ? "visible" : "masquee",
    email_id: input.row.email_ingest_id || null,
  };
  if (archive) {
    vue.retiree = true;
    vue.retiree_le = archive.retiree_at;
  }
  return vue;
}
