import { foldHotelLabel } from "./hotel-catalog";
import { HOTEL_PERK_WEIGHTS, offerBeats, type ClientHotel, type HotelPerks } from "./hotel-search";

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
  /** Surface intérieure, seulement si elle est connue. */
  area?: string;
  bed?: string;
  outlook?: string;
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

/** Les privilèges réellement lus. Aucun avantage n’est ajouté. */
export function travelPrivileges(perks: HotelPerks, benefits: string[]) {
  const blob = benefits.join(" ");
  const lines: string[] = [];
  if (perks.breakfast) lines.push(/pour deux|for two/i.test(blob) ? "Petit-déjeuner pour deux" : "Petit-déjeuner offert");
  if (perks.upgrade) lines.push("Surclassement prioritaire selon disponibilité");
  if (perks.earlyCheckIn && perks.lateCheckOut) lines.push("Arrivée anticipée / départ tardif selon disponibilité");
  else if (perks.earlyCheckIn) lines.push("Arrivée anticipée selon disponibilité");
  else if (perks.lateCheckOut) lines.push("Départ tardif selon disponibilité");
  return lines;
}

export function perkScore(hotel: Pick<ClientHotel, "perks" | "benefits">) {
  const flags = PERK_KEYS.reduce((sum, key) => sum + (hotel.perks[key] ? HOTEL_PERK_WEIGHTS[key] : 0), 0);
  return flags * 10 + hotel.benefits.length;
}

/** Une chambre, une offre : la moins chère au prix client ; à l’arrondi près, la plus avantagée. */
export function collapseRooms(rooms: ClientRoom[]): ClientRoom[] {
  const groups = new Map<string, ClientRoom>();
  for (const room of rooms) {
    const key = foldHotelLabel(room.name) || room.name.trim().toLocaleLowerCase("fr") || "sejour";
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...room, rates: room.rates.slice() });
      continue;
    }
    existing.rates.push(...room.rates);
    if (!existing.images.length) existing.images = room.images;
    if (!existing.area && room.area) existing.area = room.area;
    if (!existing.bed && room.bed) existing.bed = room.bed;
    if (!existing.outlook && room.outlook) existing.outlook = room.outlook;
  }
  const out: ClientRoom[] = [];
  for (const room of groups.values()) {
    const rate = room.rates.reduce<ClientRate | null>((best, next) => {
      if (
        !best ||
        offerBeats(
          { sellCents: best.sellCents, currency: best.currency, score: perkScore(best), benefits: best.benefits },
          { sellCents: next.sellCents, currency: next.currency, score: perkScore(next), benefits: next.benefits },
        )
      ) {
        return next;
      }
      return best;
    }, null);
    if (!rate) continue;
    out.push({ ...room, images: room.images.length ? room.images : rate.images, rates: [rate] });
  }
  return out;
}

const JOURNEY_QUERY = {
  hotel: "",
  room: "chambre",
  guests: "voyageurs",
  confirm: "demande",
} as const;

export type HotelJourneyStep = keyof typeof JOURNEY_QUERY;

export function hotelJourneyStep(value: string | null | undefined): HotelJourneyStep {
  if (value === "chambre") return "room";
  if (value === "voyageurs") return "guests";
  if (value === "demande") return "confirm";
  return "hotel";
}

export function hotelJourneySearch(hotel: string, step: HotelJourneyStep) {
  const params = new URLSearchParams();
  params.set("hotel", hotel);
  const etape = JOURNEY_QUERY[step];
  if (etape) params.set("etape", etape);
  return params.toString();
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
