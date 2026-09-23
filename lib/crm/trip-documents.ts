import { isPlaceholderTraveler, namesReferToSamePerson } from "./person-match";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

export function travelerDisplayName(traveler: CrmBookingTraveler) {
  return [traveler.first_name, traveler.last_name].filter(Boolean).join(" ").trim() || "Voyageur";
}

export function travelerInitials(traveler: CrmBookingTraveler) {
  const letters = [traveler.first_name?.[0], traveler.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return letters || "V";
}

export function isVaultDocument(doc: CrmTravelDocument) {
  return !doc.booking_id;
}

export function samePerson(doc: CrmTravelDocument, traveler: CrmBookingTraveler) {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return false;
  if (traveler.companion_id) {
    if (doc.companion_id) return doc.companion_id === traveler.companion_id;
    return namesReferToSamePerson(traveler, doc);
  }
  if (traveler.is_account_holder) {
    if (doc.first_name || doc.last_name) return namesReferToSamePerson(traveler, doc);
    return !doc.companion_id;
  }
  if (namesReferToSamePerson(traveler, doc)) return true;
  return Boolean(doc.traveler_id) && doc.traveler_id === traveler.id;
}

export function documentsForPerson(
  docs: CrmTravelDocument[],
  companionId: string | null | undefined
) {
  const mine = docs.filter((doc) =>
    companionId ? doc.companion_id === companionId : !doc.companion_id
  );
  const vault = mine.filter(isVaultDocument);
  return (vault.length ? vault : mine).sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );
}

export function vaultDocumentsForPerson(
  docs: CrmTravelDocument[],
  companionId: string | null | undefined
) {
  return documentsForPerson(docs, companionId).filter(isVaultDocument);
}

export function personDocumentsForTraveler(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler
) {
  return docs.filter((doc) => samePerson(doc, traveler));
}

export function vaultDocumentsForTraveler(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler
) {
  return docs.filter((doc) => isVaultDocument(doc) && samePerson(doc, traveler));
}

export function tripDocumentsForTraveler(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler
) {
  return docs.filter((doc) => {
    if (doc.booking_id !== traveler.booking_id) return false;
    if (doc.traveler_id) return doc.traveler_id === traveler.id;
    return samePerson(doc, traveler);
  });
}

function documentNumber(value: string | null) {
  return value?.replace(/\s+/g, "").toUpperCase() || "";
}

/** Coffre et copie de séjour du même numéro ou du même fichier : une seule pièce. */
export function isSameDocumentPiece(a: CrmTravelDocument, b: CrmTravelDocument) {
  if (a.id === b.id) return true;
  if (a.storage_path && b.storage_path && a.storage_path === b.storage_path) return true;
  const left = documentNumber(a.number);
  const right = documentNumber(b.number);
  return Boolean(left && left === right && a.doc_type === b.doc_type);
}

function preferVaultCopy(current: CrmTravelDocument, candidate: CrmTravelDocument) {
  const currentVault = isVaultDocument(current);
  const candidateVault = isVaultDocument(candidate);
  if (currentVault !== candidateVault) return candidateVault ? candidate : current;
  return (candidate.created_at || "").localeCompare(current.created_at || "") > 0
    ? candidate
    : current;
}

export function reusableDocumentsForTraveler(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler
) {
  const matches = docs
    .filter((doc) => doc.booking_id !== traveler.booking_id && samePerson(doc, traveler))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const unique: CrmTravelDocument[] = [];
  for (const doc of matches) {
    const index = unique.findIndex((kept) => isSameDocumentPiece(kept, doc));
    if (index === -1) {
      unique.push(doc);
      continue;
    }
    unique[index] = preferVaultCopy(unique[index], doc);
  }
  return unique.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export function primaryIdentityDoc(docs: CrmTravelDocument[]) {
  return docs.find((doc) => doc.doc_type === "passport") || docs[0] || null;
}

export function tripDocCoverage(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[]
) {
  const named = travelers.filter(
    (traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
  );
  const party = named.length ? named : travelers;
  if (!party.length) return { ready: 0, total: 0 };
  const ready = party.filter((traveler) =>
    Boolean(primaryIdentityDoc(tripDocumentsForTraveler(docs, traveler)))
  ).length;
  return { ready, total: party.length };
}
