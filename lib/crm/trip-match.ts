import { cityPlaceKey, isOriginHub } from "@/lib/crm/city-names";
import { extractPeople, type TripBooking } from "@/lib/crm/email-match";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { namesReferToSamePerson } from "@/lib/crm/person-match";

/** Deux nuits qui se touchent, ou un vol de nuit qui arrive le lendemain. */
export const CONNECTING_GAP_DAYS = 1;

/** Même ville, même voyageurs : un trou plus long reste le même séjour (Phu Quoc sans hôtel). */
export const SAME_CITY_GAP_DAYS = 21;

export type TripPerson = { first_name: string; last_name: string };

export type TripDossier = {
  id: string;
  customerId: string | null;
  reference?: string | null;
  status?: string | null;
  archived?: boolean;
  visible?: boolean;
  createdAt?: string | null;
  start: string | null;
  end: string | null;
  places: string[];
  people: TripPerson[];
};

export type ReunionProposal = { id: string; reference: string | null };

/** Deux fiches. Rien n’est fusionné : la file attend une validation. */
export const DIFFERENT_CLIENT_HOLD =
  "Deux clients différents ont un séjour proche. La réunion attend une validation.";

/** Dossier né pendant ce passage du cron. Il n’absorbe rien et n’est pas absorbé. */
export const SAME_PASS_HOLD =
  "Un dossier vient d’être créé pendant ce passage. La réunion attend une validation.";

export type ReunionOptions = {
  /** Dossiers créés plus tôt dans le même passage (cron, sync). */
  bornIds?: Set<string>;
  /** Horodatage de début du passage. Un dossier créé après n’est pas fusionné. */
  passStartedAt?: string | null;
};

export type Reunion = {
  keeper: TripDossier | null;
  mergeIds: string[];
  hold: string | null;
  proposals: ReunionProposal[];
};

function dayNumber(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Jours entre deux fenêtres. 0 si elles se touchent ou se chevauchent. */
export function tripGapDays(
  leftStart: string | null | undefined,
  leftEnd: string | null | undefined,
  rightStart: string | null | undefined,
  rightEnd: string | null | undefined
) {
  const a0 = dayNumber(leftStart);
  const b0 = dayNumber(rightStart);
  if (a0 == null || b0 == null) return null;
  const a1 = dayNumber(leftEnd) ?? a0;
  const b1 = dayNumber(rightEnd) ?? b0;
  if (a0 <= b1 && a1 >= b0) return 0;
  if (a1 < b0) return b0 - a1;
  return a0 - b1;
}

function placeKeys(places: string[]) {
  const keys = new Set<string>();
  for (const place of places) {
    const key = cityPlaceKey(place);
    if (!key || isOriginHub(key)) continue;
    keys.add(key);
  }
  return keys;
}

export function placesConnect(left: string[], right: string[]) {
  const other = placeKeys(right);
  for (const key of placeKeys(left)) {
    if (other.has(key)) return true;
  }
  return false;
}

function sharePerson(left: TripPerson[], right: TripPerson[]) {
  return left.some((person) =>
    right.some(
      (other) =>
        namesReferToSamePerson(person, other) ||
        namesReferToSamePerson(
          { first_name: person.last_name, last_name: person.first_name },
          other
        )
    )
  );
}

function openDossier(dossier: TripDossier) {
  if (dossier.archived) return false;
  if ((dossier.status || "") === "cancelled") return false;
  return true;
}

export function windowsConnect(
  left: { start: string | null; end: string | null; places: string[] },
  right: { start: string | null; end: string | null; places: string[] }
) {
  const gap = tripGapDays(left.start, left.end, right.start, right.end);
  if (gap == null) return false;
  if (gap <= CONNECTING_GAP_DAYS) return true;
  return gap <= SAME_CITY_GAP_DAYS && placesConnect(left.places, right.places);
}

/** Même client, dates qui se suivent ou se chevauchent. Un nom partagé ne suffit pas. */
export function dossiersSameTrip(left: TripDossier, right: TripDossier) {
  if (!openDossier(left) || !openDossier(right)) return false;
  if (left.id === right.id) return false;
  if (!left.customerId || left.customerId !== right.customerId) return false;
  return windowsConnect(left, right);
}

function extractWindow(extract: BookingExtract) {
  let start = String(extract.start_date || "").slice(0, 10) || null;
  let end = String(extract.end_date || "").slice(0, 10) || null;
  for (const item of extract.items || []) {
    const itemStart = String(item.start_at || "").slice(0, 10);
    const itemEnd = String(item.end_at || item.start_at || "").slice(0, 10);
    if (itemStart && (!start || itemStart < start)) start = itemStart;
    if (itemEnd && (!end || itemEnd > end)) end = itemEnd;
  }
  return { start, end };
}

export function placesFromExtract(extract: BookingExtract) {
  const places: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) places.push(value.trim());
  };
  push(extract.destination);
  push(extract.title);
  for (const item of extract.items || []) {
    push(item.title);
    const details = item.details || {};
    push(details.city);
    push(details.city_from);
    push(details.city_to);
    push(details.from);
    push(details.to);
    push(details.hotel_name);
  }
  return places;
}

export function incomingTrip(extract: BookingExtract, customerId?: string | null): TripDossier {
  const window = extractWindow(extract);
  return {
    id: "incoming",
    customerId: customerId || null,
    start: window.start,
    end: window.end,
    places: placesFromExtract(extract),
    people: extractPeople(extract),
  };
}

function pickKeeper(group: TripDossier[]): { keeper: TripDossier | null; hold: string | null } {
  const visible = group.filter((row) => row.visible);
  if (visible.length > 1) {
    const names = visible
      .map((row) => row.reference || row.id)
      .slice(0, 3)
      .join(", ");
    return {
      keeper: null,
      hold: `Deux séjours déjà montrés correspondent (${names}). La file attend.`,
    };
  }
  const pool = visible.length === 1 ? visible : group;
  const keeper = [...pool].sort((a, b) => {
    const start = (a.start || "9999").localeCompare(b.start || "9999");
    if (start) return start;
    return (a.reference || a.id).localeCompare(b.reference || b.id, "fr");
  })[0];
  return { keeper: keeper || null, hold: null };
}

function bornThisPass(dossier: TripDossier, options?: ReunionOptions) {
  if (options?.bornIds?.has(dossier.id)) return true;
  const started = options?.passStartedAt || "";
  const created = dossier.createdAt || "";
  return Boolean(started && created && created >= started);
}

/** Même fiche, et les dates de la pièce touchent ce dossier. Pas un voisin du voisin. */
function directSameClient(incoming: TripDossier, dossier: TripDossier) {
  if (!incoming.customerId || incoming.customerId !== dossier.customerId) return false;
  return windowsConnect(incoming, dossier);
}

/**
 * Dossiers du même client que la pièce qui arrive, et qui touchent directement ses dates.
 * Pas de chaîne : un dossier qui ne touche que un autre dossier n’est pas pris.
 * Un autre client, même avec un nom proche, reste une proposition.
 * Un dossier créé pendant ce passage n’est pas fusionné.
 * Un seul séjour montré est gardé. Deux séjours déjà montrés restent en file.
 */
export function reunionPlan(
  incoming: TripDossier,
  dossiers: TripDossier[],
  options?: ReunionOptions
): Reunion {
  const none = { keeper: null as null, mergeIds: [] as string[], hold: null as string | null, proposals: [] as ReunionProposal[] };
  const open = dossiers.filter(openDossier);
  if (!incoming.people.length && !incoming.customerId) return none;
  const same: TripDossier[] = [];
  const other: TripDossier[] = [];
  for (const dossier of open) {
    if (!windowsConnect(incoming, dossier)) continue;
    if (incoming.customerId && dossier.customerId && incoming.customerId !== dossier.customerId) {
      if (sharePerson(incoming.people, dossier.people)) other.push(dossier);
      continue;
    }
    if (!directSameClient(incoming, dossier)) continue;
    same.push(dossier);
  }
  const proposals = other.map((row) => ({ id: row.id, reference: row.reference || null }));
  if (!same.length) {
    return other.length
      ? { keeper: null, mergeIds: [], hold: DIFFERENT_CLIENT_HOLD, proposals }
      : { ...none, proposals };
  }
  const fresh = same.filter((row) => bornThisPass(row, options));
  const settled = same.filter((row) => !bornThisPass(row, options));
  if (!settled.length && fresh.length) {
    const picked = pickKeeper(fresh);
    if (!picked.keeper) return { keeper: null, mergeIds: [], hold: picked.hold, proposals };
    return { keeper: picked.keeper, mergeIds: [], hold: null, proposals };
  }
  const picked = pickKeeper(settled);
  if (!picked.keeper) return { keeper: null, mergeIds: [], hold: picked.hold, proposals };
  return {
    keeper: picked.keeper,
    mergeIds: settled.filter((row) => row.id !== picked.keeper!.id).map((row) => row.id),
    hold: null,
    proposals,
  };
}

type ItemRow = {
  booking_id?: string | null;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

/** Fenêtre et villes d’un dossier déjà ouvert, cartes comprises. */
export function tripDossierFromRows(input: {
  booking: TripBooking & { visible_to_client?: boolean | null; archived_at?: string | null };
  items?: ItemRow[];
  people?: TripPerson[];
}): TripDossier {
  const booking = input.booking;
  let start = String(booking.start_date || "").slice(0, 10) || null;
  let end = String(booking.end_date || "").slice(0, 10) || null;
  const places = [booking.title || "", booking.destination || ""].filter(Boolean);
  for (const item of input.items || []) {
    if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") continue;
    const itemStart = String(item.start_at || "").slice(0, 10);
    const itemEnd = String(item.end_at || item.start_at || "").slice(0, 10);
    if (itemStart && (!start || itemStart < start)) start = itemStart;
    if (itemEnd && (!end || itemEnd > end)) end = itemEnd;
    places.push(item.title || "");
    places.push(detailText(item.details, "city"));
    places.push(detailText(item.details, "city_from"));
    places.push(detailText(item.details, "city_to"));
    places.push(detailText(item.details, "from"));
    places.push(detailText(item.details, "to"));
  }
  return {
    id: booking.id,
    customerId: booking.customer_id || null,
    reference: booking.reference,
    status: booking.status,
    archived: Boolean(booking.archived_at),
    visible: Boolean(booking.visible_to_client),
    createdAt: (booking as { created_at?: string | null }).created_at || null,
    start,
    end,
    places: places.filter(Boolean),
    people: input.people || [],
  };
}
