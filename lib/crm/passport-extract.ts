import { resolveNationality } from "./countries";
import {
  completeGivenNames,
  emptyToNull,
  humanizeMrzName,
  normalizeGivenNames,
  type ExtractedIdentity,
} from "./identity";
import { foldName, lastNamesMatch, nameTokens, namesReferToSamePerson } from "./person-match";
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
    usage_name: null,
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

function tidyName(value: string | null | undefined) {
  const text = emptyToNull(value);
  return text ? humanizeMrzName(text) : null;
}

/** « DUPONT épouse MARTIN » = naissance DUPONT, épouse MARTIN. « MARTIN née DUPONT » = l’inverse. */
export function parseSpouseLine(value: string | null | undefined): {
  birth: string | null;
  usage: string | null;
} | null {
  const text = emptyToNull(value);
  if (!text) return null;
  const leading = text.match(/^(?:nom d['’]usage|épouse|epouse|ép\.|ep\.)\s*[:\s]\s*(.+)$/i);
  if (leading) return { birth: null, usage: tidyName(leading[1]) };
  const married = text.match(/^(.+?)\s+(?:épouse|epouse|ép\.|ep\.)\s+(.+)$/i);
  if (married) return { birth: tidyName(married[1]), usage: tidyName(married[2]) };
  const born = text.match(/^(.+?)\s+(?:née|nee)\s+(.+)$/i);
  if (born) return { birth: tidyName(born[2]), usage: tidyName(born[1]) };
  return null;
}

/**
 * Le nom de naissance reste le nom. Le nom d’épouse / d’usage est enregistré à part.
 * La MRZ ne contient que le nom de naissance : s’il diffère du nom imprimé, l’autre est le nom d’épouse.
 */
export function spouseFamilyNames(input: {
  birthName?: string | null;
  printedName?: string | null;
  usageName?: string | null;
}): { last_name: string | null; usage_name: string | null } {
  const fromBirth = parseSpouseLine(input.birthName);
  const fromPrinted = parseSpouseLine(input.printedName);
  const fromUsage = parseSpouseLine(input.usageName);
  const birth = fromBirth?.birth || fromPrinted?.birth || tidyName(input.birthName);
  const explicitUsage = fromUsage?.usage || fromPrinted?.usage || fromBirth?.usage || tidyName(input.usageName);
  const printedPlain = fromPrinted ? null : tidyName(input.printedName);
  let usage = explicitUsage;
  if (!usage && printedPlain && birth && !lastNamesMatch(printedPlain, birth)) usage = printedPlain;
  const last = birth || printedPlain || tidyName(input.printedName);
  if (usage && last && lastNamesMatch(usage, last)) usage = null;
  return { last_name: last, usage_name: usage };
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
    issuing_country: resolveNationality(emptyToNull(raw.issuing_country)),
    issued_on: isoDate(emptyToNull(raw.issued_on)),
    expires_on: isoDate(emptyToNull(raw.expires_on)),
    first_name: normalizeGivenNames(emptyToNull(raw.first_name)),
    ...spouseFamilyNames({
      birthName: emptyToNull(raw.last_name),
      printedName: emptyToNull(raw.last_name),
      usageName: emptyToNull(raw.usage_name),
    }),
    birth_date: isoDate(emptyToNull(raw.birth_date)),
    place_of_birth: emptyToNull(raw.place_of_birth),
    nationality: resolveNationality(
      emptyToNull(raw.nationality),
      emptyToNull(raw.issuing_country)
    ),
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

export function passportNumberKey(value: string | null | undefined) {
  return (value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function identityPersonKey(identity: ExtractedIdentity) {
  const number = passportNumberKey(identity.number);
  if (number) return `n:${number}`;
  const last = foldName(identity.last_name);
  const first = nameTokens(identity.first_name).join(" ");
  const birth = identity.birth_date || "";
  if (last && first) return `p:${last}|${first}|${birth}`;
  return "";
}

export function passportsReferToSame(a: ExtractedIdentity, b: ExtractedIdentity) {
  const left = passportNumberKey(a.number);
  const right = passportNumberKey(b.number);
  if (left && right) return left === right;
  return namesReferToSamePerson(a, b);
}

export function uniquePassports(identities: ExtractedIdentity[]): ExtractedIdentity[] {
  const best = new Map<string, ExtractedIdentity>();
  const extras: ExtractedIdentity[] = [];
  for (const identity of identities) {
    const key = identityPersonKey(identity);
    if (!key) {
      extras.push(identity);
      continue;
    }
    const prev = best.get(key);
    const nextScore = fieldScore(identity) + (identity.valid ? 2 : 0);
    const prevScore = prev ? fieldScore(prev) + (prev.valid ? 2 : 0) : -1;
    if (!prev || nextScore > prevScore) best.set(key, identity);
  }
  return [...best.values(), ...extras];
}

function compactEditDistance(left: string, right: string) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 2) return 99;
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

function numbersLookLikeSameDocument(a: string | null | undefined, b: string | null | undefined) {
  const left = passportNumberKey(a);
  const right = passportNumberKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 8 || right.length < 8) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  return compactEditDistance(left, right) <= 2;
}

export function hasPersonName(identity: ExtractedIdentity) {
  return Boolean((identity.first_name || "").trim() && (identity.last_name || "").trim());
}

function identityQuality(identity: ExtractedIdentity) {
  const typeBoost = identity.doc_type === "passport" ? 4 : identity.doc_type === "id_card" ? 1 : 0;
  return (
    fieldScore(identity) +
    (identity.valid ? 2 : 0) +
    typeBoost +
    (identity.first_name ? 2 : 0)
  );
}

function identitiesAreSamePerson(a: ExtractedIdentity, b: ExtractedIdentity) {
  if (passportsReferToSame(a, b)) return true;
  if (namesReferToSamePerson(a, b)) return true;
  if (!numbersLookLikeSameDocument(a.number, b.number)) return false;
  if (hasPersonName(a) && hasPersonName(b)) return namesReferToSamePerson(a, b);
  if (a.last_name && b.last_name && !lastNamesMatch(a.last_name, b.last_name)) return false;
  return true;
}

/** Une personne par passeport : prénom + nom, sans doublon OCR ni carte au nom seul. */
export function distinctPassportPeople(identities: ExtractedIdentity[]): ExtractedIdentity[] {
  const unique = uniquePassports(identities.filter(Boolean));
  const groups: ExtractedIdentity[][] = [];
  for (const identity of unique) {
    const group = groups.find((members) =>
      members.some((member) => identitiesAreSamePerson(member, identity))
    );
    if (group) group.push(identity);
    else groups.push([identity]);
  }
  const best = groups.map((group) =>
    group.reduce((winner, identity) =>
      identityQuality(identity) > identityQuality(winner) ? identity : winner
    )
  );
  const named = best.filter(hasPersonName);
  return named.length ? named : best;
}

export function listedIdentities(
  identity: ExtractedIdentity | null | undefined,
  identities?: ExtractedIdentity[] | null
): ExtractedIdentity[] {
  const raw = identities && identities.length ? identities.filter(Boolean) : identity ? [identity] : [];
  const people = distinctPassportPeople(raw);
  return people.length ? people : raw;
}

export function identitiesFromUnknown(raw: unknown): ExtractedIdentity[] {
  if (!Array.isArray(raw)) return [];
  return distinctPassportPeople(
    raw
      .map((item) =>
        item && typeof item === "object" ? identityFromVision(item as Record<string, unknown>) : null
      )
      .filter((identity): identity is ExtractedIdentity => Boolean(identity))
  );
}

export function identitiesFromForm(form: FormData): ExtractedIdentity[] {
  const raw = form.get("identities");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return identitiesFromUnknown(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function mergePassportSets(
  mrzList: ExtractedIdentity[],
  visionList: ExtractedIdentity[]
): ExtractedIdentity[] {
  const unused = [...visionList];
  const merged: ExtractedIdentity[] = [];
  for (const mrz of mrzList) {
    const idx = unused.findIndex((vision) => passportsReferToSame(mrz, vision));
    const vision = idx >= 0 ? unused.splice(idx, 1)[0] : null;
    const identity = mergePassportIdentities(mrz, vision);
    if (identity) merged.push(identity);
  }
  merged.push(...unused);
  return uniquePassports(merged);
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
  const names = spouseFamilyNames({
    birthName: mrz.last_name,
    printedName: vision.last_name,
    usageName: vision.usage_name,
  });
  return {
    ...merged,
    last_name: names.last_name,
    usage_name: names.usage_name,
    first_name: completeGivenNames(mrz.first_name, vision.first_name),
    nationality: resolveNationality(merged.nationality, merged.issuing_country),
    issuing_country: resolveNationality(merged.issuing_country),
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
    id.usage_name ? `ép. ${id.usage_name}` : null,
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
  form.set("usage_name", id.usage_name || "");
  form.set("birth_date", id.birth_date || "");
  form.set("nationality", id.nationality || "");
  form.set("sex", id.sex || "");
  form.set("apply_identity", applyIdentity ? "1" : "0");
  return form;
}

export function appendPassportImportForm(
  form: FormData,
  opts: {
    identities: ExtractedIdentity[];
    file?: File | null;
    customerId?: string;
    companionId?: string | null;
    applyIdentity?: boolean;
    createUnmatchedOnly?: boolean;
  }
) {
  if (opts.customerId) form.set("customer_id", opts.customerId);
  if (opts.companionId) form.set("companion_id", opts.companionId);
  if (opts.file) form.set("file", opts.file);
  form.set("identities", JSON.stringify(opts.identities));
  form.set("import_party", opts.createUnmatchedOnly ? "new" : "1");
  appendPassportForm(form, opts.identities[0], opts.applyIdentity !== false);
  return form;
}
