import type { ClientHotelFile } from "./hotel-journey";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; file: ClientHotelFile }>();

export function hotelFicheCacheKey(input: { hotelId: number; checkIn: string; checkOut: string; rooms: number }) {
  return `${input.hotelId}|${input.checkIn}|${input.checkOut}|${input.rooms}`;
}

export function readHotelFicheCache(key: string): ClientHotelFile | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.file;
}

export function writeHotelFicheCache(key: string, file: ClientHotelFile) {
  cache.set(key, { at: Date.now(), file });
}
