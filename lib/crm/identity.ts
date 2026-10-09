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

function isHebrewToken(token: string) {
  return /[\u0590-\u05FF]/.test(token);
}

/** Chevrons de la MRZ lus comme une suite de la même lettre (Csss, Ggggg). */
function isFillerToken(token: string) {
  const letters = token.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false;
  const counts = new Map<string, number>();
  for (const char of letters.toUpperCase()) counts.set(char, (counts.get(char) || 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const max = sorted[0] || 0;
  if (letters.length >= 4 && max / letters.length >= 0.6) return true;
  if (letters.length >= 3 && max / letters.length >= 0.8) return true;
  return letters.length >= 10 && (max + (sorted[1] || 0)) / letters.length >= 0.75;
}

/** Prénoms du passeport : tous les mots latins, dans l’ordre imprimé. L’hébreu ne réordonne pas la fiche. */
export function givenNameTokens(value: string | null | undefined): string[] {
  if (value == null) return [];
  return String(value)
    .replace(/[<>]+/g, " ")
    .replace(/[,;|]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !isHebrewToken(token) && !isFillerToken(token))
    .filter((token) => token.replace(/[^\p{L}]/gu, "").length >= 2)
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

function nameEditDistance(a: string, b: string) {
  const left = foldNameToken(a);
  const right = foldNameToken(b);
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 2) return 9;
  const prev = new Array<number>(right.length + 1);
  const curr = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j++) prev[j] = j;
  for (let i = 1; i <= left.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j++) prev[j] = curr[j];
  }
  return prev[right.length];
}

function tokenNear(a: string, b: string) {
  return nameEditDistance(a, b) <= 1;
}

/** Accent de la ligne visuelle, posé sur la graphie MRZ quand l’OCR a coupé la fin. */
function withTokenAccents(mrzToken: string, visionToken: string) {
  const mrzChars = [...mrzToken];
  const visionChars = [...visionToken];
  const mrzFold = [...foldNameToken(mrzToken)];
  const visionFold = [...foldNameToken(visionToken)];
  const out: string[] = [];
  let visionIndex = 0;
  for (let index = 0; index < mrzChars.length; index += 1) {
    if (visionIndex < visionChars.length && visionFold[visionIndex] === mrzFold[index]) {
      out.push(visionChars[visionIndex]);
      visionIndex += 1;
    } else {
      out.push(mrzChars[index]);
    }
  }
  return out.join("");
}

/** Accent ou graphie imprimée, sans allonger un jeton MRZ par un reflet. */
function printedToken(mrzToken: string, visionToken: string) {
  if (foldNameToken(mrzToken) === foldNameToken(visionToken)) return visionToken;
  const mrzFold = foldNameToken(mrzToken);
  const visionFold = foldNameToken(visionToken);
  if (
    visionFold.length >= 3 &&
    mrzFold.startsWith(visionFold) &&
    mrzFold.length - visionFold.length <= 2
  ) {
    return withTokenAccents(mrzToken, visionToken);
  }
  if (tokenNear(mrzToken, visionToken) && visionToken.length <= mrzToken.length) return visionToken;
  return mrzToken;
}

function sameNameMultiset(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const bag = right.map((token) => foldNameToken(token));
  for (const token of left) {
    const fold = foldNameToken(token);
    const index = bag.indexOf(fold);
    if (index < 0) return false;
    bag.splice(index, 1);
  }
  return true;
}

function withPrintedAccents(base: string[], printed: string[]) {
  return base.map((token) => {
    const exact = printed.find((item) => foldNameToken(item) === foldNameToken(token));
    return exact || token;
  });
}

/**
 * Garde tous les prénoms, dans l’ordre latin du document (MRZ, gauche à droite).
 * La MRZ tronque souvent : on prend la liste la plus complète si l’ordre est le même.
 * On ne retourne jamais la ligne pour imiter l’hébreu. Les accents viennent de la ligne imprimée.
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
  if (
    tokenNear(mrz[0], vision[0]) &&
    (isOrderedPrefix(mrz, vision) || isOrderedSubsequence(mrz, vision))
  ) {
    return vision.join(" ");
  }
  if (isOrderedPrefix(vision, mrz) || isOrderedSubsequence(vision, mrz)) {
    return withPrintedAccents(mrz, vision).join(" ");
  }
  if (mrz.length === vision.length && mrz.every((token, index) => tokenNear(token, vision[index]))) {
    return mrz.map((token, index) => printedToken(token, vision[index])).join(" ");
  }
  if (sameNameMultiset(mrz, vision)) return withPrintedAccents(mrz, vision).join(" ");
  if (tokenNear(mrz[0], vision[0])) {
    return mrz.map((token, index) => (vision[index] ? printedToken(token, vision[index]) : token)).join(" ");
  }
  return mrz
    .map((token) => {
      const hit = vision.find((item) => {
        const tokenFold = foldNameToken(token);
        const itemFold = foldNameToken(item);
        if (itemFold === tokenFold) return true;
        if (tokenFold.startsWith(itemFold) && tokenFold.length - itemFold.length <= 2) return true;
        return item.length === token.length && tokenNear(item, token);
      });
      return hit ? printedToken(token, hit) : token;
    })
    .join(" ");
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

/** Phrase client : qui voit la pièce. Rien sur un chiffrement qui n’existe pas. */
export const PASSPORT_VAULT_NOTICE =
  "Ces pièces ne s’ouvrent que dans votre espace, une fois connecté, et pour l’agence quand une formalité l’exige. Elles n’apparaissent pas sur le lien de partage du voyage.";

/**
 * Ligne fermée : quatre derniers caractères. Un numéro trop court pour les cacher
 * entièrement, ou vide, ne révèle aucun chiffre.
 */
export function maskDocumentNumber(number: string | null | undefined): string | null {
  const text = emptyToNull(number);
  if (!text) return null;
  if (text.length <= 4) return "····";
  return `···· ${text.slice(-4)}`;
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

/** Même constat, une fois la pièce confirmée : le profil suit la pièce. */
export function identityAppliedNotice(
  current: { first_name?: string | null; last_name?: string | null },
  incoming: { first_name?: string | null; last_name?: string | null }
) {
  const cur = [current.first_name, current.last_name].filter(Boolean).join(" ").trim();
  const next = [incoming.first_name, incoming.last_name].filter(Boolean).join(" ").trim();
  if (!cur || !next) return null;
  if (cur.toLocaleLowerCase("fr") === next.toLocaleLowerCase("fr")) return null;
  return `Le passeport indique ${next}. Les noms du profil (${cur}) sont mis à jour.`;
}

/** Vrai si le nom enregistré est tout en capitales. On ne le réécrit pas : l’agent corrige une fois. */
export function recordedNameIsAllCaps(value: string | null | undefined) {
  const letters = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

export function allCapsNameNote(first: string | null | undefined, last: string | null | undefined) {
  if (!recordedNameIsAllCaps(first) && !recordedNameIsAllCaps(last)) return null;
  return "Ce nom est enregistré tout en capitales. Corrigez la casse une fois : c’est elle qui s’affiche.";
}
