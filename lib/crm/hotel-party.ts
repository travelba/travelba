import { guestNameOk } from "./hotel-journey";
import { shownPersonName } from "./identity";

export type NamedPerson = {
  first_name?: string | null;
  last_name?: string | null;
  usage_name?: string | null;
};

export function travelerDisplayName(person: NamedPerson) {
  const last = (person.usage_name || person.last_name || "").trim();
  return shownPersonName({ first_name: person.first_name, last_name: last || null });
}

/** Proches et anciens voyageurs, sans le client, sans doublon. */
export function knownTravelerNames(self: string, people: NamedPerson[]) {
  const seen = new Set<string>();
  const skip = self.trim().toLocaleLowerCase("fr");
  if (skip) seen.add(skip);
  const names: string[] = [];
  for (const person of people) {
    const name = travelerDisplayName(person);
    if (!guestNameOk(name)) continue;
    const key = name.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 24) break;
  }
  return names;
}

export function roomOccupancyLabel(room: { adults: number; children: { age: number }[] }) {
  const adults = room.adults > 1 ? `${room.adults} adultes` : "1 adulte";
  const ages = room.children.map((child) => child.age).filter((age) => Number.isInteger(age) && age >= 0 && age < 18);
  if (!ages.length) return adults;
  return `${adults}, ${childPhrase(ages)}`;
}

function childPhrase(ages: number[]) {
  const count = ages.length;
  const word = count > 1 ? `${count} enfants` : "1 enfant";
  if (ages.every((age) => age > 0)) {
    if (count === 1) return `${word} de ${ages[0]} ans`;
    const last = ages[count - 1];
    const head = ages.slice(0, -1).join(", ");
    return `${word} de ${head} et ${last} ans`;
  }
  const bits = ages.map((age) => (age === 0 ? "moins d’un an" : `${age} ans`));
  const last = bits[bits.length - 1];
  const head = bits.slice(0, -1).join(", ");
  return count === 1 ? `${word} de ${last}` : `${word}, ${head} et ${last}`;
}

/** Un nom principal par chambre. Les autres occupants suivent, sur la même ligne. */
export function composeRoomGuests(principal: string, others: string[]) {
  return [principal, ...others.map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean)].join(", ");
}
