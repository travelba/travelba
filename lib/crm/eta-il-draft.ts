import { siteConfig } from "../site";
import type { PersonName } from "./person-match";
import {
  primaryIdentityDoc,
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "./trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";
import { frenchPassportTrip } from "./visa-trip";

export const ETA_IL_PORTAL = "https://israel-entry.piba.gov.il/";
export const ETA_IL_HOST = "israel-entry.piba.gov.il";
export const ETA_IL_MODEL = "gpt-6-astra";

export type EtaIlPhase = "brouillon" | "prêt" | "à confirmer" | "bloqué";

export type EtaIlPersonView = {
  travelerId: string;
  name: string;
  ready: boolean;
  missing: string[];
  blockedReason: string | null;
};

export type EtaIlApplicant = {
  travelerId: string;
  firstName: string;
  lastName: string;
  number: string;
  birthDate: string;
  sex: "M" | "F" | "X";
  expiresOn: string;
  nationality: "FR";
  email: string;
  minor: boolean;
};

export type EtaIlGuardian = {
  firstName: string;
  lastName: string;
  number: string;
  issuingCountry: string;
};

export type EtaIlDraft = {
  phase: EtaIlPhase;
  portal: string;
  reason: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: EtaIlPersonView[];
  applicants: EtaIlApplicant[];
  guardian: EtaIlGuardian | null;
};

type FlightRow = { kind?: string | null; details?: Record<string, unknown> | null };

const FIELD_LABELS = {
  first: "prénom",
  last: "nom",
  number: "numéro de passeport",
  birth: "date de naissance",
  sex: "sexe",
  expires: "expiration",
  nationality: "nationalité",
  dates: "dates du séjour",
  email: "e-mail agence",
} as const;

function text(value: string | null | undefined) {
  const next = String(value || "").trim();
  return next || null;
}

function iso2(value: string | null | undefined) {
  const next = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(next) ? next : null;
}

function passportFor(
  docs: CrmTravelDocument[],
  traveler: CrmBookingTraveler,
  holder: PersonName | null
) {
  const onTrip = tripDocumentsForTraveler(docs, traveler).filter((doc) => doc.doc_type === "passport");
  const trip = primaryIdentityDoc(onTrip);
  if (trip?.doc_type === "passport") return trip;
  const reusable = reusableDocumentsForTraveler(docs, traveler, holder).filter(
    (doc) => doc.doc_type === "passport"
  );
  return primaryIdentityDoc(reusable);
}

function sexOf(value: string | null | undefined): "M" | "F" | "X" | null {
  if (value === "M" || value === "F" || value === "X") return value;
  return null;
}

/** Mineur le jour du départ : le 18e anniversaire est déjà adulte. */
export function isMinorOn(birthDate: string, onDate: string) {
  const birth = birthDate.slice(0, 10);
  const on = onDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return false;
  const [year, month, day] = birth.split("-").map(Number);
  const adult = `${year + 18}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return on < adult;
}

export function guardianForMinors(input: {
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  holder?: PersonName | null;
  onDate: string;
}): EtaIlGuardian | null {
  const adults = input.travelers
    .map((traveler) => {
      const passport = passportFor(input.documents, traveler, input.holder || null);
      const birthDate = text(passport?.birth_date);
      const firstName = text(passport?.first_name) || text(traveler.first_name);
      const lastName = text(passport?.last_name) || text(traveler.last_name);
      const number = text(passport?.number);
      const issuingCountry = iso2(passport?.issuing_country) || iso2(passport?.nationality);
      if (!birthDate || isMinorOn(birthDate, input.onDate) || !firstName || !lastName || !number || !issuingCountry) {
        return null;
      }
      return { traveler, guardian: { firstName, lastName, number, issuingCountry } };
    })
    .filter((row): row is { traveler: CrmBookingTraveler; guardian: EtaIlGuardian } => Boolean(row));
  const holder = adults.find((row) => row.traveler.is_account_holder) || adults[0];
  return holder?.guardian || null;
}

export function tripGoesToIsrael(items: FlightRow[] | null | undefined) {
  return frenchPassportTrip(items, 0).entries.some((entry) => entry.iso === "IL");
}

export function buildEtaIlDraft(input: {
  items: FlightRow[] | null | undefined;
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  holder?: PersonName | null;
  startDate?: string | null;
  endDate?: string | null;
  agencyEmail?: string | null;
  travelerIds?: string[] | null;
}): EtaIlDraft {
  const portal = ETA_IL_PORTAL;
  const email = text(input.agencyEmail ?? siteConfig.contactEmail);
  const startDate = text(input.startDate);
  const endDate = text(input.endDate);
  const empty: EtaIlDraft = {
    phase: "bloqué",
    portal,
    reason: null,
    startDate,
    endDate,
    travelers: [],
    applicants: [],
    guardian: null,
  };
  if (!tripGoesToIsrael(input.items)) {
    return { ...empty, reason: "Ce dossier n’a pas de vol vers Israël." };
  }
  const selected = (input.travelerIds || []).filter((id) => id.trim());
  const party = selected.length
    ? input.travelers.filter((row) => selected.includes(row.id))
    : input.travelers;
  if (!party.length) {
    return {
      ...empty,
      phase: "brouillon",
      reason: selected.length ? "Aucun voyageur coché pour cette demande." : "Ajoutez les voyageurs du séjour.",
    };
  }

  const travelers: EtaIlPersonView[] = [];
  const applicants: EtaIlApplicant[] = [];
  for (const traveler of party) {
    const passport = passportFor(input.documents, traveler, input.holder || null);
    const firstName = text(passport?.first_name) || text(traveler.first_name);
    const lastName = text(passport?.last_name) || text(traveler.last_name);
    const number = text(passport?.number);
    const birthDate = text(passport?.birth_date);
    const sex = sexOf(passport?.sex);
    const expiresOn = text(passport?.expires_on);
    const nationality = iso2(passport?.nationality) || iso2(passport?.issuing_country);
    const missing: string[] = [];
    if (!firstName) missing.push(FIELD_LABELS.first);
    if (!lastName) missing.push(FIELD_LABELS.last);
    if (!number) missing.push(FIELD_LABELS.number);
    if (!birthDate) missing.push(FIELD_LABELS.birth);
    if (!sex) missing.push(FIELD_LABELS.sex);
    if (!expiresOn) missing.push(FIELD_LABELS.expires);
    if (!nationality) missing.push(FIELD_LABELS.nationality);
    if (!startDate || !endDate) missing.push(FIELD_LABELS.dates);
    if (!email) missing.push(FIELD_LABELS.email);
    const french = nationality === "FR";
    const blockedReason =
      nationality && !french ? "Passeport français requis pour cette demande." : null;
    const ready = missing.length === 0 && !blockedReason;
    travelers.push({
      travelerId: traveler.id,
      name: travelerDisplayName(traveler),
      ready,
      missing,
      blockedReason,
    });
    if (ready && firstName && lastName && number && birthDate && sex && expiresOn && email) {
      applicants.push({
        travelerId: traveler.id,
        firstName,
        lastName,
        number,
        birthDate,
        sex,
        expiresOn,
        nationality: "FR",
        email,
        minor: Boolean(startDate && birthDate && isMinorOn(birthDate, startDate)),
      });
    }
  }

  if (travelers.some((row) => row.blockedReason)) {
    return {
      phase: "bloqué",
      portal,
      reason: "Un voyageur n’a pas de passeport français.",
      startDate,
      endDate,
      travelers,
      applicants: [],
      guardian: null,
    };
  }
  if (travelers.some((row) => !row.ready)) {
    return {
      phase: "brouillon",
      portal,
      reason: "Complétez les champs manquants avant de lancer le remplissage.",
      startDate,
      endDate,
      travelers,
      applicants: [],
      guardian: null,
    };
  }
  const guardian =
    startDate && applicants.some((row) => row.minor)
      ? guardianForMinors({
          travelers: input.travelers,
          documents: input.documents,
          holder: input.holder,
          onDate: startDate,
        })
      : null;
  if (applicants.some((row) => row.minor) && !guardian) {
    return {
      phase: "brouillon",
      portal,
      reason: "Un voyageur mineur exige le passeport d’un représentant adulte.",
      startDate,
      endDate,
      travelers,
      applicants: [],
      guardian: null,
    };
  }
  return {
    phase: "prêt",
    portal,
    reason: null,
    startDate,
    endDate,
    travelers,
    applicants,
    guardian,
  };
}

/** Vue renvoyée au navigateur : pas de numéro de passeport. */
export function publicEtaIlDraft(draft: EtaIlDraft) {
  return {
    phase: draft.phase,
    portal: draft.portal,
    reason: draft.reason,
    startDate: draft.startDate,
    endDate: draft.endDate,
    travelers: draft.travelers,
  };
}
