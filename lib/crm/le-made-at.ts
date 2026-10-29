import { formatDateFr } from "@/lib/crm/dates";

/** Champs API Little Emperors qui datent la réservation, pas le séjour. */
const LE_MADE_AT_KEYS = [
  "created_at",
  "createdAt",
  "booked_at",
  "bookedAt",
  "booking_created_at",
  "bookingCreatedAt",
  "booking_date",
  "bookingDate",
  "date_created",
  "dateCreated",
  "booked_on",
  "bookedOn",
  "reservation_date",
  "confirmed_at",
  "issued_at",
  "issued_date",
] as const;

const EARLIEST = Date.parse("2000-01-01T00:00:00Z");
const LATEST = Date.parse("2100-01-01T00:00:00Z");

function inRange(ms: number) {
  return Number.isFinite(ms) && ms >= EARLIEST && ms < LATEST;
}

/** Horodatage comparable, ou null. Une date seule est midi UTC, le jour ne glisse pas. */
export function leInstant(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.abs(value) < 1e11 ? value * 1000 : value;
    return inRange(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  let normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  if (/[+-]\d{4}$/.test(normalized)) normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  else if (/[+-]\d{2}$/.test(normalized)) normalized += ":00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) normalized += "Z";
  const ms = Date.parse(normalized);
  return inRange(ms) ? new Date(ms).toISOString() : null;
}

/** Date de création Little Emperors lue sur la réservation. L’arrivée n’est pas cette date. */
export function leBookedAtFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  for (const key of LE_MADE_AT_KEYS) {
    const instant = leInstant(row[key]);
    if (instant) return instant;
  }
  return null;
}

/**
 * Première date utilisable : charge utile LE, e-mail de confirmation, colonne, puis created_at.
 * Un objet est lu comme charge utile. Une chaîne ou un nombre est un horodatage.
 */
export function firstLeMadeAt(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (source == null || source === "") continue;
    if (typeof source === "string" || typeof source === "number") {
      const instant = leInstant(source);
      if (instant) return instant;
      continue;
    }
    const fromPayload = leBookedAtFromPayload(source);
    if (fromPayload) return fromPayload;
  }
  return null;
}

/** Jour calendaire à Paris, AAAA-MM-JJ. */
export function leParisDay(value: string | null | undefined) {
  const instant = leInstant(value);
  if (!instant) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/** « 20 oct. 2026 », jour de Paris. */
export function leMadeDayLabel(value: string | null | undefined) {
  const day = leParisDay(value);
  return day ? formatDateFr(day) : null;
}

/** Plus récent d’abord. Sans date : en dernier, dans les deux sens. */
export function compareLeMadeAt(
  a: string | null | undefined,
  b: string | null | undefined,
  descending = true
) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return descending ? -cmp : cmp;
}

export function sortByLeMadeAt<T extends { booked_on?: string | null; id?: string | null }>(
  rows: T[],
  descending = true
) {
  return rows.slice().sort((left, right) => {
    const byDate = compareLeMadeAt(left.booked_on, right.booked_on, descending);
    if (byDate) return byDate;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}
