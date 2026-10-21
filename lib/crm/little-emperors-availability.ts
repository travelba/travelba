import { foldHotelLabel } from "./hotel-catalog";
import { frenchLeBenefitLine } from "./ingest-parse";
import type { HotelOffer } from "./hotel-search";
import { safeHotelPhoto } from "./hotel-search";

/**
 * Prix Little Emperors montré au client : `total_to_book_in_requested_currency`,
 * puis `total_to_book`. C’est le montant qu’ils demandent pour réserver
 * (exemple de leur schéma : 223,83). `rate` ne sert que si ce total est absent.
 * Un champ net ou une commission, s’ils apparaissaient, ne sont pas lus.
 */

export type LeSearchHit = {
  id: number;
  text: string;
  type: string;
  location: string;
};

export type LeTarget = { kind: "location" | "hotel"; id: number };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberOf(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function integer(value: unknown) {
  const parsed = numberOf(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function currencyOf(value: unknown, fallback: string) {
  const code = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

/** Montant à réserver, dans la devise demandée quand Little Emperors la donne. */
export function littleEmperorsProposedPrice(rate: Record<string, unknown> | null): { amount: number; currency: string } | null {
  if (!rate) return null;
  const requestedCurrency = currencyOf(rate.requested_currency_code, "EUR");
  const ownCurrency = currencyOf(rate.currency_code, requestedCurrency);
  const ordered: { amount: number | null; currency: string }[] = [
    { amount: numberOf(rate.total_to_book_in_requested_currency), currency: requestedCurrency },
    { amount: numberOf(rate.total_to_book), currency: ownCurrency },
    { amount: numberOf(rate.rate_in_requested_currency), currency: requestedCurrency },
    { amount: numberOf(rate.rate), currency: ownCurrency },
  ];
  for (const item of ordered) {
    if (item.amount != null && item.amount > 0) return { amount: item.amount, currency: item.currency };
  }
  return null;
}

function photos(value: unknown) {
  const images = Array.isArray(value) ? value : [];
  const first = record(images[0]);
  if (!first) return { photoUrl: null as string | null, thumbUrl: null as string | null };
  return {
    photoUrl: safeHotelPhoto(first.url),
    thumbUrl: safeHotelPhoto(first.thumbnail_url),
  };
}

function benefitLines(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const line = frenchLeBenefitLine(raw).replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = foldHotelLabel(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function cityFrom(location: string, fallback: string) {
  const head = location.split(",")[0]?.trim() || "";
  return head || fallback;
}

export function parseLePredictive(payload: unknown): LeSearchHit[] {
  if (!Array.isArray(payload)) return [];
  const out: LeSearchHit[] = [];
  for (const row of payload) {
    const item = record(row);
    if (!item) continue;
    const id = integer(item.id);
    const type = text(item.type);
    const label = text(item.text);
    if (id == null || !label || (type !== "hotel" && type !== "location")) continue;
    out.push({ id, text: label, type, location: text(item.location) });
  }
  return out;
}

export function pickLeSearchTarget(results: LeSearchHit[], query: string): LeTarget | null {
  const needle = foldHotelLabel(query);
  const places = results.filter((row) => row.type === "location");
  const hotels = results.filter((row) => row.type === "hotel");
  const place =
    places.find((row) => foldHotelLabel(row.text) === needle) ||
    places.find((row) => {
      const label = foldHotelLabel(row.text);
      return label.startsWith(needle) || needle.startsWith(label);
    });
  if (place) return { kind: "location", id: place.id };
  const hotel = hotels.find((row) => foldHotelLabel(row.text) === needle);
  if (hotel) return { kind: "hotel", id: hotel.id };
  if (places[0]) return { kind: "location", id: places[0].id };
  if (hotels[0]) return { kind: "hotel", id: hotels[0].id };
  return null;
}

function imageList(value: unknown) {
  const images = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const row of images) {
    const item = record(row);
    const url = safeHotelPhoto(item?.url) || safeHotelPhoto(item?.thumbnail_url);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= 12) break;
  }
  return out;
}

export function coordsOf(value: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lat = numberOf(value[0]);
  const lng = numberOf(value[1]);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function keyPart(value: string) {
  return foldHotelLabel(value).replace(/\s+/g, "-").slice(0, 60);
}

function priceKey(rate: Record<string, unknown>) {
  const price = littleEmperorsProposedPrice(rate);
  return price ? String(price.amount) : "0";
}

function pushOffer(
  out: HotelOffer[],
  input: {
    name: string;
    city: string;
    room: string | null;
    photoUrl: string | null;
    thumbUrl: string | null;
    benefits: string[];
    rate: Record<string, unknown> | null;
    freeCancellation: boolean;
    hotelId?: number | null;
    description?: string;
    images?: string[];
    coords?: { lat: number; lng: number } | null;
    footnotes?: string[];
    roomKey?: string;
    rateKey?: string;
    rateTitle?: string;
    cancellation?: string;
  }
) {
  const price = littleEmperorsProposedPrice(input.rate);
  if (!price || !input.name) return;
  out.push({
    account: "little_emperors",
    hotelName: input.name,
    city: input.city,
    roomLabel: input.room,
    photoUrl: input.photoUrl,
    thumbUrl: input.thumbUrl,
    currency: price.currency,
    benefits: input.benefits,
    freeCancellation: input.freeCancellation,
    proposed: price.amount,
    net: null,
    commissionable: false,
    hotelCommission: null,
    hotelId: input.hotelId ?? null,
    description: input.description || "",
    images: input.images || [],
    coords: input.coords ?? null,
    footnotes: input.footnotes || [],
    roomKey: input.roomKey || "",
    rateKey: input.rateKey || "",
    rateTitle: input.rateTitle || "",
    cancellation: input.cancellation || "",
  });
}

export function offersFromLeAvailability(payload: unknown, cityHint = ""): HotelOffer[] {
  if (!Array.isArray(payload)) return [];
  const out: HotelOffer[] = [];
  for (const row of payload) {
    const hotel = record(row);
    if (!hotel || hotel.is_available === false) continue;
    const name = text(hotel.hotel_name);
    const info = record(hotel.hotel_info);
    const location = text(info?.location);
    const city = cityFrom(location, cityHint);
    const hotelBenefits = stringList(info?.benefits);
    const image = photos(info?.images);
    const gallery = imageList(info?.images);
    const context = {
      hotelId: integer(hotel.hotel_id),
      description: text(info?.description),
      images: gallery,
      coords: coordsOf(info?.coords),
      footnotes: benefitLines(stringList(info?.benefits_footnotes)),
    };
    const rooms = Array.isArray(hotel.room_types) ? hotel.room_types : [];
    let emitted = false;
    for (const roomRow of rooms) {
      const room = record(roomRow);
      if (!room) continue;
      const roomName = text(room.name) || null;
      const roomImage = photos(room.images);
      const roomGallery = imageList(room.images);
      const rates = Array.isArray(room.rates) ? room.rates : [];
      for (const rateRow of rates) {
        const rate = record(rateRow);
        if (!rate) continue;
        const benefits = benefitLines([
          ...hotelBenefits,
          ...stringList(rate.benefits),
          ...stringList(rate.additional_benefits),
        ]);
        const title = text(rate.title);
        pushOffer(out, {
          ...context,
          name,
          city,
          room: roomName,
          photoUrl: roomImage.photoUrl || image.photoUrl || gallery[0] || null,
          thumbUrl: roomImage.thumbUrl || image.thumbUrl,
          images: roomGallery.length ? roomGallery : gallery,
          benefits,
          footnotes: benefitLines([...context.footnotes, ...stringList(rate.benefits_footnotes)]),
          rate,
          freeCancellation: rate.can_cancel === true || CANCEL_TEXT.test(text(rate.cancellation_policy)),
          roomKey: roomName ? keyPart(roomName) : "",
          rateKey: text(rate.rate_index).slice(0, 80) || keyPart(`${title}-${priceKey(rate)}`),
          rateTitle: title,
          cancellation: text(rate.cancellation_policy),
        });
        emitted = true;
      }
    }
    if (emitted) continue;
    const lowest = record(hotel.lowest_rate);
    pushOffer(out, {
      ...context,
      name,
      city,
      room: null,
      photoUrl: image.photoUrl || gallery[0] || null,
      thumbUrl: image.thumbUrl,
      benefits: benefitLines(hotelBenefits),
      rate: lowest,
      freeCancellation: false,
    });
  }
  return out;
}

const CANCEL_TEXT = /free cancellation|annulation gratuite/i;

export type LeHotelProfile = {
  name: string;
  description: string;
  address: string;
  location: string;
  amenities: string[];
  sections: { title: string; lines: string[] }[];
  benefits: string[];
  footnotes: string[];
  images: string[];
  coords: { lat: number; lng: number } | null;
  checkInTime: string;
  checkOutTime: string;
  funFact: string;
};

function linesOf(value: unknown) {
  return stringList(value).slice(0, 8);
}

/** Fiche hôtel publique. Téléphone et e-mail ne sont pas lus. */
export function profileFromLeHotel(payload: unknown): LeHotelProfile {
  const row = record(payload);
  const short = record(row?.short_info);
  const lat = numberOf(row?.latitude);
  const lng = numberOf(row?.longitude);
  const sections = Array.isArray(row?.hotel_information) ? row.hotel_information : [];
  return {
    name: text(row?.name),
    description: text(row?.description).slice(0, 1600),
    address: text(row?.address),
    location: text(row?.location),
    amenities: linesOf(row?.amenities).slice(0, 24),
    sections: sections
      .map((entry) => {
        const item = record(entry);
        const title = text(item?.title);
        const lines = linesOf(item?.description);
        return title && lines.length ? { title, lines } : null;
      })
      .filter((entry): entry is { title: string; lines: string[] } => Boolean(entry))
      .slice(0, 6),
    benefits: benefitLines(stringList(row?.benefits)),
    footnotes: benefitLines(stringList(row?.benefits_footnotes)),
    images: imageList(row?.images),
    coords: lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null,
    checkInTime: text(short?.check_in_time),
    checkOutTime: text(short?.check_out_time),
    funFact: text(row?.fun_fact).slice(0, 280),
  };
}
