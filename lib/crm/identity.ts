import { daysUntil } from "./money";
import type { TravelDocType } from "./types";

export const SEX_OPTIONS = [
  { value: "F", label: "Femme" },
  { value: "M", label: "Homme" },
  { value: "X", label: "Autre" },
] as const;

export const RELATIONSHIP_OPTIONS = [
  { value: "conjoint", label: "Conjoint(e)" },
  { value: "enfant", label: "Enfant" },
  { value: "parent", label: "Parent" },
  { value: "famille", label: "Famille" },
  { value: "ami", label: "Ami(e)" },
  { value: "autre", label: "Autre" },
] as const;

export type ExtractedIdentity = {
  doc_type: TravelDocType;
  number: string | null;
  issuing_country: string | null;
  issued_on: string | null;
  expires_on: string | null;
  first_name: string | null;
  last_name: string | null;
  /** Nom d'usage / nom d'épouse, s'il est imprimé à part du nom de naissance. */
  usage_name: string | null;
  birth_date: string | null;
  place_of_birth: string | null;
  nationality: string | null;
  sex: "M" | "F" | "X" | null;
  authority: string | null;
  personal_number: string | null;
  /** Domicile imprimé sur la pièce. Null si la pièce n’en a pas (passeport français). */
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  format: string | null;
  valid: boolean;
};

export type PrintedAddress = {
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

function tidyAddressPart(value: string | null | undefined) {
  const text = emptyToNull(value);
  return text ? text.replace(/\s+/g, " ") : null;
}

/** Découpe une ligne « 12 rue de Rivoli 75001 Paris » quand le code postal est collé à la voie. */
export function splitPrintedAddress(line: string | null | undefined): PrintedAddress | null {
  const text = tidyAddressPart(line);
  if (!text) return null;
  const match = text.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (!match) return null;
  const city = match[3].replace(/,?\s*(france|fr)\s*$/i, "").trim();
  if (!match[1].trim() || !city) return null;
  return {
    address_line: match[1].trim(),
    postal_code: match[2],
    city,
    country: "FR",
  };
}

export function printedAddressFromParts(raw: {
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}): PrintedAddress {
  const country = emptyToNull(raw.country);
  const postal = tidyAddressPart(raw.postal_code)?.replace(/\s/g, "") || null;
  const city = tidyAddressPart(raw.city);
  const line = tidyAddressPart(raw.address_line);
  if (line && !postal) {
    const split = splitPrintedAddress(line);
    if (split) {
      return { ...split, country: country || split.country };
    }
  }
  return {
    address_line: line,
    postal_code: postal,
    city,
    country,
  };
}

/** Ne remplit que les champs d’adresse encore vides. L’adresse de facturation n’est pas touchée. */
export function holderAddressPatch(
  current: {
    address_line?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country?: string | null;
  },
  incoming: PrintedAddress
) {
  const patch: Record<string, string> = {};
  if (!(current.address_line || "").trim() && incoming.address_line) patch.address_line = incoming.address_line;
  if (!(current.postal_code || "").trim() && incoming.postal_code) patch.postal_code = incoming.postal_code;
  if (!(current.city || "").trim() && incoming.city) patch.city = incoming.city;
  if (!(current.country || "").trim() && incoming.country) patch.country = incoming.country;
  return patch;
}

function foldNameToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function titleCaseNamePart(token: string) {
  return token
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (chunk) => chunk.toUpperCase());
}

/** Prénoms du passeport : tous les mots, dans l’ordre imprimé. */
export function givenNameTokens(value: string | null | undefined): string[] {
  if (value == null) return [];
  return String(value)
    .replace(/[<>]+/g, " ")
    .replace(/[,;|]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(titleCaseNamePart);
}

/** Accueil : un seul prénom, le premier. Jean-Pierre reste entier. */
export function greetingGivenName(value: string | null | undefined) {
  return givenNameTokens(value)[0] || null;
}

export function normalizeGivenNames(value: string | null | undefined): string | null {
  const tokens = givenNameTokens(value);
  return tokens.length ? tokens.join(" ") : null;
}

function tokensEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((token, i) => foldNameToken(token) === foldNameToken(right[i]));
}

function isOrderedPrefix(short: string[], long: string[]) {
  if (!short.length || short.length > long.length) return false;
  return short.every((token, i) => foldNameToken(token) === foldNameToken(long[i]));
}

function isOrderedSubsequence(needles: string[], haystack: string[]) {
  let i = 0;
  for (const token of haystack) {
    if (i < needles.length && foldNameToken(token) === foldNameToken(needles[i])) i += 1;
  }
  return i === needles.length;
}

/**
 * Garde tous les prénoms, dans l’ordre du document.
 * La MRZ tronque souvent : on prend la liste la plus complète si l’ordre est conservé.
 */
export function completeGivenNames(
  mrzName: string | null | undefined,
  visionName: string | null | undefined
): string | null {
  const mrz = givenNameTokens(mrzName);
  const vision = givenNameTokens(visionName);
  if (!mrz.length && !vision.length) return null;
  if (!mrz.length) return vision.join(" ");
  if (!vision.length) return mrz.join(" ");
  if (tokensEqual(mrz, vision)) return vision.join(" ");
  if (isOrderedPrefix(mrz, vision) || isOrderedSubsequence(mrz, vision)) return vision.join(" ");
  if (isOrderedPrefix(vision, mrz) || isOrderedSubsequence(vision, mrz)) return mrz.join(" ");
  if (foldNameToken(mrz[0]) === foldNameToken(vision[0])) {
    return (vision.length >= mrz.length ? vision : mrz).join(" ");
  }
  return (vision.length > mrz.length ? vision : mrz).join(" ");
}

export function humanizeMrzName(value: string) {
  return value
    .trim()
    .replace(/[<>]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(titleCaseNamePart)
    .join(" ");
}

export function documentExpiryStatus(isoDate: string | null | undefined) {
  const days = daysUntil(isoDate);
  if (days == null) return { label: "Sans date", tone: "sky" as const };
  if (days < 0) return { label: "Expiré", tone: "red" as const };
  if (days < 180) return { label: "Expire bientôt", tone: "amber" as const };
  return { label: "Valide", tone: "gold" as const };
}

export function documentExpiryWarning(isoDate: string | null | undefined) {
  const days = daysUntil(isoDate);
  if (days == null) return null;
  if (days < 0) return "Ce document est expiré.";
  if (days < 180) {
    return "Validité inférieure à 6 mois — beaucoup de destinations l’exigent.";
  }
  return null;
}

export function emptyToNull(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function identityOverwriteWarning(
  current: { first_name?: string | null; last_name?: string | null },
  incoming: { first_name?: string | null; last_name?: string | null }
) {
  const cur = [current.first_name, current.last_name].filter(Boolean).join(" ").trim();
  const next = [incoming.first_name, incoming.last_name].filter(Boolean).join(" ").trim();
  if (!cur || !next) return null;
  if (cur.toLocaleLowerCase("fr") === next.toLocaleLowerCase("fr")) return null;
  return `Le passeport indique ${next}. Les noms du profil (${cur}) seront mis à jour.`;
}
