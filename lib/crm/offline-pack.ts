import { stayToday } from "@/lib/crm/stay-moment";

const PASSPORT_MARK = /\b\d{2}[A-Z]{2}\d{5}\b|\b[A-Z]{1,2}\d{7,9}\b|\b\d{9}\b/;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Passeport, visa, ETA, pièce d’identité : le numéro ne va pas sur l’appareil. */
export function offlineDocumentBlocked(kind: string, fileName: string) {
  const hay = fold(`${kind} ${fileName}`);
  return /passeport|passport|identit|mrz|\bvisa\b|esta|\beta\b|carte d.ident/.test(hay);
}

/** Retire un numéro de passeport d’un libellé. Le nom du fichier d’origine n’est pas recopié tel quel. */
export function redactPassportMarks(value: string) {
  return value
    .replace(new RegExp(PASSPORT_MARK.source, "g"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([._-])/g, "$1")
    .trim();
}

export type OfflineSource = {
  id: string;
  bookingId: string;
  kind: string;
  fileName: string | null;
  mimeType: string | null;
  storagePath: string;
  visible: boolean;
  reference: string;
  endDate: string | null;
  startDate: string | null;
  status: string;
  bookingVisible: boolean;
};

export type OfflinePackItem = {
  id: string;
  bookingId: string;
  reference: string;
  label: string;
  fileName: string;
  mimeType: string | null;
  path: string;
};

function day(value: string | null) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function tripOpen(row: OfflineSource, today: string) {
  if (!row.bookingVisible || row.status === "cancelled") return false;
  const end = day(row.endDate);
  const start = day(row.startDate);
  if (end) return end >= today;
  if (start) return start >= today;
  return false;
}

function labelOf(row: OfflineSource) {
  const kind = fold(row.kind);
  const name = redactPassportMarks(row.fileName || "");
  if (kind.includes("embarqu")) return "Carte d’embarquement";
  if (kind.includes("insurance") || /assurance/.test(fold(name))) return name ? `Assurance · ${name}` : "Assurance";
  if (/hotel|voucher|confirmation|bon/.test(kind) || /hotel|voucher|confirmation/.test(fold(name))) {
    return name || "Bon d’hôtel";
  }
  return name || "Document du séjour";
}

/**
 * Pièces des séjours en cours ou à venir, visibles.
 * Pas de passeport, pas de visa, pas d’extrait de lecture.
 */
export function offlinePack(rows: OfflineSource[], today = stayToday()) {
  const items: OfflinePackItem[] = [];
  for (const row of rows) {
    if (!row.visible || !row.storagePath || !tripOpen(row, today)) continue;
    const fileName = row.fileName || "";
    if (offlineDocumentBlocked(row.kind, fileName)) continue;
    const label = labelOf(row);
    if (!label || PASSPORT_MARK.test(label)) continue;
    items.push({
      id: row.id,
      bookingId: row.bookingId,
      reference: row.reference,
      label,
      fileName: redactPassportMarks(fileName) || "document",
      mimeType: row.mimeType,
      path: row.storagePath,
    });
  }
  return items;
}
