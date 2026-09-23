import { isPlaceholderTraveler, matchTravelerToParty, type PartyMatch } from "./person-match";
import type { CrmCompanion, CrmCustomer } from "./types";

export type HouseholdMember = {
  key: string;
  first_name: string;
  last_name: string;
  companion_id: string | null;
  is_account_holder: boolean;
  birth_date: string | null;
  label: string;
};

export type LinkedTraveler = {
  first_name?: string | null;
  last_name?: string | null;
  companion_id?: string | null;
  is_account_holder?: boolean | null;
};

export function holderKey() {
  return "holder";
}

export function companionKey(id: string) {
  return `companion:${id}`;
}

export function partyKeyFromMatch(match: PartyMatch) {
  return match.kind === "holder" ? holderKey() : companionKey(match.id);
}

export function personLabel(first: string | null | undefined, last: string | null | undefined) {
  return [first, last].filter(Boolean).join(" ").trim();
}

export function householdMembers(
  holder: Pick<CrmCustomer, "first_name" | "last_name"> & { birth_date?: string | null },
  companions: Pick<CrmCompanion, "id" | "first_name" | "last_name" | "birth_date">[]
): HouseholdMember[] {
  const holderName = personLabel(holder.first_name, holder.last_name) || "Titulaire";
  const people: HouseholdMember[] = [
    {
      key: holderKey(),
      first_name: holder.first_name,
      last_name: holder.last_name,
      companion_id: null,
      is_account_holder: true,
      birth_date: holder.birth_date || null,
      label: `${holderName} (titulaire)`,
    },
  ];
  for (const companion of companions) {
    people.push({
      key: companionKey(companion.id),
      first_name: companion.first_name,
      last_name: companion.last_name,
      companion_id: companion.id,
      is_account_holder: false,
      birth_date: companion.birth_date,
      label: personLabel(companion.first_name, companion.last_name) || "Voyageur",
    });
  }
  return people;
}

export function memberByKey(members: HouseholdMember[], key: string | null | undefined) {
  return members.find((row) => row.key === key) || null;
}

export function travelerIsLinked(traveler: LinkedTraveler) {
  if (traveler.is_account_holder) return true;
  return Boolean(traveler.companion_id);
}

export function travelerNeedsHousehold(traveler: LinkedTraveler) {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return false;
  const named = Boolean(
    (traveler.first_name || "").trim() || (traveler.last_name || "").trim()
  );
  return named && !travelerIsLinked(traveler);
}

export function attachTravelerToHousehold(
  traveler: LinkedTraveler,
  holder: { first_name: string | null; last_name: string | null },
  companions: (Pick<CrmCompanion, "id" | "first_name" | "last_name">)[]
): LinkedTraveler {
  if (travelerIsLinked(traveler) || isPlaceholderTraveler(traveler.first_name, traveler.last_name)) {
    return traveler;
  }
  const match = matchTravelerToParty(
    { first_name: traveler.first_name ?? null, last_name: traveler.last_name ?? null },
    holder,
    companions
  );
  if (!match) return traveler;
  if (match.kind === "holder") {
    return {
      ...traveler,
      is_account_holder: true,
      companion_id: null,
      first_name: traveler.first_name || holder.first_name,
      last_name: traveler.last_name || holder.last_name,
    };
  }
  const companion = companions.find((row) => row.id === match.id);
  return {
    ...traveler,
    is_account_holder: false,
    companion_id: match.id,
    first_name: traveler.first_name || companion?.first_name || null,
    last_name: traveler.last_name || companion?.last_name || null,
  };
}

export function linkExtractTravelers<T extends LinkedTraveler>(
  travelers: T[],
  holder: { first_name: string | null; last_name: string | null },
  companions: (Pick<CrmCompanion, "id" | "first_name" | "last_name">)[]
): T[] {
  return travelers.map((traveler) => attachTravelerToHousehold(traveler, holder, companions) as T);
}

export function guestsLabelFromKeys(keys: string[], members: HouseholdMember[]) {
  return keys
    .map((key) => {
      const member = memberByKey(members, key);
      return member ? personLabel(member.first_name, member.last_name) : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function roomPartyKeys(room: { party_keys?: unknown }) {
  return Array.isArray(room.party_keys)
    ? room.party_keys.map((key) => String(key || "")).filter(Boolean)
    : [];
}

export function applyRoomGuestLabels<T extends { guests?: string | null; party_keys?: string[] }>(
  rooms: T[],
  members: HouseholdMember[]
): T[] {
  return rooms.map((room) => {
    const keys = roomPartyKeys(room);
    const guests = guestsLabelFromKeys(keys, members);
    return guests ? { ...room, guests } : room;
  });
}

export function memberFromTravelerLink(
  traveler: LinkedTraveler,
  members: HouseholdMember[]
) {
  if (traveler.is_account_holder) return members.find((row) => row.is_account_holder) || null;
  if (traveler.companion_id) {
    return members.find((row) => row.companion_id === traveler.companion_id) || null;
  }
  return null;
}
