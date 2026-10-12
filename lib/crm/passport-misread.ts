import { resolveNationality } from "./countries";
import type { ExtractedIdentity } from "./identity";
import { nameTokens } from "./person-match";

/** Champs que l’agence peut corriger. Le numéro et le n° personnel n’en font pas partie. */
export const MISREAD_FIELDS = [
  "last_name",
  "first_name",
  "usage_name",
  "sex",
  "birth_date",
  "nationality",
  "place_of_birth",
  "issued_on",
  "expires_on",
  "authority",
] as const;

export type MisreadField = (typeof MISREAD_FIELDS)[number];

export const MISREAD_PATTERNS = [
  "surname_given_swapped",
  "given_reversed",
  "cleared",
  "changed",
] as const;

export type MisreadPattern = (typeof MISREAD_PATTERNS)[number];

export type MisreadReading = {
  issuing_country?: string | null;
} & Partial<Record<MisreadField, string | null>>;

export type MisreadSymptom = {
  issuing_country: string | null;
  fields: MisreadField[];
  patterns: MisreadPattern[];
};

export type MisreadDraft = Record<MisreadField, string> & { note: string };

export const MISREAD_FIELD_LABELS: Record<MisreadField, string> = {
  last_name: "Nom",
  first_name: "Prénoms",
  usage_name: "Nom d'usage",
  sex: "Sexe",
  birth_date: "Date de naissance",
  nationality: "Nationalité",
  place_of_birth: "Lieu de naissance",
  issued_on: "Délivré le",
  expires_on: "Expire le",
  authority: "Autorité",
};

const FIELD_LIMIT = 80;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const PATTERN_COPY: Record<MisreadPattern, string> = {
  surname_given_swapped: "le nom et les prénoms ont été échangés",
  given_reversed: "les prénoms étaient dans l’ordre inverse",
  cleared: "un champ lu a été vidé",
  changed: "un champ lu a été modifié",
};

function clip(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, FIELD_LIMIT);
  return text || null;
}

function plain(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr-FR");
}

function sameBag(left: string | null | undefined, right: string | null | undefined) {
  const tokens = nameTokens(left);
  const bag = nameTokens(right);
  if (!tokens.length || tokens.length !== bag.length) return false;
  for (const token of tokens) {
    const index = bag.indexOf(token);
    if (index < 0) return false;
    bag.splice(index, 1);
  }
  return true;
}

function sameOrder(left: string | null | undefined, right: string | null | undefined) {
  const tokens = nameTokens(left);
  const other = nameTokens(right);
  return tokens.length > 0 && tokens.length === other.length && tokens.every((token, index) => token === other[index]);
}

/** Ne garde que les champs corrigibles. Un numéro envoyé en trop est ignoré. */
export function misreadReading(raw: unknown): MisreadReading {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const reading: MisreadReading = { issuing_country: clip(source.issuing_country) };
  for (const field of MISREAD_FIELDS) reading[field] = clip(source[field]);
  return reading;
}

/**
 * Forme de l’erreur, sans les valeurs lues.
 * Un échange nom / prénoms ou un ordre inversé est nommé ; le reste est « modifié » ou « vidé ».
 */
export function misreadSymptom(readRaw: unknown, correctedRaw: unknown): MisreadSymptom {
  const read = misreadReading(readRaw);
  const corrected = misreadReading(correctedRaw);
  const fields: MisreadField[] = [];
  const patterns = new Set<MisreadPattern>();
  const swapped =
    sameBag(read.last_name, corrected.first_name) &&
    sameBag(read.first_name, corrected.last_name) &&
    !sameOrder(read.last_name, corrected.last_name);
  if (swapped) {
    patterns.add("surname_given_swapped");
    fields.push("last_name", "first_name");
  } else if (
    sameBag(read.first_name, corrected.first_name) &&
    !sameOrder(read.first_name, corrected.first_name)
  ) {
    patterns.add("given_reversed");
    fields.push("first_name");
  }

  for (const field of MISREAD_FIELDS) {
    if (fields.includes(field)) continue;
    const before = read[field];
    const after = corrected[field];
    const same =
      field === "nationality"
        ? resolveNationality(before) === resolveNationality(after)
        : plain(before) === plain(after);
    if (same) continue;
    fields.push(field);
    patterns.add(before && !after ? "cleared" : "changed");
  }

  return {
    issuing_country: resolveNationality(read.issuing_country),
    fields,
    patterns: MISREAD_PATTERNS.filter((pattern) => patterns.has(pattern)),
  };
}

/** Retire une bande MRZ et les suites de chiffres. La phrase qui reste est courte. */
export function scrubMisreadNote(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[A-Z0-9<]{20,}/g, " ")
    .replace(/<+/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return text || null;
}

export function misreadDraftFrom(
  source: Partial<Record<MisreadField | "issuing_country", string | null>> | null | undefined
): MisreadDraft {
  const draft = { note: "" } as MisreadDraft;
  for (const field of MISREAD_FIELDS) draft[field] = clip(source?.[field]) || "";
  return draft;
}

const SEX = new Set(["M", "F", "X"]);

/** Reprend la pièce lue et y pose la correction. Le numéro déjà lu ne change pas. */
export function applyMisreadCorrection<T extends ExtractedIdentity>(identity: T, draft: MisreadDraft): T {
  const sex = SEX.has(draft.sex) ? (draft.sex as "M" | "F" | "X") : null;
  return {
    ...identity,
    last_name: clip(draft.last_name),
    first_name: clip(draft.first_name),
    usage_name: clip(draft.usage_name),
    sex,
    birth_date: DATE.test(draft.birth_date) ? draft.birth_date : null,
    nationality: resolveNationality(draft.nationality),
    place_of_birth: clip(draft.place_of_birth),
    issued_on: DATE.test(draft.issued_on) ? draft.issued_on : null,
    expires_on: DATE.test(draft.expires_on) ? draft.expires_on : null,
    authority: clip(draft.authority),
  };
}

export function misreadRecord(input: {
  staffId: string;
  customerId: string | null;
  read: unknown;
  corrected: unknown;
  note: unknown;
}) {
  const symptom = misreadSymptom(input.read, input.corrected);
  return {
    staff_id: input.staffId,
    customer_id: input.customerId,
    issuing_country: symptom.issuing_country,
    symptom,
    note: scrubMisreadNote(input.note),
    status: "noted" as const,
  };
}

export function misreadHasSignal(record: { symptom: MisreadSymptom; note: string | null }) {
  return record.symptom.fields.length > 0 || Boolean(record.note);
}

export function misreadPrompt(symptom: MisreadSymptom, note: string | null) {
  const shape = symptom.patterns.map((pattern) => PATTERN_COPY[pattern]).join(" ; ");
  const lines = [
    "Une lecture de passeport a été jugée fausse par l’agence.",
    `Pays émetteur : ${symptom.issuing_country || "inconnu"}.`,
    `Champs corrigés : ${symptom.fields.join(", ") || "aucun"}.`,
    `Forme : ${shape || "non précisée"}.`,
  ];
  if (note) lines.push(`Note : ${note}`);
  lines.push(
    "Corrige le parseur dans lib/crm (passport-mrz, passport-extract, passport-visual), le prompt de lib/crm/ocr-document.ts et .cursor/skills/travelba-identity/SKILL.md.",
    "Ajoute un test avec des noms fictifs. N’invente pas de numéro, de MRZ, de photo ni de personne réelle. Ne commite pas de pièce.",
    "Ouvre une pull request. Ne la fusionne pas."
  );
  return lines.join("\n");
}
