import { shownPersonName } from "./identity";
import type { BookingExtract } from "./ingest-types";
import {
  firstNamesMatch,
  foldName,
  isDerivedOccupancyTraveler,
  isPlaceholderTraveler,
  parseGuestLabel,
  sameRecordedTraveler,
  type PersonName,
} from "./person-match";

/** Noms saisis ou extraits : le prénom peut être absent du schéma souple. */
type LoosePerson = {
  first_name?: string | null;
  last_name?: string | null;
};

function asPerson(row: LoosePerson): PersonName {
  return {
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
  };
}

export function passengersFromDetails(
  details: Record<string, unknown> | null | undefined
): PersonName[] {
  const rows = details?.passengers;
  if (!Array.isArray(rows)) return [];
  const people: PersonName[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { first_name?: unknown; last_name?: unknown };
    const first = String(record.first_name || "").trim();
    const last = String(record.last_name || "").trim();
    if (!first && !last) continue;
    if (isPlaceholderTraveler(first, last)) continue;
    people.push({ first_name: first || null, last_name: last || null });
  }
  return people;
}

/** Noms des voyageurs d’un billet (vol ou train), dans l’ordre enregistré. */
export function ticketTravelerNames(details: Record<string, unknown> | null | undefined) {
  const names: string[] = [];
  for (const person of passengersFromDetails(details)) {
    const line = shownPersonName(person);
    if (!line || names.some((row) => row.localeCompare(line, "fr", { sensitivity: "accent" }) === 0)) continue;
    names.push(line);
  }
  return names;
}

/** Cases du foyer déjà cochées pour ce billet. */
export function ticketPartyKeys(
  details: Record<string, unknown> | null | undefined,
  household: { key: string; first_name?: string | null; last_name?: string | null }[]
) {
  const stored = Array.isArray(details?.party_keys)
    ? details.party_keys.map((key) => String(key || "")).filter((key) => household.some((member) => member.key === key))
    : [];
  if (stored.length) return stored;
  const keys: string[] = [];
  for (const person of passengersFromDetails(details)) {
    const hit = household.find((member) =>
      sameRecordedTraveler(
        { first_name: member.first_name ?? null, last_name: member.last_name ?? null },
        person
      )
    );
    if (hit && !keys.includes(hit.key)) keys.push(hit.key);
  }
  return keys;
}

export function uniquePeople(people: LoosePerson[]): PersonName[] {
  const out: PersonName[] = [];
  for (const raw of people) {
    const person = asPerson(raw);
    if (!person.first_name && !person.last_name) continue;
    if (out.some((row) => sameRecordedTraveler(row, person))) continue;
    out.push(person);
  }
  return out;
}

/** Passagers déjà lus, absents du séjour : on peut les ajouter sans passer par le foyer. */
export function peopleNotOnStay(candidates: LoosePerson[], stay: LoosePerson[]): PersonName[] {
  const onStay = stay.map(asPerson);
  return uniquePeople(candidates).filter(
    (person) => !onStay.some((row) => sameRecordedTraveler(row, person))
  );
}

/** Segment de `rooms[].guests`. Un libellé d’occupation ne devient pas une personne. */
export function guestPerson(value: string): PersonName | null {
  return parseGuestLabel(value);
}

function guestLines(value: unknown): string[] {
  if (typeof value === "string") return value.split(/[,;]/);
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") lines.push(...entry.split(/[,;]/));
  }
  return lines;
}

/** Noms imprimés sur le billet ou la confirmation. Les autres compagnons de la fiche n’y entrent pas. */
export function printedStayTravelers(extract: Pick<BookingExtract, "items">) {
  const people: PersonName[] = [];
  const push = (first?: string | null, last?: string | null) => {
    const person = { first_name: (first || "").trim() || null, last_name: (last || "").trim() || null };
    if (!person.first_name && !person.last_name) return;
    if (isPlaceholderTraveler(person.first_name, person.last_name)) return;
    if (people.some((row) => sameRecordedTraveler(row, person))) return;
    people.push(person);
  };
  const pushLines = (lines: string[]) => {
    for (const line of lines) {
      const person = guestPerson(line);
      if (person) push(person.first_name, person.last_name);
    }
  };
  for (const item of extract.items || []) {
    const details = (item.details || {}) as Record<string, unknown>;
    for (const person of passengersFromDetails(details)) {
      push(person.first_name, person.last_name);
    }
    pushLines(guestLines(details.guest_names));
    const rooms = Array.isArray(details.rooms) ? details.rooms : [];
    for (const room of rooms) {
      if (!room || typeof room !== "object") continue;
      const record = room as { guests?: unknown; guest_name?: unknown; guest_names?: unknown };
      const named = [...guestLines(record.guest_names), ...guestLines(record.guest_name)];
      pushLines(named.length ? named : guestLines(record.guests));
    }
  }
  return people;
}

export type StayTravelerRow = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  companion_id?: string | null;
  is_account_holder?: boolean | null;
};

function compactLast(value: string | null | undefined) {
  return foldName(value).replace(/ /g, "");
}

/** L’initiale « D » cède la place à « Boukris » sur la même personne. Un nom court (« Li ») reste. */
function preferIncomingName(existing: StayTravelerRow, incoming: StayTravelerRow) {
  const prev = compactLast(existing.last_name);
  const next = compactLast(incoming.last_name);
  if (prev.length !== 1 || next.length <= 1) return false;
  return firstNamesMatch(existing.first_name, incoming.first_name);
}

export type TravelerInsertPlan =
  | { action: "skip" }
  | { action: "insert" }
  | { action: "reuse"; id: string; first_name: string | null; last_name: string | null };

/**
 * Un libellé d’occupation n’est pas inséré.
 * Un compagnon ou le titulaire déjà sur le dossier est réutilisé.
 */
export function planTravelerInsert(existing: StayTravelerRow[], incoming: StayTravelerRow): TravelerInsertPlan {
  const first = (incoming.first_name || "").trim() || null;
  const last = (incoming.last_name || "").trim() || null;
  if (!first && !last) return { action: "skip" };
  if (isDerivedOccupancyTraveler(first, last)) return { action: "skip" };
  const person = { first_name: first, last_name: last };
  const linked =
    (incoming.companion_id
      ? existing.find((row) => row.companion_id && row.companion_id === incoming.companion_id)
      : undefined) ||
    (incoming.is_account_holder ? existing.find((row) => row.is_account_holder) : undefined);
  if (linked) {
    if (linked.id && preferIncomingName(linked, person)) {
      return { action: "reuse", id: linked.id, first_name: first, last_name: last };
    }
    return { action: "skip" };
  }
  if (existing.some((row) => sameRecordedTraveler(row, person))) return { action: "skip" };
  return { action: "insert" };
}
