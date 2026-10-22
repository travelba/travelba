import { HOTEL_PERK_WEIGHTS, type ClientHotel, type HotelPerks } from "./hotel-search";

export type HotelSort = "prix" | "avantages";

export type ClientRate = {
  offerId: string | null;
  room: string;
  title: string;
  detail: string;
  cancellation: string;
  benefits: string[];
  footnotes: string[];
  perks: HotelPerks;
  sellCents: number;
  perNightCents: number;
  currency: string;
  images: string[];
};

export type ClientRoom = {
  name: string;
  detail: string;
  images: string[];
  rates: ClientRate[];
};

export type ClientHotelFile = {
  name: string;
  city: string;
  address: string;
  description: string;
  funFact: string;
  images: string[];
  amenities: string[];
  sections: { title: string; lines: string[] }[];
  benefits: string[];
  footnotes: string[];
  checkInTime: string;
  checkOutTime: string;
  coords: { lat: number; lng: number } | null;
  rooms: ClientRoom[];
};

const PERK_KEYS = Object.keys(HOTEL_PERK_WEIGHTS).filter((key) => key !== "other") as (keyof HotelPerks)[];

export function perkScore(hotel: Pick<ClientHotel, "perks" | "benefits">) {
  const flags = PERK_KEYS.reduce((sum, key) => sum + (hotel.perks[key] ? HOTEL_PERK_WEIGHTS[key] : 0), 0);
  return flags * 10 + hotel.benefits.length;
}

export function presentHotels(hotels: ClientHotel[], sort: HotelSort, needs: (keyof HotelPerks)[]) {
  const filtered = hotels.filter((hotel) => needs.every((key) => hotel.perks[key]));
  const copy = filtered.slice();
  if (sort === "avantages") {
    copy.sort((a, b) => perkScore(b) - perkScore(a) || a.sellCents - b.sellCents || a.name.localeCompare(b.name, "fr"));
  } else {
    copy.sort((a, b) => a.sellCents - b.sellCents || perkScore(b) - perkScore(a) || a.name.localeCompare(b.name, "fr"));
  }
  return copy;
}

export function guestNameOk(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < 3 || clean.length > 80) return false;
  const parts = clean.split(" ");
  if (parts.length < 2) return false;
  return parts.every((part) => part.length >= 1) && parts[parts.length - 1].length >= 2;
}

export function parseGuestNames(value: unknown, roomCount: number): string[] | null {
  if (!Array.isArray(value) || value.length !== roomCount) return null;
  const names = value.map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : ""));
  if (names.some((name) => !guestNameOk(name))) return null;
  return names;
}
