import { parse } from "mrz";
import { resolveNationality } from "./countries";
import { humanizeMrzName, normalizeGivenNames, type ExtractedIdentity } from "./identity";
import type { TravelDocType } from "./types";

function fit(line: string, length: number) {
  if (line.length === length) return line;
  if (line.length > length) return line.slice(0, length);
  return line.padEnd(length, "<");
}

function cleanOcrText(text: string) {
  return text
    .toUpperCase()
    .replace(/[«»‹›〈〉≤≥]/g, "<")
    .replace(/[\u00A0]/g, " ");
}

function mrzishLines(text: string) {
  return cleanOcrText(text)
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/[^A-Z0-9<]/g, "").replace(/L{3,}/g, (chunk) => "<".repeat(chunk.length))
    )
    .filter((line) => line.length >= 20);
}

function mrzDateToIso(value: string | null | undefined, kind: "birth" | "expiry") {
  if (!value || !/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  const dd = Number(value.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const now = new Date().getFullYear();
  let year = 2000 + yy;
  if (kind === "birth") {
    if (year > now) year -= 100;
  } else if (year < now - 20) {
    year += 100;
  }
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function mapSex(value: string | null | undefined): ExtractedIdentity["sex"] {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "m" || v === "male" || v === "homme") return "M";
  if (v === "f" || v === "female" || v === "femme") return "F";
  return "X";
}

function mapDocType(format: string | undefined, documentCode: string | null): TravelDocType {
  const code = (documentCode || "").toUpperCase();
  if (format === "TD3" || code.startsWith("P")) return "passport";
  return "id_card";
}

function toIdentity(result: ReturnType<typeof parse>): ExtractedIdentity {
  const fields = result.fields;
  const personal = fields.personalNumber || fields.optional || fields.optional1 || null;
  return {
    doc_type: mapDocType(result.format, fields.documentCode || null),
    number: result.documentNumber || fields.documentNumber || null,
    issuing_country: resolveNationality(fields.issuingState || null),
    issued_on: mrzDateToIso(fields.issueDate, "expiry"),
    expires_on: mrzDateToIso(fields.expirationDate, "expiry"),
    first_name: fields.firstName ? normalizeGivenNames(fields.firstName) : null,
    last_name: fields.lastName ? humanizeMrzName(fields.lastName) : null,
    birth_date: mrzDateToIso(fields.birthDate, "birth"),
    place_of_birth: null,
    nationality: resolveNationality(fields.nationality, fields.issuingState),
    sex: mapSex(fields.sex),
    authority: null,
    personal_number: personal ? String(personal).replace(/</g, "").trim() || null : null,
    format: result.format,
    valid: result.valid,
  };
}

function score(identity: ExtractedIdentity) {
  const keys: (keyof ExtractedIdentity)[] = [
    "number",
    "last_name",
    "first_name",
    "birth_date",
    "expires_on",
    "nationality",
  ];
  return keys.reduce((sum, key) => sum + (identity[key] ? 1 : 0), 0) + (identity.valid ? 2 : 0);
}

function tryParse(lines: string[]) {
  try {
    return toIdentity(parse(lines, { autocorrect: true }));
  } catch {
    return null;
  }
}

function candidateGroups(lines: string[]) {
  const groups: string[][] = [];
  const lengths = [44, 36, 30] as const;

  for (let i = 0; i < lines.length; i++) {
    for (const len of lengths) {
      const two = [fit(lines[i], len), fit(lines[i + 1] || "", len)];
      if (lines[i + 1]) groups.push(two);
      if (lines[i + 2]) {
        groups.push([fit(lines[i], len), fit(lines[i + 1], len), fit(lines[i + 2], len)]);
      }
    }
  }

  const joined = lines.join("");
  if (joined.length >= 88) groups.push([joined.slice(0, 44), joined.slice(44, 88)]);
  if (joined.length >= 90) {
    groups.push([joined.slice(0, 30), joined.slice(30, 60), joined.slice(60, 90)]);
  }
  return groups;
}

function identityKey(identity: ExtractedIdentity) {
  const number = (identity.number || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (number) return `n:${number}`;
  const last = (identity.last_name || "").trim().toLowerCase();
  const first = (identity.first_name || "").trim().toLowerCase();
  const birth = identity.birth_date || "";
  if (last && first) return `p:${last}|${first}|${birth}`;
  return "";
}

function plausibleIdentity(identity: ExtractedIdentity) {
  const number = (identity.number || "").trim();
  if (number && /\s/.test(number)) return false;
  if (/^P\s/i.test(identity.last_name || "")) return false;
  return true;
}

function keepBest(identities: ExtractedIdentity[]) {
  const best = new Map<string, { identity: ExtractedIdentity; score: number }>();
  const extras: { identity: ExtractedIdentity; score: number }[] = [];
  for (const identity of identities) {
    if (!plausibleIdentity(identity)) continue;
    const next = score(identity);
    if (next < 3) continue;
    const key = identityKey(identity);
    if (!key) {
      extras.push({ identity, score: next });
      continue;
    }
    const prev = best.get(key);
    if (!prev || next > prev.score) best.set(key, { identity, score: next });
  }
  return [...best.values(), ...extras]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.identity);
}

export function parseMrzFromOcrAll(text: string): ExtractedIdentity[] {
  const lines = mrzishLines(text);
  if (lines.length === 0) return [];

  const found: ExtractedIdentity[] = [];
  for (const identity of [
    tryParse(lines.slice(-3)),
    tryParse(lines.slice(-2)),
    ...candidateGroups(lines).map((group) => tryParse(group)),
  ]) {
    if (identity) found.push(identity);
  }
  return keepBest(found);
}

export function parseMrzFromOcr(text: string): ExtractedIdentity | null {
  return parseMrzFromOcrAll(text)[0] || null;
}
