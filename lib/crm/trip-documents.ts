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
  if (traveler.companion_id) return doc.companion_id === traveler.companion_id;
  if (traveler.is_account_holder) return !doc.companion_id;
  return doc.traveler_id === traveler.id;
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

export function reusableDocumentsForTraveler(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler
) {
  return docs
    .filter((doc) => doc.booking_id !== traveler.booking_id && samePerson(doc, traveler))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export function primaryIdentityDoc(docs: CrmTravelDocument[]) {
  return docs.find((doc) => doc.doc_type === "passport") || docs[0] || null;
}

export function tripDocCoverage(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[]
) {
  if (!travelers.length) return { ready: 0, total: 0 };
  const ready = travelers.filter((traveler) =>
    Boolean(primaryIdentityDoc(tripDocumentsForTraveler(docs, traveler)))
  ).length;
  return { ready, total: travelers.length };
}
