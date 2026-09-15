import type { MtripGuidePassenger } from "./guide-types";
import {
  normalizeIso3,
  normalizeSex,
  passengerCompleteness,
} from "./passenger-schema";

export type ImportedPassengerDraft = Omit<
  MtripGuidePassenger,
  "id" | "email" | "phone" | "role"
> & {
  email?: string | null;
  phone?: string | null;
  role?: MtripGuidePassenger["role"];
};

export type MergeImportResult = {
  passengers: MtripGuidePassenger[];
  added: number;
  updated: number;
  skipped: number;
};

function normPassport(n?: string | null) {
  return (n || "").replace(/\s/g, "").toUpperCase();
}

function passengerMatchKey(p: {
  passport_number?: string | null;
  last_name?: string;
  first_name?: string;
  birth_date?: string | null;
}) {
  const pn = normPassport(p.passport_number);
  if (pn.length >= 6) return `pn:${pn}`;
  const name = `${(p.last_name || "").trim()}|${(p.first_name || "").trim()}|${p.birth_date || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `name:${name}`;
}

function fieldScore(p: Partial<MtripGuidePassenger>) {
  return passengerCompleteness(p).score;
}

/** Fill travel fields; prefer incoming when existing is empty or incoming is richer. */
function mergeRecords(
  existing: MtripGuidePassenger,
  incoming: ImportedPassengerDraft
): MtripGuidePassenger {
  const travelKeys = [
    "first_name",
    "last_name",
    "middle_names",
    "passport_number",
    "nationality",
    "issuing_country",
    "birth_date",
    "birth_place",
    "passport_expiry",
    "passport_issued_date",
    "sex",
    "language",
    "source_file",
    "attachment_path",
    "import_warnings",
  ] as const;

  const merged: MtripGuidePassenger = { ...existing };

  for (const key of travelKeys) {
    const cur = existing[key];
    const next = incoming[key as keyof ImportedPassengerDraft];
    if (next == null || next === "") continue;
    if (cur == null || cur === "" || String(cur).trim().length < String(next).trim().length) {
      (merged as Record<string, unknown>)[key] = next;
    }
  }

  merged.sex = normalizeSex(merged.sex) || merged.sex;
  merged.nationality = normalizeIso3(merged.nationality) || merged.nationality;
  merged.issuing_country =
    normalizeIso3(merged.issuing_country) || merged.issuing_country;

  const { complete, missing } = passengerCompleteness(merged);
  merged.import_status = complete
    ? "complete"
    : missing.length <= 2
      ? "review"
      : "review";

  if (incoming.import_warnings?.length) {
    merged.import_warnings = [
      ...new Set([
        ...(merged.import_warnings || []),
        ...incoming.import_warnings,
      ]),
    ];
  }

  return merged;
}

function draftToPassenger(
  draft: ImportedPassengerDraft,
  role: MtripGuidePassenger["role"]
): MtripGuidePassenger {
  const { complete } = passengerCompleteness(draft);
  return {
    id: crypto.randomUUID(),
    first_name: draft.first_name,
    last_name: draft.last_name,
    middle_names: draft.middle_names ?? null,
    email: draft.email ?? null,
    phone: draft.phone ?? null,
    role,
    language: draft.language || "fr",
    passport_number: draft.passport_number ?? null,
    nationality: normalizeIso3(draft.nationality) ?? draft.nationality ?? null,
    issuing_country:
      normalizeIso3(draft.issuing_country) ?? draft.issuing_country ?? null,
    birth_date: draft.birth_date ?? null,
    birth_place: draft.birth_place ?? null,
    passport_expiry: draft.passport_expiry ?? null,
    passport_issued_date: draft.passport_issued_date ?? null,
    sex: normalizeSex(draft.sex) ?? draft.sex ?? null,
    source_file: draft.source_file ?? null,
    attachment_path: draft.attachment_path ?? null,
    import_status: complete ? "complete" : "review",
    import_warnings: draft.import_warnings ?? [],
  };
}

/**
 * Merge imported passengers into existing list.
 * - Never removes existing passengers
 * - Matches by passport number, then name + birth date
 * - Preserves id, email, phone, role on existing records
 */
export function mergeImportedPassengers(
  existing: MtripGuidePassenger[],
  imported: ImportedPassengerDraft[]
): MergeImportResult {
  const list = existing.map((p) => ({ ...p }));
  const indexByKey = new Map<string, number>();
  list.forEach((p, i) => indexByKey.set(passengerMatchKey(p), i));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const draft of imported) {
    if (!draft.first_name?.trim() && !draft.last_name?.trim()) {
      skipped++;
      continue;
    }

    const key = passengerMatchKey(draft);
    const idx = indexByKey.get(key);

    if (idx !== undefined) {
      const before = fieldScore(list[idx]);
      list[idx] = mergeRecords(list[idx], draft);
      if (fieldScore(list[idx]) > before) updated++;
      else skipped++;
      continue;
    }

    // Fuzzy: same passport number only
    const pn = normPassport(draft.passport_number);
    let found = -1;
    if (pn) {
      found = list.findIndex((p) => normPassport(p.passport_number) === pn);
    }

    if (found >= 0) {
      list[found] = mergeRecords(list[found], draft);
      indexByKey.set(passengerMatchKey(list[found]), found);
      updated++;
      continue;
    }

    const role: MtripGuidePassenger["role"] =
      list.length === 0 ? "lead_traveler" : "traveler";
    const passenger = draftToPassenger(draft, role);
    indexByKey.set(passengerMatchKey(passenger), list.length);
    list.push(passenger);
    added++;
  }

  // Ensure first passenger is lead if none set
  if (list.length && !list.some((p) => p.role === "lead_traveler")) {
    list[0] = { ...list[0], role: "lead_traveler" };
  }

  return { passengers: list, added, updated, skipped };
}
