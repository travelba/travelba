import { hotelRefsShareBooking, hotelRefTokens } from "@/lib/crm/item-match";
import {
  applyHotelPresentation,
  applyLeStayFacts,
  catalogNameAgrees,
  categoryKey,
  type HotelPresentation,
  type LeStayFacts,
} from "@/lib/crm/hotel-gallery";

type HotelLike = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type GalleryStay = {
  hotel_id: number;
  hotel_name: string;
  confirmation_number: string | null;
  check_in: string | null;
  check_out: string | null;
  room_types: string[];
  address: string | null;
  conditions: string[];
  benefits: string[];
};

export type GalleryPlan =
  | { action: "skip"; reason: string }
  | { action: "clear_id"; reason: string }
  | {
      action: "enrich";
      hotelId: number;
      roomNames: string[];
      stay: LeStayFacts | null;
      stampFamily: boolean;
      reason: string;
    };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function day(value: string | null | undefined) {
  return (value || "").slice(0, 10);
}

function unique(lines: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function storedId(item: HotelLike) {
  const value = item.details?.le_hotel_id;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function itemName(item: HotelLike) {
  return text(item.details?.hotel_name) || text(item.title);
}

function namesAgree(left: string, right: string) {
  if (!left.trim() || !right.trim()) return false;
  return catalogNameAgrees(left, right);
}

function isLeCard(item: HotelLike) {
  if (text(item.details?.source_family) === "little_emperors") return true;
  return (item.supplier || "").toLowerCase().includes("little emperor");
}

function itemRefs(item: HotelLike) {
  const refs = [item.confirmation_ref || ""];
  const rooms = Array.isArray(item.details?.rooms) ? item.details.rooms : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const ref = (room as { confirmation_ref?: unknown }).confirmation_ref;
    if (typeof ref === "string") refs.push(ref);
  }
  return refs;
}

function refsOverlap(refs: string[], confirmation: string | null) {
  const right = new Set(hotelRefTokens(confirmation));
  if (!right.size) return false;
  return refs.some((ref) => hotelRefTokens(ref).some((token) => right.has(token)));
}

function nightsOverlap(item: HotelLike, stay: GalleryStay) {
  const start = day(item.start_at);
  const end = day(item.end_at) || start;
  if (!start || !stay.check_in || !stay.check_out) return false;
  return start < stay.check_out && end > stay.check_in;
}

function cardRoomNames(item: HotelLike) {
  const names: string[] = [];
  const single = text(item.details?.room);
  if (single) names.push(single);
  const rooms = Array.isArray(item.details?.rooms) ? item.details.rooms : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const row = room as { type?: unknown; room?: unknown };
    const type = text(row.type);
    const label = text(row.room);
    if (type) names.push(type);
    else if (label) names.push(label);
  }
  return unique(names);
}

function sameLines(lists: string[][]) {
  if (!lists.length) return [];
  const key = (lines: string[]) => lines.map((line) => line.trim().toLowerCase()).join("|");
  const first = key(lists[0]);
  if (!lists.every((lines) => key(lines) === first)) return [];
  return lists[0];
}

type Matched = { stays: GalleryStay[]; via: "exact" | "stem" | "name" | "stored" };

function matchedStays(item: HotelLike, stays: GalleryStay[]): Matched | null {
  const refs = itemRefs(item);
  const exact = stays.filter((stay) => refsOverlap(refs, stay.confirmation_number));
  if (exact.length) return { stays: exact, via: "exact" };
  const stem = stays.filter((stay) => refs.some((ref) => hotelRefsShareBooking(ref, stay.confirmation_number)));
  if (stem.length) return { stays: stem, via: "stem" };
  const named = stays.filter((stay) => namesAgree(itemName(item), stay.hotel_name) && nightsOverlap(item, stay));
  if (new Set(named.map((stay) => stay.hotel_id)).size === 1) return { stays: named, via: "name" };
  const stored = storedId(item);
  if (stored) {
    const byId = stays.filter((stay) => stay.hotel_id === stored && namesAgree(itemName(item), stay.hotel_name));
    const dated = byId.filter((stay) => !day(item.start_at) || !stay.check_in || nightsOverlap(item, stay));
    const chosen = dated.length ? dated : byId;
    if (chosen.length && new Set(chosen.map((stay) => stay.hotel_id)).size === 1) return { stays: chosen, via: "stored" };
  }
  return null;
}

function hotelIdOf(matched: Matched | null, item: HotelLike) {
  const ids = matched ? [...new Set(matched.stays.map((stay) => stay.hotel_id))] : [];
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) return null;
  return storedId(item);
}

function roomNamesFor(item: HotelLike, matched: Matched | null) {
  if (!matched) return cardRoomNames(item);
  const types = unique(matched.stays.flatMap((stay) => stay.room_types));
  if (matched.via === "stem" && new Set(types.map((type) => categoryKey(type))).size > 1) return [];
  if (types.length) return types;
  return cardRoomNames(item);
}

function stayFacts(matched: Matched | null, hotelId: number): LeStayFacts | null {
  if (!matched) return null;
  const stays = matched.stays.filter((stay) => stay.hotel_id === hotelId);
  if (!stays.length) return null;
  const first = stays[0];
  return {
    hotel_id: hotelId,
    confirmation_number: first.confirmation_number,
    check_in: first.check_in,
    check_out: first.check_out,
    address: first.address,
    room_types: [],
    conditions: sameLines(stays.map((stay) => stay.conditions)),
    guest_names: [],
    benefits: sameLines(stays.map((stay) => stay.benefits)),
  };
}

export function galleryHotelCandidate(item: HotelLike, stays: GalleryStay[]) {
  if (item.kind !== "hotel") return null;
  const matched = matchedStays(item, stays);
  if (matched && new Set(matched.stays.map((stay) => stay.hotel_id)).size > 1) return null;
  return hotelIdOf(matched, item);
}

/** Décide le rattrapage d’une carte. Le catalogue qui ne porte pas le même hôtel ne donne aucune photo. */
export function planGalleryBackfill(item: HotelLike, stays: GalleryStay[], catalog: { hotel_id: number; name: string } | null): GalleryPlan {
  if (item.kind !== "hotel") return { action: "skip", reason: "pas une carte hôtel" };
  const matched = matchedStays(item, stays);
  if (matched && new Set(matched.stays.map((stay) => stay.hotel_id)).size > 1) {
    return { action: "skip", reason: "plusieurs hôtels pour la même confirmation" };
  }
  const hotelId = hotelIdOf(matched, item);
  if (catalog && hotelId && catalog.hotel_id !== hotelId) return { action: "skip", reason: "catalogue indisponible" };
  const le = isLeCard(item) || Boolean(matched);
  const name = itemName(item);
  if (catalog && hotelId && catalog.hotel_id === hotelId && name && catalog.name && !namesAgree(name, catalog.name)) {
    if (matched && matched.via !== "stored") return { action: "skip", reason: "la confirmation et le nom d’hôtel ne concordent pas" };
    if (storedId(item)) return { action: "clear_id", reason: "identifiant d’un autre hôtel" };
    return { action: "skip", reason: "le catalogue ne correspond pas à l’hôtel" };
  }
  if (!le) return { action: "skip", reason: "pas une carte Little Emperors" };
  if (!hotelId) return { action: "skip", reason: "aucun identifiant catalogue" };
  if (!catalog) return { action: "skip", reason: "catalogue indisponible" };
  const family = text(item.details?.source_family);
  const stampFamily = !family && (isLeCard(item) || Boolean(matched));
  let reason = "photos de la catégorie réservée";
  const roomNames = roomNamesFor(item, matched);
  if (!roomNames.length) reason = "espaces de l’hôtel : catégorie non distinguée";
  return {
    action: "enrich",
    hotelId,
    roomNames,
    stay: stayFacts(matched, hotelId),
    stampFamily,
    reason,
  };
}

/** Applique le plan. Une galerie déjà posée reste. Le second passage ne réécrit rien. */
export function applyGalleryBackfill<T extends HotelLike>(item: T, plan: GalleryPlan, presentation: HotelPresentation): { item: T; changed: boolean } {
  if (plan.action === "skip" || item.kind !== "hotel") return { item, changed: false };
  const details = { ...(item.details || {}) };
  if (plan.action === "clear_id") {
    if (details.le_hotel_id == null) return { item, changed: false };
    delete details.le_hotel_id;
    const next = { ...item, details };
    return { item: next, changed: JSON.stringify(item.details || {}) !== JSON.stringify(details) };
  }
  let next: T = { ...item, details: { ...details, le_hotel_id: plan.hotelId } };
  if (plan.stampFamily && !text(next.details?.source_family)) {
    next = { ...next, details: { ...(next.details || {}), source_family: "little_emperors" } };
  }
  if (plan.stay) next = applyLeStayFacts(next, plan.stay);
  next = applyHotelPresentation(next, presentation);
  const changed = JSON.stringify(item.details || {}) !== JSON.stringify(next.details || {});
  return { item: next, changed };
}
