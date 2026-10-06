import {
  isPlaceholderTraveler,
  sameRecordedTraveler,
  type PersonName,
} from "./person-match";

function personLine(person: PersonName) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

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
    const line = personLine(person);
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
