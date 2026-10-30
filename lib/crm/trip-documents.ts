import { greetingGivenName, shownPersonName } from "./identity";
import {
  holderMatchesAddedTraveler,
  isPlaceholderTraveler,
  namesReferToSamePerson,
  type PersonIdentity,
  type PersonName,
} from "./person-match";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

export type PassportCompanion = PersonName & { id: string; birth_date?: string | null };

export function travelerDisplayName(traveler: CrmBookingTraveler) {
  return shownPersonName(traveler) || "Voyageur";
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

/** Passeport du coffre titulaire : le profil a les deux prénoms, le billet n’en a qu’un. */
export function holderVaultMatchesProfile(
  doc: CrmTravelDocument,
  traveler: CrmBookingTraveler,
  holder?: PersonName | null
) {
  if (!traveler.is_account_holder || !holder) return false;
  if (doc.companion_id) return false;
  if (!(doc.first_name || doc.last_name)) return false;
  return namesReferToSamePerson(holder, doc);
}

export function documentMatchesTraveler(
  doc: CrmTravelDocument,
  traveler: CrmBookingTraveler,
  holder?: PersonName | null
) {
  return samePerson(doc, traveler) || holderVaultMatchesProfile(doc, traveler, holder);
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

function sameReviewPiece(a: CrmTravelDocument, b: CrmTravelDocument) {
  if ((a.companion_id || "") !== (b.companion_id || "")) return false;
  if (a.doc_type !== b.doc_type) return false;
  const left = documentNumber(a.number);
  const right = documentNumber(b.number);
  if (left && right) return left === right;
  if (left || right) return false;
  const name = `${a.first_name || ""}|${a.last_name || ""}|${a.expires_on || ""}`;
  return name !== "||" && name === `${b.first_name || ""}|${b.last_name || ""}|${b.expires_on || ""}`;
}

/** Coffre + copies de séjour du même numéro : une seule ligne à valider. */
export function reviewIdentityPieces(docs: CrmTravelDocument[]) {
  const unique: CrmTravelDocument[] = [];
  for (const doc of docs) {
    const index = unique.findIndex((kept) => sameReviewPiece(kept, doc));
    if (index === -1) {
      unique.push(doc);
      continue;
    }
    unique[index] = preferVaultCopy(unique[index], doc);
  }
  return unique;
}

export function vaultDocumentsForPerson(
  docs: CrmTravelDocument[],
  companionId: string | null | undefined
) {
  return reviewIdentityPieces(documentsForPerson(docs, companionId).filter(isVaultDocument));
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
  traveler: CrmBookingTraveler,
  holder?: PersonName | null
) {
  const matches = docs
    .filter((doc) => doc.booking_id !== traveler.booking_id && documentMatchesTraveler(doc, traveler, holder))
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

function isoDay(value: string | null | undefined) {
  const day = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function personOf(row: { first_name?: string | null; last_name?: string | null; usage_name?: string | null; birth_date?: string | null }): PersonIdentity {
  return {
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    usage_name: row.usage_name ?? null,
    birth_date: row.birth_date ?? null,
  };
}

/** Le voyageur est le titulaire, même s’il a été rangé sur un compagnon qui est lui-même le titulaire. */
function actsAsHolder(
  traveler: CrmBookingTraveler,
  holder: PersonIdentity | null | undefined,
  companions: PassportCompanion[]
) {
  if (traveler.is_account_holder) return true;
  if (!holder || !holderMatchesAddedTraveler(holder, personOf(traveler))) return false;
  if (!traveler.companion_id) return true;
  const companion = companions.find((row) => row.id === traveler.companion_id);
  if (!companion) return true;
  return holderMatchesAddedTraveler(holder, personOf(companion));
}

/**
 * Passeport du coffre ou du séjour : le nom du voyageur, celui du titulaire,
 * ou celui d’un compagnon qui est cette personne. Un livret sans nom au coffre
 * du titulaire est le sien.
 */
export function passportMatchesTraveler(
  doc: CrmTravelDocument,
  traveler: CrmBookingTraveler,
  holder?: PersonIdentity | null,
  companions: PassportCompanion[] = []
) {
  if (doc.doc_type !== "passport") return false;
  if (documentMatchesTraveler(doc, traveler, holder)) return true;
  if (doc.traveler_id && doc.traveler_id === traveler.id) return true;
  if (doc.companion_id) {
    if (traveler.companion_id === doc.companion_id) return true;
    const companion = companions.find((row) => row.id === doc.companion_id);
    if (companion && holderMatchesAddedTraveler(personOf(companion), personOf(traveler))) return true;
  }
  if (!actsAsHolder(traveler, holder, companions)) return false;
  const probe: CrmBookingTraveler = { ...traveler, is_account_holder: true, companion_id: null };
  return documentMatchesTraveler(doc, probe, holder);
}

/** Valide le jour du retour : la date d’expiration est après ce jour. Sans date, le livret déposé compte. */
export function passportValidAtReturn(doc: CrmTravelDocument, returnOn: string | null | undefined) {
  const expires = isoDay(doc.expires_on);
  const back = isoDay(returnOn);
  if (!expires || !back) return true;
  return expires > back;
}

function partyOf(travelers: CrmBookingTraveler[]) {
  const named = travelers.filter(
    (traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
  );
  return named.length ? named : travelers;
}

type PassportPartyOptions = {
  holder?: PersonIdentity | null;
  companions?: PassportCompanion[];
  returnOn?: string | null;
};

function partyOptions(options?: PassportPartyOptions) {
  return {
    holder: options?.holder ?? null,
    companions: options?.companions ?? [],
    returnOn: isoDay(options?.returnOn),
  };
}

/** Voyageurs sans aucun passeport. Un livret déposé qui expire avant le retour n’est pas absent. */
export function travelersMissingPassport(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  options?: PassportPartyOptions
) {
  const { holder, companions } = partyOptions(options);
  return partyOf(travelers).filter((traveler) => {
    if (primaryIdentityDoc(tripDocumentsForTraveler(docs, traveler))) return false;
    return !docs.some((doc) => passportMatchesTraveler(doc, traveler, holder, companions));
  });
}

export type PassportExpiry = {
  traveler: CrmBookingTraveler;
  document: CrmTravelDocument;
  /** AAAA-MM-JJ */
  expiresOn: string;
  /** AAAA-MM-JJ */
  returnOn: string;
  /** Premier prénom imprimé sur le passeport. */
  givenName: string;
};

/**
 * Passeport déposé, mais aucun livret n’est valable le jour du retour.
 * Le prénom est celui du passeport, pas le nom d’usage.
 */
export function travelersPassportExpiresBeforeReturn(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  options?: PassportPartyOptions
): PassportExpiry[] {
  const { holder, companions, returnOn } = partyOptions(options);
  if (!returnOn) return [];
  const rows: PassportExpiry[] = [];
  for (const traveler of partyOf(travelers)) {
    const matches = docs.filter((doc) => passportMatchesTraveler(doc, traveler, holder, companions));
    if (!matches.length) continue;
    if (matches.some((doc) => passportValidAtReturn(doc, returnOn))) continue;
    const dated = matches
      .map((doc) => ({ doc, expires: isoDay(doc.expires_on) }))
      .filter((row): row is { doc: CrmTravelDocument; expires: string } => Boolean(row.expires) && row.expires <= returnOn)
      .sort((a, b) => b.expires.localeCompare(a.expires));
    const best = dated[0];
    if (!best) continue;
    const givenName = greetingGivenName(best.doc.first_name) || greetingGivenName(traveler.first_name);
    if (!givenName) continue;
    rows.push({
      traveler,
      document: best.doc,
      expiresOn: best.expires,
      returnOn,
      givenName,
    });
  }
  return rows;
}

export function missingPassportCount(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  options?: PassportPartyOptions
) {
  return travelersMissingPassport(travelers, docs, options).length;
}
