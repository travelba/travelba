import { isSandboxOrderSuffix, type SandboxOrderSuffix } from "./catalog";

export const RATEHAWK_LIMITS = {
  maxRooms: 9,
  maxAdultsPerRoom: 6,
  maxChildrenPerRoom: 4,
  maxChildAge: 17,
  maxNights: 30,
  maxCheckinDays: 730,
  maxHids: 300,
} as const;

export type RoomGuests = {
  adults: number;
  children: number[];
};

export type StayQuery = {
  checkin: string;
  checkout: string;
  residency: string;
  guests: RoomGuests[];
  hids?: number[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function nightsBetween(checkin: string, checkout: string): number | null {
  const start = parseIsoDate(checkin);
  const end = parseIsoDate(checkout);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function normalizeResidency(value: string | null | undefined): string | null {
  const code = (value || "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

export function validateStay(input: StayQuery, today: Date = new Date()): string | null {
  const residency = normalizeResidency(input.residency);
  if (!residency) return "La nationalité (résidence du passeport) est obligatoire.";
  const nights = nightsBetween(input.checkin, input.checkout);
  if (nights == null) return "Les dates ne sont pas valides.";
  if (nights < 1) return "Le départ doit être après l’arrivée.";
  if (nights > RATEHAWK_LIMITS.maxNights) return `Le séjour est limité à ${RATEHAWK_LIMITS.maxNights} nuits.`;
  const start = parseIsoDate(input.checkin);
  if (!start) return "Les dates ne sont pas valides.";
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ahead = Math.round((start.getTime() - todayUtc) / 86_400_000);
  if (ahead < 0) return "La date d’arrivée est passée.";
  if (ahead > RATEHAWK_LIMITS.maxCheckinDays) return "L’arrivée doit être dans les 730 jours.";
  if (!Array.isArray(input.guests) || input.guests.length < 1) return "Indiquez au moins une chambre.";
  if (input.guests.length > RATEHAWK_LIMITS.maxRooms) return "Neuf chambres au plus, du même type.";
  for (const room of input.guests) {
    if (!Number.isInteger(room.adults) || room.adults < 1 || room.adults > RATEHAWK_LIMITS.maxAdultsPerRoom) {
      return "Chaque chambre accueille de 1 à 6 adultes.";
    }
    if (!Array.isArray(room.children) || room.children.length > RATEHAWK_LIMITS.maxChildrenPerRoom) {
      return "Quatre enfants au plus par chambre.";
    }
    for (const age of room.children) {
      if (!Number.isInteger(age) || age < 0 || age > RATEHAWK_LIMITS.maxChildAge) {
        return "Un enfant a 17 ans au plus. À partir de 18 ans, comptez un adulte.";
      }
    }
  }
  if (input.hids) {
    if (input.hids.length < 1 || input.hids.length > RATEHAWK_LIMITS.maxHids) {
      return "La recherche par hôtels accepte de 1 à 300 identifiants.";
    }
    if (input.hids.some((hid) => !Number.isInteger(hid) || hid < 1)) return "Un identifiant d’hôtel est invalide.";
    if (new Set(input.hids).size !== input.hids.length) return "Un identifiant d’hôtel est en double.";
  }
  return null;
}

const FAKE_NAME =
  /^(test|guest|guests|child|children|enfant|enfants|adulte|adult|adults|xxx+|aaa+|nom|prenom|prénom|name|foo|bar|tbd|unknown|na|n\/a|firstname|lastname)$/i;

export function validPersonName(value: string | null | undefined): boolean {
  const name = (value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 50) return false;
  if (!/^[\p{L}][\p{L}\s'.-]*$/u.test(name)) return false;
  if (FAKE_NAME.test(name)) return false;
  return true;
}

export type FinishGuest = {
  first_name: string;
  last_name: string;
  is_child?: boolean;
  age?: number;
};

export function validateBookingGuests(rooms: { guests: FinishGuest[] }[], searched: RoomGuests[]): string | null {
  if (rooms.length !== searched.length) return "Le nombre de chambres ne correspond pas à la recherche.";
  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index];
    const expected = searched[index];
    const adults = room.guests.filter((guest) => !guest.is_child);
    const children = room.guests.filter((guest) => guest.is_child);
    if (adults.length < 1) return `La chambre ${index + 1} doit nommer au moins un adulte.`;
    if (adults.length > expected.adults) return `La chambre ${index + 1} a trop d’adultes.`;
    if (children.length > expected.children.length) return `La chambre ${index + 1} a trop d’enfants.`;
    for (const adult of adults) {
      if (adult.age != null) return "L’âge d’un adulte ne part pas dans la demande.";
      if (!validPersonName(adult.first_name) || !validPersonName(adult.last_name)) {
        return "Indiquez le vrai prénom et le vrai nom de chaque adulte.";
      }
    }
    const ages = [...expected.children];
    for (const child of children) {
      if (!validPersonName(child.first_name) || !validPersonName(child.last_name)) {
        return "Un enfant nommé doit avoir son vrai prénom et son vrai nom, ou être omis.";
      }
      if (!Number.isInteger(child.age)) return "L’âge de l’enfant est obligatoire s’il est nommé.";
      const at = ages.indexOf(child.age as number);
      if (at < 0) return "L’âge de l’enfant ne correspond pas à la recherche.";
      ages.splice(at, 1);
    }
  }
  return null;
}

export function guestsPayload(rooms: { guests: FinishGuest[] }[]) {
  return rooms.map((room) => ({
    guests: room.guests.map((guest) => {
      if (guest.is_child) {
        return {
          first_name: guest.first_name.trim(),
          last_name: guest.last_name.trim(),
          is_child: true,
          age: guest.age,
        };
      }
      return {
        first_name: guest.first_name.trim(),
        last_name: guest.last_name.trim(),
      };
    }),
  }));
}

export function assertSandboxScenario(environment: "sandbox" | "production", scenario: string | null | undefined) {
  if (!scenario || scenario === "none") return null;
  if (!isSandboxOrderSuffix(scenario)) return "Scénario de bac à sable inconnu.";
  if (environment !== "sandbox") return "Les scénarios unknown_* restent dans le bac à sable.";
  return null;
}

export function scenarioOrNull(value: string | null | undefined): SandboxOrderSuffix | null {
  return isSandboxOrderSuffix(value) ? value : null;
}
