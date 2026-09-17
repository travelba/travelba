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
  expires_on: string | null;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  nationality: string | null;
  sex: "M" | "F" | "X" | null;
  format: string | null;
  valid: boolean;
};

export function humanizeMrzName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (chunk) => chunk.toUpperCase());
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

const IDENTITY_SCORE_KEYS: (keyof ExtractedIdentity)[] = [
  "number",
  "last_name",
  "first_name",
  "birth_date",
  "expires_on",
  "nationality",
];

export function identityFieldScore(identity: ExtractedIdentity) {
  return IDENTITY_SCORE_KEYS.reduce((sum, key) => sum + (identity[key] ? 1 : 0), 0);
}

export function identityScanWarning(identity: ExtractedIdentity) {
  if (identity.valid || identityFieldScore(identity) >= 5) return null;
  return "Lecture partielle : vérifiez chaque champ avant d’enregistrer.";
}
