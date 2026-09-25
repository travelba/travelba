import { documentLabel } from "./carnet";
import { isPlaceholderTraveler, type PersonName } from "./person-match";
import { documentMatchesTraveler, travelerDisplayName } from "./trip-documents";
import type { CrmBookingDocument, CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "./types";

export type FilePreviewModel = {
  id: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  label: string;
  shareText: string;
};

export function isPreviewImage(mime?: string | null, name?: string | null) {
  const hay = `${mime || ""} ${name || ""}`.toLowerCase();
  return hay.includes("image") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name || "");
}

export function isPreviewPdf(mime?: string | null, name?: string | null) {
  const hay = `${mime || ""} ${name || ""}`.toLowerCase();
  return hay.includes("pdf") || /\.pdf$/i.test(name || "");
}

function passportShareText(reference?: string | null) {
  const ref = (reference || "").trim();
  return ref
    ? `Bonjour, je vous transmets un passeport du dossier ${ref}.`
    : "Bonjour, je vous transmets un passeport pour ce séjour.";
}

function attachmentShareText(reference?: string | null) {
  const ref = (reference || "").trim();
  return ref
    ? `Bonjour, je vous transmets une pièce du dossier ${ref}.`
    : "Bonjour, je vous transmets une pièce de la réservation.";
}

/** Un passeport avec fichier par voyageur. Le texte de partage ne contient pas le numéro. */
export function passportPreviewsForStay(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  holder?: PersonName | null,
  reference?: string | null
): FilePreviewModel[] {
  const named = travelers.filter(
    (traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
  );
  const party = named.length ? named : travelers;
  const out: FilePreviewModel[] = [];
  const seen = new Set<string>();
  for (const traveler of party) {
    const matches = docs.filter(
      (doc) =>
        doc.doc_type === "passport" &&
        Boolean(doc.storage_path) &&
        documentMatchesTraveler(doc, traveler, holder)
    );
    const doc =
      matches.find((row) => row.booking_id === traveler.booking_id) || matches[0] || null;
    if (!doc?.storage_path || seen.has(doc.storage_path)) continue;
    seen.add(doc.storage_path);
    out.push({
      id: doc.id,
      path: doc.storage_path,
      fileName: doc.file_name || "passeport",
      mimeType: doc.mime_type,
      label: travelerDisplayName(traveler),
      shareText: passportShareText(reference),
    });
  }
  return out;
}

export function attachmentPreviews(
  docs: CrmBookingDocument[],
  items: CrmBookingItem[],
  reference?: string | null
): FilePreviewModel[] {
  return docs
    .filter((doc) => Boolean(doc.storage_path))
    .map((doc) => ({
      id: doc.id,
      path: doc.storage_path,
      fileName: doc.file_name || "document",
      mimeType: doc.mime_type,
      label: documentLabel(doc, items),
      shareText: attachmentShareText(reference),
    }));
}

export function identityPreview(
  doc: Pick<CrmTravelDocument, "id" | "storage_path" | "file_name" | "mime_type" | "doc_type">,
  label: string
): FilePreviewModel | null {
  if (!doc.storage_path) return null;
  const passport = doc.doc_type === "passport";
  return {
    id: doc.id,
    path: doc.storage_path,
    fileName: doc.file_name || (passport ? "passeport" : "piece"),
    mimeType: doc.mime_type,
    label: label.trim() || (passport ? "Passeport" : "Pièce"),
    shareText: passport
      ? "Bonjour, je vous transmets un passeport."
      : "Bonjour, je vous transmets une pièce d’identité.",
  };
}
