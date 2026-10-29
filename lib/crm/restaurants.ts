import { zoneOffsetMinutes } from "./airport-time";
import { cityPlaceKey } from "./city-names";
import { looksLikePan, redactPans } from "./pan";
import { fold } from "./text";

/** Compte de réservation par défaut. */
export const RESTAURANT_ACCOUNT = "concierge@travelba.fr";

/** Toutes les tables sont pour deux. Le nombre de voyageurs ne s’en mêle pas. */
export const RESTAURANT_COVERS = 2;

/** Heure locale pré-remplie. On la change table par table si besoin. */
export const RESTAURANT_DEFAULT_TIME = "20:30";

export const RESTAURANT_CATEGORIES = ["japonais", "italien", "francais", "festif", "enfants", "terrasse"] as const;

export const RESTAURANT_PLATFORMS = [
  "resy",
  "opentable",
  "sevenrooms",
  "thefork",
  "zenchef",
  "telephone",
  "whatsapp",
  "formulaire",
] as const;

export const TABLE_STATUSES = [
  "a_reserver",
  "reservee",
  "proposee",
  "choisie",
  "a_annuler",
  "annulee",
  "echec",
] as const;

export const EXCLUSION_REASONS = ["ferme", "gastronomique", "prepaiement"] as const;

export type RestaurantPlatform = (typeof RESTAURANT_PLATFORMS)[number];
export type TableStatus = (typeof TABLE_STATUSES)[number];
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];
export type BotReservable = "oui" | "partiel" | "non";
export type RestaurantChoice = "A" | "B" | "aucune";
export type TableSeat = "A" | "B";

export type AnnualClosure = { from: string; to: string };

export type RestaurantRecord = {
  id: string;
  name: string;
  city: string;
  cityKey: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  website: string;
  categories: string[];
  platform: RestaurantPlatform | null;
  bookingUrl: string;
  bot: BotReservable;
  guaranteeCard: boolean;
  cancelHours: number | null;
  cancelFeeCents: number | null;
  closedWeekdays: number[];
  annualClosures: AnnualClosure[];
  status: "actif" | "exclu";
  exclusionReason: ExclusionReason | null;
  starred: boolean;
  prepaidRequired: boolean;
  note: string;
  photoUrls: string[];
  menuPhotoUrl: string;
  signaturePhotoUrl: string;
  pitch: string;
  priceBand: string;
  placeUrl: string;
};

export type CatalogDraft = Omit<RestaurantRecord, "id">;

const CATEGORY_LABELS: Record<string, string> = {
  japonais: "Japonais",
  italien: "Italien",
  francais: "Français",
  festif: "Festif",
  enfants: "Enfants",
  terrasse: "Terrasse",
};

const PLATFORM_LABELS: Record<RestaurantPlatform, string> = {
  resy: "Resy",
  opentable: "OpenTable",
  sevenrooms: "SevenRooms",
  thefork: "TheFork",
  zenchef: "Zenchef",
  telephone: "Téléphone",
  whatsapp: "WhatsApp",
  formulaire: "Formulaire",
};

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  a_reserver: "À réserver",
  reservee: "Réservée",
  proposee: "Proposée",
  choisie: "Choisie",
  a_annuler: "À annuler",
  annulee: "Annulée",
  echec: "Échec",
};

const BLOCKED_CATEGORIES = new Set(["gastronomique", "etoile", "etoile-michelin", "michelin"]);

/** Villes ramenées à un fuseau IANA. La clé est `cityPlaceKey`. */
const CITY_ZONES: Record<string, string> = {
  paris: "Europe/Paris",
  nice: "Europe/Paris",
  cannes: "Europe/Paris",
  antibes: "Europe/Paris",
  monaco: "Europe/Monaco",
  lyon: "Europe/Paris",
  marseille: "Europe/Paris",
  bordeaux: "Europe/Paris",
  avoriaz: "Europe/Paris",
  london: "Europe/London",
  amsterdam: "Europe/Amsterdam",
  brussels: "Europe/Brussels",
  geneva: "Europe/Zurich",
  zurich: "Europe/Zurich",
  zermatt: "Europe/Zurich",
  lugano: "Europe/Zurich",
  vienne: "Europe/Vienna",
  vienna: "Europe/Vienna",
  rome: "Europe/Rome",
  milan: "Europe/Rome",
  venice: "Europe/Rome",
  florence: "Europe/Rome",
  barcelona: "Europe/Madrid",
  madrid: "Europe/Madrid",
  lisbon: "Europe/Lisbon",
  lamego: "Europe/Lisbon",
  santorin: "Europe/Athens",
  athens: "Europe/Athens",
  istanbul: "Europe/Istanbul",
  prague: "Europe/Prague",
  budapest: "Europe/Budapest",
  dubrovnik: "Europe/Zagreb",
  moscow: "Europe/Moscow",
  marrakech: "Africa/Casablanca",
  casablanca: "Africa/Casablanca",
  "le caire": "Africa/Cairo",
  cairo: "Africa/Cairo",
  "tel aviv": "Asia/Jerusalem",
  jerusalem: "Asia/Jerusalem",
  dubai: "Asia/Dubai",
  petra: "Asia/Amman",
  tokyo: "Asia/Tokyo",
  kyoto: "Asia/Tokyo",
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  bali: "Asia/Makassar",
  bangkok: "Asia/Bangkok",
  phuket: "Asia/Bangkok",
  agra: "Asia/Kolkata",
  male: "Indian/Maldives",
  maldives: "Indian/Maldives",
  seychelles: "Indian/Mahe",
  mahe: "Indian/Mahe",
  sydney: "Australia/Sydney",
  "new york": "America/New_York",
  miami: "America/New_York",
  banff: "America/Edmonton",
  havane: "America/Havana",
  "panama city": "America/Panama",
  "machu picchu": "America/Lima",
  rio: "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires",
};

const COUNTRY_ZONES: Record<string, string> = {
  fr: "Europe/Paris",
  france: "Europe/Paris",
  it: "Europe/Rome",
  italie: "Europe/Rome",
  italy: "Europe/Rome",
  es: "Europe/Madrid",
  espagne: "Europe/Madrid",
  pt: "Europe/Lisbon",
  portugal: "Europe/Lisbon",
  gb: "Europe/London",
  uk: "Europe/London",
  "royaume uni": "Europe/London",
  th: "Asia/Bangkok",
  thailande: "Asia/Bangkok",
  thailand: "Asia/Bangkok",
  jp: "Asia/Tokyo",
  japon: "Asia/Tokyo",
  il: "Asia/Jerusalem",
  israel: "Asia/Jerusalem",
  ae: "Asia/Dubai",
  "emirats arabes unis": "Asia/Dubai",
  mv: "Indian/Maldives",
  sc: "Indian/Mahe",
  ma: "Africa/Casablanca",
  maroc: "Africa/Casablanca",
  us: "America/New_York",
  "etats unis": "America/New_York",
  gr: "Europe/Athens",
  grece: "Europe/Athens",
};

export function isFormError<T>(value: T | { error: string }): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export function validTimeZone(value: string | null | undefined): string | null {
  const zone = (value || "").trim();
  if (!zone.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export function categoryLabel(slug: string) {
  return CATEGORY_LABELS[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function platformLabel(platform: RestaurantPlatform | null) {
  return platform ? PLATFORM_LABELS[platform] : "";
}

export type RestaurantPart = "intro" | "A" | "B";

/** Un pré-message, puis un carrousel par table. L’ancien message unique n’est plus la clé. */
export function restaurantDedupeKey(bookingId: string, eveningDate: string, part: RestaurantPart) {
  return `restaurant:${bookingId}:${eveningDate}:${part}`;
}

export function restaurantPartFromKey(key: string | null | undefined): RestaurantPart | null {
  const part = (key || "").split(":").pop();
  if (part === "intro" || part === "A" || part === "B") return part;
  return null;
}

/** Distance en kilomètres. Les restaurants proches passent devant. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceKm(km: number | null) {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Gastronomique, étoilé ou prépaiement : la sélection est bloquée. */
export function selectionBlock(row: {
  status: "actif" | "exclu";
  exclusionReason: ExclusionReason | null;
  starred: boolean;
  prepaidRequired: boolean;
  categories: string[];
}): string | null {
  if (row.starred || row.exclusionReason === "gastronomique" || row.categories.some((item) => BLOCKED_CATEGORIES.has(item))) {
    return "Gastronomique ou étoilé, hors sélection.";
  }
  if (row.prepaidRequired || row.exclusionReason === "prepaiement") {
    return "Prépaiement obligatoire, hors sélection.";
  }
  if (row.status === "exclu" || row.exclusionReason === "ferme") {
    return row.exclusionReason === "ferme" ? "Fermé, hors sélection." : "Exclu du catalogue.";
  }
  return null;
}

export function isoWeekday(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utc.getTime())) return null;
  const sunday = utc.getUTCDay();
  return sunday === 0 ? 7 : sunday;
}

export function closedOn(
  row: { closedWeekdays: number[]; annualClosures: AnnualClosure[] },
  isoDate: string
) {
  const weekday = isoWeekday(isoDate);
  if (weekday && row.closedWeekdays.includes(weekday)) return true;
  const monthDay = isoDate.slice(5, 10);
  if (!/^\d{2}-\d{2}$/.test(monthDay)) return false;
  return row.annualClosures.some((span) => {
    if (!/^\d{2}-\d{2}$/.test(span.from) || !/^\d{2}-\d{2}$/.test(span.to)) return false;
    if (span.from <= span.to) return monthDay >= span.from && monthDay <= span.to;
    return monthDay >= span.from || monthDay <= span.to;
  });
}

export type RankedRestaurant = {
  id: string;
  name: string;
  categories: string[];
  distanceKm: number | null;
  featured: boolean;
  blocked: string | null;
};

function byDistance(a: RankedRestaurant, b: RankedRestaurant) {
  if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name, "fr");
  if (a.distanceKm == null) return 1;
  if (b.distanceKm == null) return -1;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.name.localeCompare(b.name, "fr");
}

/** Actifs de la ville, du plus proche au plus loin. Deux mis en avant par catégorie. */
export function rankRestaurants(
  rows: Pick<
    RestaurantRecord,
    "id" | "name" | "city" | "lat" | "lng" | "categories" | "status" | "exclusionReason" | "starred" | "prepaidRequired"
  >[],
  hotel: { city: string; lat: number | null; lng: number | null }
): RankedRestaurant[] {
  const city = cityPlaceKey(hotel.city);
  if (!city) return [];
  const ranked: RankedRestaurant[] = [];
  for (const row of rows) {
    if (row.status !== "actif" && selectionBlock(row) == null) continue;
    if (cityPlaceKey(row.city) !== city) continue;
    if (row.status !== "actif") continue;
    const blocked = selectionBlock(row);
    let distanceKm: number | null = null;
    if (
      hotel.lat != null &&
      hotel.lng != null &&
      row.lat != null &&
      row.lng != null &&
      Math.abs(hotel.lat) <= 90 &&
      Math.abs(row.lat) <= 90
    ) {
      distanceKm = haversineKm({ lat: hotel.lat, lng: hotel.lng }, { lat: row.lat, lng: row.lng });
    }
    ranked.push({
      id: row.id,
      name: row.name,
      categories: row.categories,
      distanceKm,
      featured: false,
      blocked,
    });
  }
  const open = ranked.filter((row) => !row.blocked).sort(byDistance);
  const featured = new Set<string>();
  const seen = new Map<string, number>();
  for (const row of open) {
    for (const category of row.categories) {
      const count = seen.get(category) || 0;
      if (count >= 2) continue;
      seen.set(category, count + 1);
      featured.add(row.id);
    }
  }
  for (const row of open) row.featured = featured.has(row.id);
  const blocked = ranked.filter((row) => row.blocked).sort(byDistance);
  return [...open, ...blocked];
}

/** Mis en avant, puis les plus proches, et toujours le restaurant déjà choisi. */
export function suggestionWindow(ranked: RankedRestaurant[], selected: string[], limit = 24) {
  const keep = new Set(selected);
  const head = ranked.filter((row) => row.featured || keep.has(row.id));
  const tail = ranked.filter((row) => !row.featured && !keep.has(row.id)).slice(0, Math.max(0, limit - head.length));
  return [...head, ...tail];
}

/** Soirs du séjour : arrivée comprise, jour de départ exclu. Une seule date si le séjour tient sur un jour. */
export function stayNights(start: string | null | undefined, end: string | null | undefined) {
  const from = (start || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return [] as string[];
  const to = (end || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) return [from];
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  while (cursor < last && dates.length < 62) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates.length ? dates : [from];
}

export function fillNights(dates: string[]) {
  const unique = [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  if (!unique.length) return [] as string[];
  return stayNights(unique[0], addUtcDay(unique[unique.length - 1]));
}

function addUtcDay(iso: string) {
  const cursor = new Date(`${iso}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}

export type StayHotel = {
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  zone: string | null;
  start: string;
  end: string;
};

function detailString(details: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function detailNumber(details: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = details?.[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function hotelsFromItems(
  items: {
    kind?: string | null;
    title?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    lifecycle?: string | null;
    details?: Record<string, unknown> | null;
  }[]
): StayHotel[] {
  const hotels: StayHotel[] = [];
  for (const item of items) {
    if (item.kind !== "hotel") continue;
    if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") continue;
    const details = item.details || {};
    const start = (item.start_at || "").slice(0, 10);
    const end = (item.end_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    hotels.push({
      name: detailString(details, ["hotel_name"]) || (item.title || "").trim() || "Hôtel",
      city: detailString(details, ["city"]),
      country: detailString(details, ["country", "pays"]),
      lat: detailNumber(details, ["latitude", "lat"]),
      lng: detailNumber(details, ["longitude", "lng", "lon"]),
      zone: validTimeZone(detailString(details, ["timezone", "time_zone"])),
      start,
      end: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start,
    });
  }
  return hotels;
}

export function eveningsOfStay(
  hotels: StayHotel[],
  bookingStart: string | null | undefined,
  bookingEnd: string | null | undefined
) {
  const fromHotels = fillNights(hotels.flatMap((hotel) => stayNights(hotel.start, hotel.end)));
  if (fromHotels.length) return fromHotels;
  return stayNights(bookingStart, bookingEnd);
}

export function hotelForEvening(hotels: StayHotel[], isoDate: string): StayHotel | null {
  const covering = hotels.filter((hotel) => isoDate >= hotel.start && isoDate < (hotel.end > hotel.start ? hotel.end : addUtcDay(hotel.start)));
  if (!covering.length) return hotels[0] || null;
  return covering.find((hotel) => hotel.lat != null && hotel.lng != null) || covering[0];
}

export function timezoneForStay(input: {
  stored?: string | null;
  hotelZone?: string | null;
  city?: string | null;
  country?: string | null;
}): { zone: string | null; source: "dossier" | "hotel" | "ville" | null } {
  const stored = validTimeZone(input.stored);
  if (stored) return { zone: stored, source: "dossier" };
  const hotel = validTimeZone(input.hotelZone);
  if (hotel) return { zone: hotel, source: "hotel" };
  const city = input.city ? CITY_ZONES[cityPlaceKey(input.city)] : null;
  if (city && validTimeZone(city)) return { zone: city, source: "ville" };
  const countryKey = fold(input.country || "").replace(/[^a-z]+/g, " ").trim();
  const country = COUNTRY_ZONES[countryKey] || COUNTRY_ZONES[countryKey.replace(/ /g, "")];
  if (country && validTimeZone(country)) return { zone: country, source: "ville" };
  return { zone: null, source: null };
}

/** Instant UTC de une heure civile dans le fuseau. */
export function zonedInstant(isoDate: string, hour: number, minute: number, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !validTimeZone(timeZone)) return null;
  const clock = `${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const offset = zoneOffsetMinutes(clock, timeZone);
  if (offset == null) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000;
}

export function localClock(now: Date, timeZone: string) {
  if (!validTimeZone(timeZone)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    let hour = Number(pick("hour"));
    if (hour === 24) hour = 0;
    const minute = Number(pick("minute"));
    const isoDate = `${pick("year")}-${pick("month")}-${pick("day")}`;
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    return { hour, minute, isoDate };
  } catch {
    return null;
  }
}

/** Fenêtre fixe : envoi à partir de 16 h, plus rien à 18 h. */
export function inChoiceWindow(now: Date, eveningDate: string, timeZone: string) {
  const start = zonedInstant(eveningDate, 16, 0, timeZone);
  const end = zonedInstant(eveningDate, 18, 0, timeZone);
  if (start == null || end == null) return false;
  const at = now.getTime();
  return at >= start && at < end;
}

/** À 18 h, et après si le passage a été manqué. */
export function inCloseWindow(now: Date, eveningDate: string, timeZone: string) {
  const end = zonedInstant(eveningDate, 18, 0, timeZone);
  if (end == null) return false;
  return now.getTime() >= end;
}

export function untreatedAfter1830(now: Date, eveningDate: string, timeZone: string) {
  const alert = zonedInstant(eveningDate, 18, 30, timeZone);
  if (alert == null) return false;
  return now.getTime() >= alert;
}

const OPENABLE = new Set<TableStatus>(["reservee", "proposee", "choisie"]);

/**
 * À 18 h : la table non choisie passe en a_annuler.
 * Sans réponse, ou « Aucune », les deux passent en a_annuler.
 * Une table pas encore réservée, en échec ou déjà annulée ne bouge pas.
 */
export function closeEveningTables(
  tables: { seat: TableSeat; status: TableStatus }[],
  choice: RestaurantChoice | null
): { seat: TableSeat; status: TableStatus }[] {
  return tables.map((table) => {
    if (!OPENABLE.has(table.status)) return table;
    if (choice === "A" || choice === "B") {
      return { seat: table.seat, status: table.seat === choice ? "choisie" : "a_annuler" };
    }
    return { seat: table.seat, status: "a_annuler" };
  });
}

export type DeskEvening = {
  bookingId: string;
  eveningDate: string;
  timezone: string | null;
  choice: RestaurantChoice | null;
  messageStatus: "aucun" | "en_file" | "envoye" | "echec";
  closed: boolean;
  canWhatsapp: boolean;
  tables: { seat: TableSeat; status: TableStatus; restaurantName: string | null }[];
  /** Déjà parti. Sans ce détail, un soir « envoyé » compte pour les trois messages. */
  partsSent?: { intro: boolean; A: boolean; B: boolean };
};

export type CronSend = {
  bookingId: string;
  eveningDate: string;
  part: RestaurantPart;
  mode: "send" | "queue";
};
export type CronClose = { bookingId: string; eveningDate: string; tables: { seat: TableSeat; status: TableStatus }[] };

const SENDABLE = new Set<TableStatus>(["reservee", "proposee"]);

function seatSend(row: DeskEvening, seat: TableSeat) {
  const table = row.tables.find((item) => item.seat === seat);
  return Boolean(table && SENDABLE.has(table.status) && table.restaurantName);
}

function bothSendable(row: DeskEvening) {
  return seatSend(row, "A") && seatSend(row, "B");
}

function sentParts(row: DeskEvening) {
  if (row.partsSent) return row.partsSent;
  const done = row.messageStatus === "envoye";
  return { intro: done, A: done, B: done };
}

/**
 * Pré-message d’abord, puis la fiche A, puis la fiche B.
 * Les carrousels n’entrent dans le plan que si le pré-message est déjà parti
 * ou part dans ce passage. À 18 h, la clôture ne change pas.
 */
export function planRestaurantCron(
  rows: DeskEvening[],
  now: Date,
  templateReady: boolean | { intro: boolean; carousel: boolean }
) {
  const flags = typeof templateReady === "boolean" ? { intro: templateReady, carousel: templateReady } : templateReady;
  const sends: CronSend[] = [];
  const closes: CronClose[] = [];
  for (const row of rows) {
    if (!row.timezone) continue;
    const sent = sentParts(row);
    const open = inChoiceWindow(now, row.eveningDate, row.timezone) && row.canWhatsapp && bothSendable(row);
    if (open) {
      const introThisRun = !sent.intro && flags.intro;
      if (!sent.intro) {
        sends.push({
          bookingId: row.bookingId,
          eveningDate: row.eveningDate,
          part: "intro",
          mode: flags.intro ? "send" : "queue",
        });
      }
      if (sent.intro || introThisRun) {
        for (const part of ["A", "B"] as const) {
          if (sent[part] || !seatSend(row, part)) continue;
          sends.push({
            bookingId: row.bookingId,
            eveningDate: row.eveningDate,
            part,
            mode: flags.carousel ? "send" : "queue",
          });
        }
      }
    }
    if (inCloseWindow(now, row.eveningDate, row.timezone) && !row.closed) {
      closes.push({
        bookingId: row.bookingId,
        eveningDate: row.eveningDate,
        tables: closeEveningTables(row.tables, row.choice),
      });
    }
  }
  return { sends, closes };
}

const REPLY_OPEN = new Set<TableStatus>(["reservee", "proposee", "choisie"]);
const REPLY_MOVABLE = new Set<TableStatus>(["reservee", "proposee", "choisie", "a_annuler"]);

/**
 * « J’accepte » choisit cette table et passe l’autre en à annuler.
 * « Je refuse » ne touche que la table cliquée. La clôture de 18 h reste à part.
 */
export function applySeatReply(
  tables: { seat: TableSeat; status: TableStatus }[],
  seat: TableSeat,
  reply: "accepte" | "refuse"
): { tables: { seat: TableSeat; status: TableStatus }[]; choice: RestaurantChoice | null } {
  const next = tables.map((table) => ({ ...table }));
  const target = next.find((table) => table.seat === seat);
  if (!target || !REPLY_MOVABLE.has(target.status)) return { tables: next, choice: null };
  if (reply === "accepte") {
    target.status = "choisie";
    for (const other of next) {
      if (other.seat !== seat && REPLY_OPEN.has(other.status)) other.status = "a_annuler";
    }
    return { tables: next, choice: seat };
  }
  if (!REPLY_OPEN.has(target.status)) return { tables: next, choice: null };
  target.status = "a_annuler";
  const leftover = next.some((table) => REPLY_OPEN.has(table.status));
  return { tables: next, choice: leftover ? null : "aucune" };
}

export type EveningAlert = "echec" | "ferme" | "sans_whatsapp" | "a_annuler" | "fuseau";

export const EVENING_ALERT_LABELS: Record<EveningAlert, string> = {
  echec: "Échec de réservation",
  ferme: "Restaurant fermé ce jour-là",
  sans_whatsapp: "Client sans numéro WhatsApp",
  a_annuler: "Annulation non traitée après 18 h 30",
  fuseau: "Fuseau inconnu",
};

export function eveningAlerts(input: {
  now: Date;
  eveningDate: string;
  timezone: string | null;
  hasPhone: boolean;
  tables: { status: TableStatus; restaurantClosed: boolean; cancelledAt: string | null }[];
}): EveningAlert[] {
  const alerts: EveningAlert[] = [];
  if (!input.timezone) alerts.push("fuseau");
  if (input.tables.some((table) => table.status === "echec")) alerts.push("echec");
  if (input.tables.some((table) => table.restaurantClosed && table.status !== "annulee" && table.status !== "a_reserver")) {
    alerts.push("ferme");
  }
  if (!input.hasPhone) alerts.push("sans_whatsapp");
  if (
    input.timezone &&
    untreatedAfter1830(input.now, input.eveningDate, input.timezone) &&
    input.tables.some((table) => table.status === "a_annuler" && !table.cancelledAt)
  ) {
    alerts.push("a_annuler");
  }
  return alerts;
}

export function formatEveningFr(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function clockLabel(time: string | null | undefined) {
  const match = (time || "").match(/^(\d{2}):(\d{2})/);
  if (!match) return "";
  return `${match[1]}h${match[2]}`;
}

export function restaurantDefaultClock() {
  return clockLabel(RESTAURANT_DEFAULT_TIME);
}

export function tableChoiceLine(name: string, time: string | null | undefined) {
  return [name.trim(), clockLabel(time)].filter(Boolean).join(" · ") || "Table";
}

export function parseCardLast4(raw: unknown): { ok: true; last4: string | null } | { ok: false; error: string } {
  if (raw == null || (typeof raw === "string" && !raw.trim())) return { ok: true, last4: null };
  const text = String(raw).trim();
  const digits = text.replace(/\D/g, "");
  if (looksLikePan(text) || digits.length > 4) return { ok: false, error: "Indiquez seulement les 4 derniers chiffres." };
  if (!/^\d{4}$/.test(digits)) return { ok: false, error: "Quatre chiffres." };
  return { ok: true, last4: digits };
}

export function parseTableStatus(raw: unknown): TableStatus | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = fold(raw).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = key.replace(/ /g, "_");
  const aliases: Record<string, TableStatus> = {
    a_reserver: "a_reserver",
    "a reserver": "a_reserver",
    reservee: "reservee",
    proposee: "proposee",
    choisie: "choisie",
    a_annuler: "a_annuler",
    "a annuler": "a_annuler",
    annulee: "annulee",
    echec: "echec",
    echecs: "echec",
  };
  return aliases[compact] || aliases[key] || null;
}

export function parseChoice(raw: unknown): RestaurantChoice | null {
  if (typeof raw !== "string") return null;
  const key = fold(raw).replace(/\s+/g, " ").trim();
  if (key === "a" || key === "table a") return "A";
  if (key === "b" || key === "table b") return "B";
  if (key === "aucune" || key === "aucun" || key === "none") return "aucune";
  return null;
}

export function parseLocalTime(raw: unknown): string | null | { error: string } {
  if (raw == null || raw === "") return null;
  const match = String(raw).trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!match) return { error: "Heure invalide." };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { error: "Heure invalide." };
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseCovers(raw: unknown): number | { error: string } {
  if (raw == null || raw === "") return RESTAURANT_COVERS;
  const number = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (number === RESTAURANT_COVERS) return RESTAURANT_COVERS;
  return { error: "Les couverts sont fixés à 2." };
}

export function parseFeeCents(raw: unknown): number | null | { error: string } {
  if (raw == null || raw === "") return null;
  const number = typeof raw === "number" ? raw : Number(String(raw).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100_000) return { error: "Frais invalides." };
  return Math.round(number * 100);
}

export function parseAccount(raw: unknown): string | { error: string } {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!text) return RESTAURANT_ACCOUNT;
  if (text.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { error: "Compte invalide." };
  return text;
}

function slugCategory(raw: string) {
  const aliases: Record<string, string> = {
    japanese: "japonais",
    italian: "italien",
    french: "francais",
    francaise: "francais",
    kids: "enfants",
    enfant: "enfants",
    terrace: "terrasse",
    festive: "festif",
  };
  const folded = fold(raw).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!folded || folded.length > 32) return null;
  return aliases[folded] || folded;
}

export function parseCategories(raw: unknown): string[] | { error: string } {
  const source = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;/]/) : [];
  const out: string[] = [];
  for (const item of source) {
    const slug = slugCategory(String(item));
    if (!slug) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { error: "Catégorie invalide." };
    if (!out.includes(slug)) out.push(slug);
  }
  if (out.length > 8) return { error: "Huit catégories au plus." };
  return out;
}

const WEEKDAY_ALIASES: Record<string, number> = {
  lundi: 1,
  lun: 1,
  monday: 1,
  "1": 1,
  mardi: 2,
  mar: 2,
  tuesday: 2,
  "2": 2,
  mercredi: 3,
  mer: 3,
  wednesday: 3,
  "3": 3,
  jeudi: 4,
  jeu: 4,
  thursday: 4,
  "4": 4,
  vendredi: 5,
  ven: 5,
  friday: 5,
  "5": 5,
  samedi: 6,
  sam: 6,
  saturday: 6,
  "6": 6,
  dimanche: 7,
  dim: 7,
  sunday: 7,
  "7": 7,
  "0": 7,
};

export function parseWeekdays(raw: unknown): number[] | { error: string } {
  const source = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;/]/) : [];
  const days = new Set<number>();
  for (const item of source) {
    const key = fold(String(item)).trim();
    if (!key) continue;
    const day = WEEKDAY_ALIASES[key];
    if (!day) return { error: "Jour de fermeture invalide." };
    days.add(day);
  }
  return [...days].sort();
}

export function parseAnnualClosures(raw: unknown): AnnualClosure[] | { error: string } {
  if (raw == null || raw === "") return [];
  const lines = Array.isArray(raw) ? raw : String(raw).split(/\n+/);
  const spans: AnnualClosure[] = [];
  for (const line of lines) {
    if (line && typeof line === "object" && "from" in line && "to" in line) {
      const from = String((line as { from: unknown }).from);
      const to = String((line as { to: unknown }).to);
      if (!/^\d{2}-\d{2}$/.test(from) || !/^\d{2}-\d{2}$/.test(to)) return { error: "Fermeture annuelle invalide." };
      spans.push({ from, to });
      continue;
    }
    const text = String(line).trim();
    if (!text) continue;
    const match = text.match(/^(\d{2}-\d{2})\s*[/\s–-]\s*(\d{2}-\d{2})$/);
    if (!match) return { error: "Fermeture annuelle : mois-jour/mois-jour, une période par ligne." };
    spans.push({ from: match[1], to: match[2] });
  }
  return spans.slice(0, 12);
}

function parsePlatform(raw: unknown): RestaurantPlatform | null | { error: string } {
  if (raw == null || raw === "") return null;
  const key = fold(String(raw)).replace(/[^a-z]/g, "");
  const aliases: Record<string, RestaurantPlatform> = {
    resy: "resy",
    opentable: "opentable",
    sevenrooms: "sevenrooms",
    thefork: "thefork",
    fork: "thefork",
    zenchef: "zenchef",
    telephone: "telephone",
    phone: "telephone",
    tel: "telephone",
    whatsapp: "whatsapp",
    formulaire: "formulaire",
    form: "formulaire",
  };
  const platform = aliases[key];
  if (!platform) return { error: "Plateforme inconnue." };
  return platform;
}

function parseBot(raw: unknown): BotReservable | { error: string } {
  if (raw == null || raw === "") return "non";
  const key = fold(String(raw)).trim();
  if (key === "oui" || key === "yes" || key === "true") return "oui";
  if (key === "partiel" || key === "partielle" || key === "partial") return "partiel";
  if (key === "non" || key === "no" || key === "false") return "non";
  return { error: "Réservable par bot : oui, partiel ou non." };
}

function parseUrl(raw: unknown, label: string): string | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  if (text.length > 400) return { error: `${label} trop long.` };
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { error: `${label} invalide.` };
    return url.toString();
  } catch {
    return { error: `${label} invalide.` };
  }
}

function clipText(raw: unknown, max: number) {
  return (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseCoord(raw: unknown, min: number, max: number, label: string): number | null | { error: string } {
  if (raw == null || raw === "") return null;
  const number = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(number) || number < min || number > max) return { error: `${label} invalide.` };
  return Math.round(number * 1e6) / 1e6;
}

function flag(raw: unknown) {
  return raw === true || raw === "true" || raw === "oui" || raw === "1" || raw === 1;
}

/** Étoilé, gastronomique et prépaiement forcent l’exclusion. La sélection reste bloquée. */
export function applyCatalogRules(draft: CatalogDraft): CatalogDraft {
  if (draft.starred || draft.categories.some((item) => BLOCKED_CATEGORIES.has(item))) {
    return { ...draft, status: "exclu", exclusionReason: "gastronomique", starred: draft.starred || draft.categories.some((item) => item !== "gastronomique" && BLOCKED_CATEGORIES.has(item)) };
  }
  if (draft.prepaidRequired) {
    return { ...draft, status: "exclu", exclusionReason: "prepaiement" };
  }
  if (draft.exclusionReason) {
    return { ...draft, status: "exclu" };
  }
  if (draft.status === "exclu") {
    return { ...draft, exclusionReason: "ferme" };
  }
  return { ...draft, exclusionReason: null, starred: false, prepaidRequired: false };
}

export function normalizeCatalog(input: Record<string, unknown>, existing?: CatalogDraft): CatalogDraft | { error: string } {
  const base = existing;
  const name = input.name != null || input.nom != null ? clipText(input.name ?? input.nom, 200) : base?.name || "";
  const city = input.city != null || input.ville != null ? clipText(input.city ?? input.ville, 80) : base?.city || "";
  if (!name) return { error: "Indiquez le nom." };
  if (!city) return { error: "Indiquez la ville." };
  const address = input.address != null || input.adresse != null ? clipText(input.address ?? input.adresse, 300) : base?.address || "";
  const lat = input.lat != null ? parseCoord(input.lat, -90, 90, "Latitude") : base?.lat ?? null;
  if (isFormError(lat)) return lat;
  const lng = input.lng != null ? parseCoord(input.lng, -180, 180, "Longitude") : base?.lng ?? null;
  if (isFormError(lng)) return lng;
  const phoneRaw = input.phone != null || input.telephone != null ? clipText(input.phone ?? input.telephone, 40) : base?.phone || "";
  if (phoneRaw && looksLikePan(phoneRaw)) return { error: "Téléphone invalide." };
  const website = input.website != null || input.site != null ? parseUrl(input.website ?? input.site, "Site") : base?.website || "";
  if (isFormError(website)) return website;
  const categories =
    input.categories != null ? parseCategories(input.categories) : base?.categories || [];
  if (isFormError(categories)) return categories;
  const platform =
    input.platform != null || input.plateforme != null
      ? parsePlatform(input.platform ?? input.plateforme)
      : base?.platform ?? null;
  if (isFormError(platform)) return platform;
  const bookingUrl =
    input.bookingUrl != null || input.lien != null ? parseUrl(input.bookingUrl ?? input.lien, "Lien") : base?.bookingUrl || "";
  if (isFormError(bookingUrl)) return bookingUrl;
  const bot = input.bot != null ? parseBot(input.bot) : base?.bot || "non";
  if (isFormError(bot)) return bot;
  const cancelHoursRaw = input.cancelHours ?? input.annulation_heures;
  let cancelHours = base?.cancelHours ?? null;
  if (cancelHoursRaw != null && cancelHoursRaw !== "") {
    const hours = Number(cancelHoursRaw);
    if (!Number.isInteger(hours) || hours < 0 || hours > 24 * 60) return { error: "Délai d’annulation invalide." };
    cancelHours = hours;
  } else if (cancelHoursRaw === "" || cancelHoursRaw === null) cancelHours = null;
  const feeRaw = input.cancelFeeEuros ?? input.annulation_frais;
  const cancelFeeCents = feeRaw !== undefined ? parseFeeCents(feeRaw) : base?.cancelFeeCents ?? null;
  if (isFormError(cancelFeeCents)) return cancelFeeCents;
  const weekdays =
    input.closedWeekdays != null || input.fermeture_jours != null
      ? parseWeekdays(input.closedWeekdays ?? input.fermeture_jours)
      : base?.closedWeekdays || [];
  if (isFormError(weekdays)) return weekdays;
  const closures =
    input.annualClosures != null || input.fermetures != null
      ? parseAnnualClosures(input.annualClosures ?? input.fermetures)
      : base?.annualClosures || [];
  if (isFormError(closures)) return closures;
  const statusRaw = fold(String(input.status ?? input.statut ?? base?.status ?? "actif"));
  const status = statusRaw === "exclu" ? "exclu" : "actif";
  const reasonRaw = fold(String(input.exclusionReason ?? input.motif ?? "")).replace(/[^a-z]/g, "");
  let exclusionReason: ExclusionReason | null = base?.exclusionReason ?? null;
  if (input.exclusionReason != null || input.motif != null) {
    if (!reasonRaw) exclusionReason = null;
    else if (reasonRaw === "ferme" || reasonRaw === "fermee") exclusionReason = "ferme";
    else if (reasonRaw === "gastronomique" || reasonRaw === "etoile") exclusionReason = "gastronomique";
    else if (reasonRaw === "prepaiement" || reasonRaw === "prepaye") exclusionReason = "prepaiement";
    else return { error: "Motif d’exclusion inconnu." };
  }
  const starred = input.starred != null || input.etoile != null ? flag(input.starred ?? input.etoile) : base?.starred || false;
  const prepaidRequired =
    input.prepaidRequired != null || input.prepaiement != null
      ? flag(input.prepaidRequired ?? input.prepaiement)
      : base?.prepaidRequired || false;
  const note = redactPans(
    input.note != null || input.interne != null ? clipText(input.note ?? input.interne, 2000) : base?.note || ""
  );
  const photosRaw = input.photos ?? input.photo_urls ?? input.photoUrls;
  const photoUrls = photosRaw !== undefined ? parseHttpsList(photosRaw, "Photo", 8) : base?.photoUrls || [];
  if (isFormError(photoUrls)) return photoUrls;
  const menuRaw = input.photo_carte ?? input.menuPhoto ?? input.menu_photo_url ?? input.menuPhotoUrl;
  const menuPhotoUrl = menuRaw !== undefined ? parseHttps(menuRaw, "Photo de la carte") : base?.menuPhotoUrl || "";
  if (isFormError(menuPhotoUrl)) return menuPhotoUrl;
  const dishRaw = input.photo_plat ?? input.signaturePhoto ?? input.signature_photo_url ?? input.signaturePhotoUrl;
  const signaturePhotoUrl = dishRaw !== undefined ? parseHttps(dishRaw, "Photo du plat") : base?.signaturePhotoUrl || "";
  if (isFormError(signaturePhotoUrl)) return signaturePhotoUrl;
  const pitchRaw = input.description ?? input.pitch ?? input.concierge_pitch;
  const pitch = pitchRaw !== undefined ? clipText(pitchRaw, 400) : base?.pitch || "";
  const priceRaw = input.fourchette ?? input.prix ?? input.priceBand ?? input.price_band;
  const priceBand = priceRaw !== undefined ? clipText(priceRaw, 80) : base?.priceBand || "";
  const placeRaw = input.page ?? input.lien_lieu ?? input.placeUrl ?? input.place_url;
  const placeUrl = placeRaw !== undefined ? parseHttps(placeRaw, "Page") : base?.placeUrl || "";
  if (isFormError(placeUrl)) return placeUrl;
  return applyCatalogRules({
    name,
    city,
    cityKey: cityPlaceKey(city),
    address,
    lat,
    lng,
    phone: phoneRaw,
    website,
    categories,
    platform,
    bookingUrl,
    bot,
    guaranteeCard: input.guaranteeCard != null || input.garantie != null ? flag(input.guaranteeCard ?? input.garantie) : base?.guaranteeCard || false,
    cancelHours,
    cancelFeeCents,
    closedWeekdays: weekdays,
    annualClosures: closures,
    status,
    exclusionReason,
    starred,
    prepaidRequired,
    note,
    photoUrls,
    menuPhotoUrl,
    signaturePhotoUrl,
    pitch,
    priceBand,
    placeUrl,
  });
}

function parseHttps(raw: unknown, label: string): string | { error: string } {
  const url = parseUrl(raw, label);
  if (isFormError(url)) return url;
  if (url && !url.startsWith("https://")) return { error: `${label} doit être en https.` };
  return url;
}

export function parseHttpsList(raw: unknown, label: string, max: number): string[] | { error: string } {
  if (raw == null || raw === "") return [];
  const source = Array.isArray(raw) ? raw : String(raw).split(/\n+/);
  const out: string[] = [];
  for (const item of source) {
    const url = parseHttps(item, label);
    if (isFormError(url)) return url;
    if (!url || out.includes(url)) continue;
    out.push(url);
    if (out.length > max) return { error: `${max} photos au plus.` };
  }
  return out;
}
