import { resolveCountryCode } from "./countries";
import { emptyToNull, humanizeMrzName, type ExtractedIdentity } from "./identity";
import { DOC_TYPES, type TravelDocType } from "./types";

export function emptyIdentity(): ExtractedIdentity {
  return {
    doc_type: "passport",
    number: null,
    issuing_country: null,
    issued_on: null,
    expires_on: null,
    first_name: null,
    last_name: null,
    birth_date: null,
    place_of_birth: null,
    nationality: null,
    sex: null,
    authority: null,
    personal_number: null,
    format: null,
    valid: false,
  };
}

export function isoDate(value: string | null | undefined) {
  const text = emptyToNull(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const fr = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!fr) return null;
  return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
}

export function mapSex(value: string | null | undefined): ExtractedIdentity["sex"] {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "m" || v === "male" || v === "homme" || v === "h") return "M";
  if (v === "f" || v === "female" || v === "femme") return "F";
  if (v === "x" || v === "autre" || v === "other") return "X";
  return null;
}

export function mapDocType(value: string | null | undefined): TravelDocType {
  const raw = (value || "").trim().toLowerCase().replace(/['’]/g, " ");
  if (raw.includes("visa")) return "visa";
  if (raw.includes("assur")) return "insurance";
  if (
    raw.includes("id_card") ||
    raw.includes("carte") ||
    raw.includes("cni") ||
    raw.includes("identity") ||
    raw.includes("national id")
  ) {
    return "id_card";
  }
  if (raw && (DOC_TYPES as readonly string[]).includes(raw)) {
    return raw as TravelDocType;
  }
  if (raw && !raw.includes("pass")) return "other";
  return "passport";
}

export function cleanPersonalNumber(value: string | null | undefined) {
  const text = emptyToNull(value)
    ?.replace(/</g, "")
    .replace(/\s+/g, "")
    .trim();
  return text || null;
}

export function fieldScore(identity: ExtractedIdentity) {
  const keys: (keyof ExtractedIdentity)[] = [
    "number",
    "last_name",
    "first_name",
    "birth_date",
    "expires_on",
    "nationality",
  ];
  return keys.reduce((sum, key) => sum + (identity[key] ? 1 : 0), 0);
}

export function identityFromVision(raw: Record<string, unknown>): ExtractedIdentity | null {
  const identity: ExtractedIdentity = {
    doc_type: mapDocType(emptyToNull(raw.doc_type)),
    number: emptyToNull(raw.number)?.replace(/\s/g, "") || null,
    issuing_country:
      resolveCountryCode(String(raw.issuing_country || "")) || emptyToNull(raw.issuing_country),
    issued_on: isoDate(emptyToNull(raw.issued_on)),
    expires_on: isoDate(emptyToNull(raw.expires_on)),
    first_name: emptyToNull(raw.first_name) ? humanizeMrzName(String(raw.first_name)) : null,
    last_name: emptyToNull(raw.last_name) ? humanizeMrzName(String(raw.last_name)) : null,
    birth_date: isoDate(emptyToNull(raw.birth_date)),
    place_of_birth: emptyToNull(raw.place_of_birth),
    nationality: resolveCountryCode(String(raw.nationality || "")) || emptyToNull(raw.nationality),
    sex: mapSex(emptyToNull(raw.sex)),
    authority: emptyToNull(raw.authority),
    personal_number: cleanPersonalNumber(emptyToNull(raw.personal_number)),
    format: null,
    valid: false,
  };
  return fieldScore(identity) >= 2 ? identity : null;
}

function filledEntries(identity: ExtractedIdentity) {
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value != null && value !== "")
  );
}

export function mergePassportIdentities(
  mrz: ExtractedIdentity | null,
  vision: ExtractedIdentity | null
): ExtractedIdentity | null {
  if (!mrz) return vision;
  if (!vision) return mrz;
  const preferMrz = mrz.valid || fieldScore(mrz) >= fieldScore(vision);
  const merged = preferMrz
    ? ({ ...vision, ...filledEntries(mrz) } as ExtractedIdentity)
    : ({ ...mrz, ...filledEntries(vision) } as ExtractedIdentity);
  return {
    ...merged,
    issued_on: vision.issued_on || mrz.issued_on,
    place_of_birth: vision.place_of_birth || mrz.place_of_birth,
    authority: vision.authority || mrz.authority,
    personal_number: mrz.personal_number || vision.personal_number,
    format: mrz.format || vision.format,
    valid: mrz.valid || vision.valid,
  };
}

export function identitySummary(id: ExtractedIdentity) {
  const name = [id.last_name, id.first_name].filter(Boolean).join(" ");
  return [
    name || null,
    id.number ? `n° ${id.number}` : null,
    id.birth_date ? `né(e) ${id.birth_date}` : null,
    id.place_of_birth ? `à ${id.place_of_birth}` : null,
    id.sex,
    id.nationality,
    id.issued_on ? `délivré ${id.issued_on}` : null,
    id.expires_on ? `exp. ${id.expires_on}` : null,
    id.issuing_country,
    id.authority,
    id.personal_number,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function appendPassportForm(
  form: FormData,
  identity: Partial<ExtractedIdentity> | null | undefined,
  applyIdentity = true
) {
  const id = identity || {};
  form.set("doc_type", id.doc_type || "passport");
  form.set("number", id.number || "");
  form.set("issuing_country", id.issuing_country || "");
  form.set("issued_on", id.issued_on || "");
  form.set("expires_on", id.expires_on || "");
  form.set("place_of_birth", id.place_of_birth || "");
  form.set("authority", id.authority || "");
  form.set("personal_number", id.personal_number || "");
  form.set("first_name", id.first_name || "");
  form.set("last_name", id.last_name || "");
  form.set("birth_date", id.birth_date || "");
  form.set("nationality", id.nationality || "");
  form.set("sex", id.sex || "");
  form.set("apply_identity", applyIdentity ? "1" : "0");
  return form;
}
