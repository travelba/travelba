import { shownPersonName } from "./identity";
import type { BookingExtract } from "./ingest-types";
import {
  isPlaceholderTraveler,
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

function guestPerson(value: string): PersonName | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  if (/^(adulte|adultes|child|children|guest|guests)$/i.test(parts[0] || "")) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] || null };
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
  for (const item of extract.items || []) {
    for (const person of passengersFromDetails(item.details as Record<string, unknown>)) {
      push(person.first_name, person.last_name);
    }
    const rooms = Array.isArray(item.details?.rooms) ? item.details.rooms : [];
    for (const room of rooms) {
      const guests = room && typeof room === "object" ? String((room as { guests?: unknown }).guests || "") : "";
      for (const name of guests.split(/[,;]/)) {
        const person = guestPerson(name);
        if (person) push(person.first_name, person.last_name);
      }
    }
  }
  return people;
}
