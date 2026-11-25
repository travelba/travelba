import type { HotelSort } from "./hotel-journey";
import {
  hotelSearchCacheKey,
  type ClientHotel,
  type HotelPerks,
  type HotelRoomOccupancy,
  type HotelSearchTarget,
} from "./hotel-search";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PERK_KEYS: (keyof HotelPerks)[] = [
  "breakfast",
  "freeCancellation",
  "upgrade",
  "credit",
  "earlyCheckIn",
  "lateCheckOut",
];
const RESULTS_KEY = "hotel-search-results";

export type HotelListCriteria = {
  destination: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  target: HotelSearchTarget | null;
  sort: HotelSort;
  filters: (keyof HotelPerks)[];
  page: number;
};

export type HotelSearchSnapshot = {
  key: string;
  hotels: ClientHotel[];
  catalog: Record<string, ClientHotel>;
  page: number;
  sort: HotelSort;
  needs: (keyof HotelPerks)[];
  scroll: number;
  rooms: HotelRoomOccupancy[];
};

/** `2` ou `2:4.7`, chambres séparées par `~`. */
export function encodeStayRooms(rooms: { adults: number; children: number[] }[]) {
  return rooms
    .map((room) => {
      const ages = room.children.filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
      return ages.length ? `${room.adults}:${ages.join(".")}` : String(room.adults);
    })
    .join("~");
}

export function decodeStayRooms(value: string): HotelRoomOccupancy[] | null {
  const parts = value.split("~").filter(Boolean);
  if (!parts.length || parts.length > 9) return null;
  const rooms: HotelRoomOccupancy[] = [];
  for (const part of parts) {
    const [adultsRaw, agesRaw = ""] = part.split(":");
    const adults = Number(adultsRaw);
    if (!Number.isInteger(adults) || adults < 1 || adults > 6) return null;
    if (part.split(":").length > 2) return null;
    const children: { age: number }[] = [];
    if (agesRaw) {
      for (const ageRaw of agesRaw.split(".")) {
        const age = Number(ageRaw);
        if (!Number.isInteger(age) || age < 0 || age > 17) return null;
        children.push({ age });
      }
      if (children.length > 4) return null;
    }
    rooms.push({ adults, children });
  }
  return rooms;
}

export function writeHotelListSearch(input: HotelListCriteria) {
  const params = new URLSearchParams();
  params.set("ou", input.destination.trim());
  if (input.city.trim()) params.set("ville", input.city.trim());
  params.set("arrivee", input.checkIn);
  params.set("depart", input.checkOut);
  params.set(
    "chambres",
    encodeStayRooms(input.rooms.map((room) => ({ adults: room.adults, children: room.children.map((child) => child.age) })))
  );
  if (input.target) params.set("cible", `${input.target.kind}:${input.target.id}`);
  if (input.sort === "avantages") params.set("tri", "avantages");
  if (input.filters.length) params.set("filtres", input.filters.join(","));
  if (input.page > 1) params.set("page", String(input.page));
  return params.toString();
}

function readTarget(value: string | null): HotelSearchTarget | null {
  if (!value) return null;
  const match = /^(ville|hotel):(\d+)$/.exec(value);
  if (!match) return null;
  return { kind: match[1] as "ville" | "hotel", id: Number(match[2]) };
}

function readFilters(value: string | null): (keyof HotelPerks)[] {
  if (!value) return [];
  const keys = new Set(PERK_KEYS);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is keyof HotelPerks => keys.has(item as keyof HotelPerks));
}

export function readHotelListSearch(params: URLSearchParams): HotelListCriteria | null {
  const destination = (params.get("ou") || "").trim();
  const checkIn = params.get("arrivee") || "";
  const checkOut = params.get("depart") || "";
  const rooms = decodeStayRooms(params.get("chambres") || "");
  if (destination.length < 2 || destination.length > 120 || !ISO.test(checkIn) || !ISO.test(checkOut) || !rooms) return null;
  const pageRaw = Number(params.get("page") || "1");
  const page = Number.isInteger(pageRaw) && pageRaw > 0 && pageRaw < 50 ? pageRaw : 1;
  return {
    destination,
    city: (params.get("ville") || "").trim().slice(0, 120),
    checkIn,
    checkOut,
    rooms,
    target: readTarget(params.get("cible")),
    sort: params.get("tri") === "avantages" ? "avantages" : "prix",
    filters: readFilters(params.get("filtres")),
    page,
  };
}

export function hotelListCacheKey(input: HotelListCriteria) {
  return hotelSearchCacheKey({
    destination: input.destination,
    city: input.city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms,
    target: input.target,
  });
}

/** La fiche ouverte, ou la même recherche dans l’URL. */
export function hotelSearchMatches(snapshot: HotelSearchSnapshot, params: URLSearchParams) {
  const hotel = params.get("hotel");
  if (hotel && snapshot.catalog?.[hotel]) return true;
  const criteria = readHotelListSearch(params);
  if (!criteria) return false;
  return hotelListCacheKey(criteria) === snapshot.key;
}

let memory: HotelSearchSnapshot | null = null;
const listeners = new Set<() => void>();

function snapshotOk(value: unknown): value is HotelSearchSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as HotelSearchSnapshot;
  return typeof row.key === "string" && Array.isArray(row.hotels) && row.catalog != null && typeof row.catalog === "object";
}

export function rememberHotelSearch(snapshot: HotelSearchSnapshot, notify = true) {
  memory = snapshot;
  try {
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify(snapshot));
  } catch {
    /* le navigateur peut refuser l’écriture */
  }
  if (!notify) return;
  for (const listener of listeners) listener();
}

export function readHotelSearchMemory(): HotelSearchSnapshot | null {
  if (memory) return memory;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!snapshotOk(parsed)) return null;
    memory = parsed;
    return memory;
  } catch {
    return null;
  }
}

export function subscribeHotelSearchMemory(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function emptyHotelSearchMemory(): HotelSearchSnapshot | null {
  return null;
}
