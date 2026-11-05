import { personLabel } from "./household";
import { isPlaceholderTraveler } from "./person-match";

/** Voyageur du dossier, pour résoudre une case cochée sur une carte. */
export type LedgerPartyTraveler = {
  id?: string;
  booking_id: string;
  first_name?: string | null;
  last_name?: string | null;
  companion_id?: string | null;
  is_account_holder?: boolean | null;
};

/** Carte du séjour : les cases cochées vivent dans `details`. */
export type LedgerPartyCard = {
  id: string;
  booking_id: string;
  details?: Record<string, unknown> | null;
};

/** Deux noms dans la ligne repliée, le reste en « +N ». */
export const LEDGER_TRAVELER_PREVIEW = 2;

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sameName(left: string, right: string) {
  return left.localeCompare(right, "fr", { sensitivity: "accent" }) === 0;
}

function pushName(names: string[], value: string) {
  const name = cleanName(value);
  if (!name || names.some((row) => sameName(row, name))) return;
  names.push(name);
}

/**
 * « Voyageur : Sid Ahmed Badsi », « Voyageurs : A, B », ou « Voyageurs : A, B +N ».
 * `limit` 0 liste tout le monde (relevé, détail, outil).
 */
export function ledgerTravelerLabel(names: string[] | null | undefined, limit = LEDGER_TRAVELER_PREVIEW) {
  const clean: string[] = [];
  for (const name of names || []) pushName(clean, name);
  if (!clean.length) return null;
  if (clean.length === 1) return `Voyageur : ${clean[0]}`;
  const cap = limit > 0 ? Math.min(limit, clean.length) : clean.length;
  const shown = clean.slice(0, cap);
  const extra = clean.length - shown.length;
  const list = extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
  return `Voyageurs : ${list}`;
}

/** Identifiant de carte dans l’écriture (`booking:…:item:…` ou `:expense:`). */
export function ledgerCardId(externalId: string | null | undefined) {
  const value = externalId || "";
  const item = value.match(/:item:(.+)$/);
  if (item?.[1]) return item[1];
  const expense = value.match(/:expense:(.+)$/);
  if (expense?.[1]) return expense[1];
  return null;
}

function travelerName(person: LedgerPartyTraveler) {
  if (isPlaceholderTraveler(person.first_name, person.last_name)) return "";
  return personLabel(person.first_name, person.last_name);
}

function resolveKey(key: string, travelers: LedgerPartyTraveler[]) {
  if (key === "holder") {
    const holder = travelers.find((row) => row.is_account_holder);
    return holder ? travelerName(holder) : "";
  }
  if (key.startsWith("companion:")) {
    const id = key.slice("companion:".length);
    const person = travelers.find((row) => row.companion_id === id);
    return person ? travelerName(person) : "";
  }
  const byId = travelers.find((row) => row.id === key);
  return byId ? travelerName(byId) : "";
}

function partyKeys(details: Record<string, unknown> | null | undefined) {
  const keys: string[] = [];
  const add = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const key of value) {
      const text = String(key || "").trim();
      if (text && !keys.includes(text)) keys.push(text);
    }
  };
  add(details?.party_keys);
  const rooms = details?.rooms;
  if (Array.isArray(rooms)) {
    for (const room of rooms) {
      if (!room || typeof room !== "object") continue;
      add((room as { party_keys?: unknown }).party_keys);
    }
  }
  return keys;
}

function passengerNames(details: Record<string, unknown> | null | undefined) {
  const names: string[] = [];
  const rows = details?.passengers;
  if (!Array.isArray(rows)) return names;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { first_name?: unknown; last_name?: unknown };
    const first = String(record.first_name || "").trim();
    const last = String(record.last_name || "").trim();
    if (isPlaceholderTraveler(first, last)) continue;
    pushName(names, personLabel(first, last));
  }
  return names;
}

function guestNames(details: Record<string, unknown> | null | undefined) {
  const names: string[] = [];
  const addLine = (value: unknown) => {
    if (typeof value !== "string") return;
    for (const part of value.split(/[,;]/)) pushName(names, part);
  };
  addLine(details?.guests);
  const rooms = details?.rooms;
  if (Array.isArray(rooms)) {
    for (const room of rooms) {
      if (!room || typeof room !== "object") continue;
      addLine((room as { guests?: unknown }).guests);
    }
  }
  return names;
}

/** Noms cochés sur la carte. Tableau vide : aucune case, le dossier peut servir. */
export function cardTravelerNames(
  details: Record<string, unknown> | null | undefined,
  travelers: LedgerPartyTraveler[]
) {
  const keys = partyKeys(details);
  if (keys.length) {
    const resolved: string[] = [];
    for (const key of keys) pushName(resolved, resolveKey(key, travelers));
    if (resolved.length) return resolved;
  }
  const names: string[] = [];
  for (const name of passengerNames(details)) pushName(names, name);
  for (const name of guestNames(details)) pushName(names, name);
  return names;
}

export function dossierTravelerNames(travelers: LedgerPartyTraveler[]) {
  const names: string[] = [];
  for (const person of travelers) pushName(names, travelerName(person));
  return names;
}

/**
 * Débit rattaché à un séjour : voyageurs cochés sur la carte, sinon ceux du dossier.
 * Un crédit, ou un mouvement sans séjour, ne nomme personne.
 */
export function movementTravelerNames(input: {
  direction: string;
  bookingId: string | null | undefined;
  externalId: string | null | undefined;
  cards: LedgerPartyCard[];
  travelers: LedgerPartyTraveler[];
}) {
  if (input.direction !== "debit" || !input.bookingId) return [] as string[];
  const onDossier = input.travelers.filter((row) => row.booking_id === input.bookingId);
  const cardId = ledgerCardId(input.externalId);
  if (cardId) {
    const card = input.cards.find((row) => row.id === cardId && row.booking_id === input.bookingId);
    if (card) {
      const ticked = cardTravelerNames(card.details, onDossier);
      if (ticked.length) return ticked;
    }
  }
  return dossierTravelerNames(onDossier);
}
