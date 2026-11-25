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
  return ticketTravelerFaces(details).map((person) => person.name);
}

/** Sous cette largeur de pastilles, quatre noms. La colonne client (~480 px) passe à cinq, le téléphone reste à quatre. */
export const TRAVELER_CHIP_WIDE_AT = 340;
const NARROW_CHIP_COUNT = 4;
const WIDE_CHIP_COUNT = 5;
const DETAIL_MAX = 48;

export type TicketTravelerFace = {
  name: string;
  initials: string;
  /** Siège, voiture ou classe déjà écrits sur cette personne. Rien n’est inventé. */
  detail: string | null;
};

type TravelerDraft = {
  name: string;
  seats: Set<string>;
  coaches: Set<string>;
  classes: Set<string>;
};

function shortDetail(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > DETAIL_MAX) return null;
  return text;
}

function readShort(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = shortDetail(record[key]);
    if (text) return text;
  }
  return null;
}

function onlyValue(values: Set<string>) {
  if (values.size !== 1) return null;
  return [...values][0] || null;
}

function sameShownName(left: string, right: string) {
  return left.localeCompare(right, "fr", { sensitivity: "accent" }) === 0;
}

function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = [...parts[0]][0] || "";
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] || "" : "";
  const letters = `${first}${last}`.toLocaleUpperCase("fr-FR");
  return letters || "?";
}

function coachLabel(coach: string) {
  if (/^voiture\b/i.test(coach)) return coach;
  if (/^\d{1,2}$/.test(coach)) return `voiture ${coach}`;
  return coach;
}

function seatLabel(seat: string) {
  if (/^(place|si[eè]ge)\b/i.test(seat)) return seat;
  if (/^\d{1,4}$/.test(seat)) return `place ${seat}`;
  return seat;
}

function classLabel(value: string) {
  if (/^classe\b/i.test(value)) return value;
  if (/^[A-Za-z]$/.test(value)) return `Classe ${value.toUpperCase()}`;
  return value;
}

function dropShared(people: { seat: string | null; coach: string | null }[], key: "seat" | "coach") {
  const filled = people.filter((person) => person[key]);
  const distinct = new Set(filled.map((person) => person[key]));
  if (filled.length > 1 && distinct.size === 1) {
    for (const person of people) person[key] = null;
  }
}

/**
 * Une pastille par voyageur du billet.
 * Le siège ou la classe n’apparaissent que s’ils sont écrits pour cette personne.
 * Un seul siège recopié sur tout le groupe ne devient pas le siège de chacun.
 * Une personne seule reprend le siège, la voiture ou la classe de la carte.
 */
export function ticketTravelerFaces(details: Record<string, unknown> | null | undefined): TicketTravelerFace[] {
  const rows = details?.passengers;
  if (!Array.isArray(rows)) return [];
  const drafts: TravelerDraft[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const first = String(record.first_name || "").trim();
    const last = String(record.last_name || "").trim();
    if (!first && !last) continue;
    if (isPlaceholderTraveler(first, last)) continue;
    const name = shownPersonName({ first_name: first || null, last_name: last || null });
    if (!name) continue;
    let draft = drafts.find((person) => sameShownName(person.name, name));
    if (!draft) {
      draft = { name, seats: new Set(), coaches: new Set(), classes: new Set() };
      drafts.push(draft);
    }
    const seat = readShort(record, ["seat", "siege", "place"]);
    const coach = readShort(record, ["voiture", "coach"]);
    const classe = readShort(record, ["cabin", "classe", "travel_class"]);
    if (seat) draft.seats.add(seat);
    if (coach) draft.coaches.add(coach);
    if (classe) draft.classes.add(classe);
  }
  const card = details || {};
  const people = drafts.map((draft) => ({
    name: draft.name,
    seat: onlyValue(draft.seats),
    coach: onlyValue(draft.coaches),
    classe: onlyValue(draft.classes),
  }));
  if (people.length === 1) {
    const person = people[0];
    person.seat = person.seat || readShort(card, ["seat", "siege", "place"]);
    person.coach = person.coach || readShort(card, ["voiture", "coach"]);
    person.classe = person.classe || readShort(card, ["cabin", "classe", "travel_class"]);
  } else if (people.length > 1) {
    dropShared(people, "seat");
    if (!people.some((person) => person.seat)) dropShared(people, "coach");
  }
  return people.map((person) => {
    const place = [person.coach ? coachLabel(person.coach) : "", person.seat ? seatLabel(person.seat) : ""]
      .filter(Boolean)
      .join(" · ");
    const detail = [place, person.classe ? classLabel(person.classe) : ""].filter(Boolean).join(" · ");
    return { name: person.name, initials: initialsOf(person.name), detail: detail || null };
  });
}

/** Quatre pastilles sur une carte étroite, cinq dès que la ligne a la place. */
export function travelerChipLimit(width: number) {
  if (!Number.isFinite(width) || width < TRAVELER_CHIP_WIDE_AT) return NARROW_CHIP_COUNT;
  return WIDE_CHIP_COUNT;
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
