import { detailList, detailStr, hotelRooms, nightsBetween } from "@/lib/crm/carnet";
import type { CrmBookingItem } from "@/lib/crm/types";

/** Catalogue public Little Emperors : les photos de chambre sont dans `images_gallery`, pas dans la réservation. */
export const LE_PUBLIC_HOTEL = "https://api.littleemperors.com/api/hotels";

const PHOTO_CAP = 8;
/** Mots de structure. King, Twin, Queen et Double restent : ils séparent deux catégories. */
const GENERIC = new Set(["room", "rooms", "chambre", "bed", "beds", "bedroom"]);
const ROOMISH =
  /\b(room|rooms|chambre|suite|suites|villa|villas|king|queen|twin|twins|double|doubles|deluxe|superior|premier|studio|bedroom|loft|penthouse)\b/;
const HOTEL_SPACE =
  /^(exterior|exterieur|lobby|hall|reception|swimming pool|pool|piscine|beach|plage|garden|jardin|spa|facade|facade hotel)$/;
const SPACE_RANK = ["exterior", "exterieur", "facade", "lobby", "hall", "reception", "garden", "jardin", "beach", "plage", "spa", "piscine", "pool", "swimming pool"];

export type HotelPhoto = {
  url: string;
  thumb: string;
  caption: string;
  kind: "room" | "hotel";
};

export type HotelPresentation = {
  photos: HotelPhoto[];
  check_in_time: string | null;
  check_out_time: string | null;
  address: string | null;
};

export type LeStayFacts = {
  hotel_id: number | null;
  confirmation_number: string | null;
  check_in: string | null;
  check_out: string | null;
  address: string | null;
  room_types: string[];
  conditions: string[];
  guest_names: string[];
  benefits: string[];
};

export type HotelFact =
  | { label: string; value: string }
  | { label: string; lines: string[] };

type HotelLike = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

function asItem(item: HotelLike): CrmBookingItem {
  return item as unknown as CrmBookingItem;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Heure réelle HH:mm. Minuit vide n’est pas une heure d’hôtel. */
export function stayClock(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  if (hour === 0 && minute === 0) return "";
  return `${String(hour).padStart(2, "0")}h${match[2]}`;
}

export function clockStorage(value: string | null | undefined) {
  const shown = stayClock(value);
  if (!shown) return null;
  return shown.replace("h", ":");
}

/** URL https sans identifiant. Le catalogue LE reste sur son CDN. */
export function safePhotoUrl(value: unknown, hosts?: string[]) {
  const raw = text(value);
  if (!raw || raw.length > 500) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (hosts?.length && !hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return "";
  return url.toString();
}

const LE_PHOTO_HOSTS = ["cloudfront.net", "littleemperors.com"];

function lePhotoUrl(value: unknown) {
  return safePhotoUrl(value, LE_PHOTO_HOSTS);
}

function roomNamesOf(item: HotelLike) {
  const names = hotelRooms(asItem(item))
    .map((room) => room.room)
    .filter(Boolean);
  const single = detailStr(asItem(item), "room");
  if (single && !names.includes(single)) names.unshift(single);
  return names;
}

/** Catégorie, une fois retirés Room / chambre / bed et les chiffres. Le type de lit reste. */
export function categoryKey(value: string) {
  return fold(value)
    .split(" ")
    .filter((token) => token && !GENERIC.has(token) && !/^\d+$/.test(token))
    .join(" ");
}

/**
 * Même catégorie. La casse et le mot Room ne comptent pas.
 * King, Twin, Queen ou Double comptent : Terrace Queen n’est pas Terrace King,
 * et Deluxe Room n’est pas un Deluxe Marina Bay King.
 */
export function roomCaptionMatches(booked: string, caption: string) {
  const left = categoryKey(booked);
  const right = categoryKey(caption);
  if (!left || !right) return false;
  return left === right;
}

function unique(lines: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const key = fold(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

type GalleryImage = { url: string; thumb: string; caption: string };

function galleryImages(row: Record<string, unknown>): GalleryImage[] {
  const images: GalleryImage[] = [];
  const gallery = Array.isArray(row.images_gallery) ? row.images_gallery : [];
  for (const entry of gallery) {
    const item = record(entry);
    if (!item) continue;
    const url = lePhotoUrl(item.image_url || item.url);
    if (!url) continue;
    images.push({
      url,
      thumb: lePhotoUrl(item.thumbnail_url) || url,
      caption: text(item.description),
    });
  }
  if (images.length) return images;
  const plain = Array.isArray(row.images) ? row.images : [];
  for (const entry of plain) {
    const url = lePhotoUrl(typeof entry === "string" ? entry : record(entry)?.url);
    if (url) images.push({ url, thumb: url, caption: "" });
  }
  return images;
}

function childRoomNames(row: Record<string, unknown>) {
  const rooms = Array.isArray(row.child_rooms) ? row.child_rooms : [];
  return rooms
    .map((entry) => text(record(entry)?.name))
    .filter(Boolean);
}

function isOtherRoom(caption: string, booked: string[], catalogRooms: string[]) {
  if (!caption) return false;
  if (booked.some((room) => roomCaptionMatches(room, caption))) return false;
  return catalogRooms.some((room) => roomCaptionMatches(room, caption) || fold(room) === fold(caption));
}

function looksLikeRoom(caption: string) {
  return ROOMISH.test(fold(caption));
}

function hotelFallback(images: GalleryImage[], booked: string[], catalogRooms: string[]) {
  const spaces: GalleryImage[] = [];
  const atmosphere: GalleryImage[] = [];
  for (const image of images) {
    if (!image.caption) continue;
    if (booked.some((room) => roomCaptionMatches(room, image.caption))) continue;
    if (isOtherRoom(image.caption, booked, catalogRooms) || looksLikeRoom(image.caption)) continue;
    if (HOTEL_SPACE.test(fold(image.caption))) spaces.push(image);
    else atmosphere.push(image);
  }
  const picked = [...spaces, ...atmosphere].sort((a, b) => spaceRank(a.caption) - spaceRank(b.caption));
  return dedupePhotos(picked, "hotel", PHOTO_CAP);
}

function spaceRank(caption: string) {
  const folded = fold(caption);
  const index = SPACE_RANK.findIndex((word) => folded === word || folded.includes(word));
  return index === -1 ? SPACE_RANK.length : index;
}

function dedupePhotos(images: GalleryImage[], kind: HotelPhoto["kind"], cap: number) {
  const seen = new Set<string>();
  const photos: HotelPhoto[] = [];
  for (const image of images) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    photos.push({ url: image.url, thumb: image.thumb || image.url, caption: image.caption, kind });
    if (photos.length >= cap) break;
  }
  return photos;
}

function withHotelAfter(room: HotelPhoto[], hotel: HotelPhoto[]) {
  const photos = [...room];
  const seen = new Set(room.map((photo) => photo.url));
  for (const photo of hotel) {
    if (photos.length >= PHOTO_CAP || seen.has(photo.url)) continue;
    seen.add(photo.url);
    photos.push(photo);
  }
  return photos;
}

function clockFromShortInfo(row: Record<string, unknown>, key: string) {
  const info = record(row.short_info);
  if (!info) return null;
  return clockStorage(text(info[key]));
}

/**
 * D’abord toutes les photos de la catégorie réservée, puis l’hôtel.
 * Une autre catégorie ne compte pas, même si seul le lit change
 * (Deluxe Room pour un Deluxe Marina Bay King, Terrace King pour une Terrace Queen).
 * Sans photo de cette catégorie, façade et hall avant la piscine.
 */
export function presentationFromLeHotel(payload: unknown, roomNames: string[]): HotelPresentation {
  const row = record(payload) || {};
  const images = galleryImages(row);
  const catalogRooms = childRoomNames(row);
  const booked = unique(roomNames);
  const exact = images.filter((image) => booked.some((room) => roomCaptionMatches(room, image.caption)));
  const roomPhotos = dedupePhotos(exact, "room", PHOTO_CAP);
  const hotelPhotos = hotelFallback(images, booked, catalogRooms);
  return {
    photos: roomPhotos.length ? withHotelAfter(roomPhotos, hotelPhotos) : hotelPhotos,
    check_in_time: clockFromShortInfo(row, "check_in_time"),
    check_out_time: clockFromShortInfo(row, "check_out_time"),
    address: text(row.address) || null,
  };
}

export type BenefitTone = "upgrade" | "breakfast" | "credit" | "schedule" | "night" | "gift";

export type BenefitLine = { title: string; note: string; tone: BenefitTone };

/** Titre court et réserve (« sous réserve », exclusions) à part. */
export function benefitLine(raw: string): BenefitLine {
  const line = raw.replace(/\s+/g, " ").trim();
  const dash = line.split(/\s+—\s+/);
  let title = line;
  let note = "";
  if (dash.length > 1) {
    title = dash[0].trim();
    note = dash.slice(1).join(" — ").trim();
  } else {
    const caveat = line.match(/^(.*?)(?:,\s*|\s+)(sous réserve\b.*|hors dates\b.*|subject to\b.*)$/i);
    if (caveat && caveat[1].trim().length > 3) {
      title = caveat[1].trim();
      note = caveat[2].trim();
    }
  }
  const folded = fold(title);
  let tone: BenefitTone = "gift";
  if (/surclass|upgrade/.test(folded)) tone = "upgrade";
  else if (/petit dejeuner|breakfast|repas/.test(folded)) tone = "breakfast";
  else if (/credit/.test(folded)) tone = "credit";
  else if (/enregistrement|depart|arrivee|check/.test(folded)) tone = "schedule";
  else if (/nuit/.test(folded)) tone = "night";
  return { title, note, tone };
}

export function storedHotelPhotos(details: Record<string, unknown> | null | undefined): HotelPhoto[] {
  const raw = details?.photos;
  if (!Array.isArray(raw)) return [];
  const photos: HotelPhoto[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const url = safePhotoUrl(entry);
      if (url) photos.push({ url, thumb: url, caption: "", kind: "hotel" });
      continue;
    }
    const item = record(entry);
    if (!item) continue;
    const url = safePhotoUrl(item.url);
    if (!url) continue;
    const kind = item.kind === "room" ? "room" : "hotel";
    photos.push({
      url,
      thumb: safePhotoUrl(item.thumb) || url,
      caption: text(item.caption).slice(0, 120),
      kind,
    });
    if (photos.length >= PHOTO_CAP) break;
  }
  return photos;
}

function hotelIdOf(item: HotelLike) {
  const value = item.details?.le_hotel_id;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function day(value: string | null | undefined) {
  return (value || "").slice(0, 10);
}

/** Une réservation LE pour cette carte : même hôtel, et la confirmation ou les dates. */
export function pickLeStay<T extends LeStayFacts>(item: HotelLike, rows: T[]): T | null {
  const hotelId = hotelIdOf(item);
  if (hotelId == null) return null;
  const sameHotel = rows.filter((row) => row.hotel_id === hotelId);
  if (!sameHotel.length) return null;
  const ref = fold(item.confirmation_ref || "");
  if (ref) {
    const byRef = sameHotel.filter((row) => {
      const confirmation = fold(row.confirmation_number || "");
      return confirmation && (ref.includes(confirmation) || confirmation.includes(ref));
    });
    if (byRef.length === 1) return byRef[0];
  }
  const start = day(item.start_at);
  const end = day(item.end_at);
  if (start) {
    const byDate = sameHotel.filter((row) => {
      if (row.check_in && start === row.check_in) return true;
      if (!row.check_in || !row.check_out || !end) return false;
      return start < row.check_out && end > row.check_in;
    });
    if (byDate.length === 1) return byDate[0];
    if (sameHotel.some((row) => row.check_in)) return null;
  }
  return sameHotel.length === 1 ? sameHotel[0] : null;
}

const NAME_STOP = new Set(["hotel", "the", "and", "resort", "spa", "collection", "by", "ihg"]);

/** Le catalogue ne s’applique pas à un autre hôtel qui porterait le même identifiant. */
export function catalogNameAgrees(itemName: string, catalogName: string) {
  const left = fold(itemName);
  const right = fold(catalogName);
  if (!left || !right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const tokens = (value: string) => value.split(" ").filter((token) => token.length > 3 && !NAME_STOP.has(token));
  const catalogTokens = new Set(tokens(right));
  return tokens(left).some((token) => catalogTokens.has(token));
}

export function roomsFromStay(roomTypes: string[], guestNames: string[], confirmation: string | null) {
  const types = roomTypes.map((type) => type.trim()).filter(Boolean);
  const names = unique(guestNames);
  return types.map((type, index) => ({
    room: null as string | null,
    type,
    guests: names.length === types.length ? names[index] : null,
    confirmation_ref: confirmation,
  }));
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

/** Complète la carte avec la réservation LE déjà stockée. N’écrase pas une saisie, n’écrit aucun coût. */
export function applyLeStayFacts<T extends HotelLike>(item: T, stay: LeStayFacts | null): T {
  if (!stay || item.kind !== "hotel") return item;
  const details = { ...(item.details || {}) };
  if (stay.address) {
    const current = text(details.address);
    const extra = current.startsWith(stay.address) ? current.slice(stay.address.length).trim() : "";
    const extraIsRoom = extra && stay.room_types.some((type) => fold(type) === fold(extra));
    if (!current || extraIsRoom) details.address = stay.address;
  }
  if (!stringList(details.conditions).length && !text(details.notes) && stay.conditions.length) {
    details.conditions = unique(stay.conditions);
  }
  if (!stringList(details.included).length && stay.benefits.length) details.included = unique(stay.benefits);
  const rooms = hotelRooms(asItem(item));
  const hasGuests = rooms.some((room) => room.guests) || text(details.guests);
  if (!rooms.length && stay.room_types.length) {
    details.rooms = roomsFromStay(stay.room_types, stay.guest_names, stay.confirmation_number);
  } else if (!hasGuests && stay.guest_names.length) {
    const names = unique(stay.guest_names);
    if (names.length === 1 || names.length !== rooms.length) details.guests = names.join(", ");
    else if (Array.isArray(details.rooms)) {
      details.rooms = (details.rooms as Record<string, unknown>[]).map((room, index) => ({
        ...room,
        guests: names[index] || null,
      }));
    }
  }
  if (!details.source_family) details.source_family = "little_emperors";
  return { ...item, details };
}

/** Photos et heures du catalogue. Une galerie déjà posée (saisie ou outil) reste. */
export function applyHotelPresentation<T extends HotelLike>(item: T, presentation: HotelPresentation): T {
  if (item.kind !== "hotel") return item;
  const details = { ...(item.details || {}) };
  if (!storedHotelPhotos(details).length && presentation.photos.length) {
    details.photos = presentation.photos;
  }
  if (!text(details.check_in_time) && presentation.check_in_time) details.check_in_time = presentation.check_in_time;
  if (!text(details.check_out_time) && presentation.check_out_time) details.check_out_time = presentation.check_out_time;
  if (!text(details.address) && presentation.address) details.address = presentation.address;
  return { ...item, details };
}

export function hotelPhotos(item: HotelLike) {
  return storedHotelPhotos(item.details);
}

function benefitsLabel(item: HotelLike) {
  const family = text(item.details?.source_family);
  const supplier = (item.supplier || "").toLowerCase();
  if (family === "little_emperors" || supplier.includes("little emperor")) return "Avantages";
  return "Inclus";
}

function roomSummary(item: HotelLike) {
  const labels = hotelRooms(asItem(item))
    .map((room) => room.room)
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
  return [...counts.entries()].map(([label, count]) => (count > 1 ? `${label} × ${count}` : label)).join(" · ");
}

/** Nom de chambre sur la carte : la réservation, sinon la légende d’une photo de chambre. */
export function hotelRoomLine(item: HotelLike, photos: HotelPhoto[] = []) {
  const booked = roomSummary(item);
  if (booked) return booked;
  return photos.find((photo) => photo.kind === "room" && photo.caption)?.caption || "";
}

/** Pastille de la vignette. « 1 photo », « 12 photos ». */
export function photoCountLabel(count: number) {
  const n = Math.max(0, Math.floor(count));
  return `${n} photo${n > 1 ? "s" : ""}`;
}

function guestSummary(item: HotelLike) {
  const fromRooms = unique(hotelRooms(asItem(item)).map((room) => room.guests));
  if (fromRooms.length) return fromRooms.join(", ");
  return detailStr(asItem(item), "guests");
}

/** Faits utiles de la carte. Jamais le coût, la marge ni la commission. */
export function hotelStayFacts(item: HotelLike): HotelFact[] {
  if (item.kind !== "hotel") return [];
  const facts: HotelFact[] = [];
  const room = roomSummary(item);
  if (room) facts.push({ label: "Chambre", value: room });
  const board = detailStr(asItem(item), "board");
  if (board) facts.push({ label: "Pension", value: board });
  const guests = guestSummary(item);
  if (guests) facts.push({ label: "Voyageurs", value: guests });
  const nights = nightsBetween(item.start_at || null, item.end_at || null);
  if (nights) facts.push({ label: "Nuits", value: `${nights} nuit${nights > 1 ? "s" : ""}` });
  const arrive = stayClock(detailStr(asItem(item), "check_in_time"));
  const leave = stayClock(detailStr(asItem(item), "check_out_time"));
  if (arrive) facts.push({ label: "Arrivée", value: arrive });
  if (leave) facts.push({ label: "Départ", value: leave });
  const address = detailStr(asItem(item), "address");
  if (address) facts.push({ label: "Adresse", value: address });
  const included = detailList(asItem(item), "included");
  if (included.length) facts.push({ label: benefitsLabel(item), lines: included });
  const conditions = detailList(asItem(item), "conditions");
  const notes = detailStr(asItem(item), "notes");
  if (conditions.length) facts.push({ label: "Annulation", lines: conditions });
  else if (notes) facts.push({ label: "Annulation", value: notes });
  return facts;
}

const GALLERY_TTL_MS = 10 * 60 * 1000;
const galleryCache = new Map<number, { at: number; payload: unknown | null }>();

async function loadLeHotelPayload(hotelId: number, fetchImpl?: typeof fetch) {
  const cached = galleryCache.get(hotelId);
  if (cached && Date.now() - cached.at < GALLERY_TTL_MS) return cached.payload;
  const fetchFn = fetchImpl || fetch;
  try {
    const response = await fetchFn(`${LE_PUBLIC_HOTEL}/${hotelId}`, {
      headers: { Accept: "application/json", "App-Version": "Website" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      galleryCache.set(hotelId, { at: Date.now(), payload: null });
      return null;
    }
    const payload = (await response.json()) as unknown;
    galleryCache.set(hotelId, { at: Date.now(), payload });
    return payload;
  } catch {
    return null;
  }
}

function needsCatalog(item: HotelLike) {
  if (item.kind !== "hotel" || hotelIdOf(item) == null) return false;
  const details = item.details || {};
  return !storedHotelPhotos(details).length || !text(details.check_in_time) || !text(details.address);
}

/** Galerie et heures, en mémoire, pour les cartes qui ont déjà l’identifiant hôtel. */
export async function attachHotelGallery<T extends HotelLike>(items: T[], fetchImpl?: typeof fetch): Promise<T[]> {
  const ids = [
    ...new Set(items.filter(needsCatalog).map(hotelIdOf).filter((id): id is number => id != null)),
  ];
  if (!ids.length) return items;
  const payloads = new Map<number, unknown | null>();
  await Promise.all(
    ids.map(async (id) => {
      payloads.set(id, await loadLeHotelPayload(id, fetchImpl));
    })
  );
  return items.map((item) => {
    const id = hotelIdOf(item);
    if (id == null) return item;
    const payload = payloads.get(id);
    if (!payload) return item;
    const catalogName = text(record(payload)?.name);
    const itemName = text(item.details?.hotel_name) || text(item.title);
    if (!catalogNameAgrees(itemName, catalogName)) return item;
    return applyHotelPresentation(item, presentationFromLeHotel(payload, roomNamesOf(item)));
  });
}

export function clearHotelGalleryCache() {
  galleryCache.clear();
}
