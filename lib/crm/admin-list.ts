import { stayMoment } from "./stay-moment";
import { BOOKING_STATUSES, type BookingStatus } from "./types";

/** Listes agence paginées côté serveur : 50 lignes par page, filtres dans l’URL. */
export const ADMIN_PAGE_SIZE = 50;

export type SearchParamValue = string | string[] | undefined;

export function firstParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

/** `?page=3` → 3 ; absent, vide ou invalide → 1. */
export function parsePage(value: SearchParamValue) {
  const raw = firstParam(value);
  const page = Number.parseInt(raw || "", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Bornes `range(from, to)` de Supabase pour une page. */
export function pageRange(page: number, size = ADMIN_PAGE_SIZE) {
  const from = (Math.max(1, page) - 1) * size;
  return { from, to: from + size - 1 };
}

export function pageCount(total: number, size = ADMIN_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** « 1-50 sur 312 », « 51-63 sur 63 », « 0 sur 0 ». */
export function paginationSummary(page: number, total: number, size = ADMIN_PAGE_SIZE) {
  if (total <= 0) return "0 sur 0";
  const { from } = pageRange(page, size);
  const start = Math.min(from + 1, total);
  const end = Math.min(from + size, total);
  return start === end ? `${start} sur ${total}` : `${start}-${end} sur ${total}`;
}

/**
 * Motif `ilike` : espaces repliés, caractères spéciaux PostgREST retirés (`,()"`), jokers `%_` neutralisés.
 * Vide si la recherche ne contient rien d’utile. Pas d’extension `unaccent` sur la base : `ilike` simple.
 */
export function searchPattern(query: string | undefined | null) {
  const cleaned = (query || "")
    .replace(/[%_,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `%${cleaned}%` : "";
}

/** Filtre `.or()` PostgREST sur plusieurs colonnes texte, plus une liste d’ids facultative. */
export function orSearchFilter(pattern: string, columns: string[], idColumn?: string, ids: string[] = []) {
  const parts = columns.map((column) => `${column}.ilike.${pattern}`);
  if (idColumn && ids.length) parts.push(`${idColumn}.in.(${ids.join(",")})`);
  return parts.join(",");
}

/**
 * Chiffres d’un numéro tapé « 06 12 34 » ou « +33 6 12 » → `61234`, comparables au `+33612345678` stocké.
 * Vide si la recherche n’est pas un numéro : moins de 4 chiffres, ou une lettre (« TB-2024 », « Dupont »).
 */
export function phoneSearchDigits(query: string | undefined | null) {
  const raw = (query || "").trim();
  const digits = raw.replace(/\D/g, "");
  const hasLetter = /\p{L}/u.test(raw);
  if (digits.length < 4 || hasLetter) return "";
  let national = digits;
  if (national.startsWith("0033")) national = national.slice(4);
  if (national.startsWith("33") && national.length >= 11) national = national.slice(2);
  else if (national.startsWith("0")) national = national.slice(1);
  return national;
}

/** Morceau `.or()` pour retrouver un client par son numéro (téléphone et second téléphone), ou vide. */
export function phoneSearchFilter(query: string | undefined | null, columns: string[] = ["phone", "phone_secondary"]) {
  const digits = phoneSearchDigits(query);
  if (!digits) return "";
  return columns.map((column) => `${column}.ilike.%${digits}%`).join(",");
}

/** Assemble des morceaux `.or()` en ignorant les vides. */
export function joinOrFilters(...parts: string[]) {
  return parts.filter(Boolean).join(",");
}

/** `a-venir` : départ aujourd’hui ou plus tard, ni archivé ni annulé (liens « départs » du tableau de bord). */
export const BOOKING_STATE_FILTERS = ["a-venir", "preparation", "montre", "archive"] as const;
export type BookingStateFilter = (typeof BOOKING_STATE_FILTERS)[number];

export function parseBookingState(value: SearchParamValue): BookingStateFilter | null {
  const raw = firstParam(value);
  return (BOOKING_STATE_FILTERS as readonly string[]).includes(raw || "") ? (raw as BookingStateFilter) : null;
}

export function parseBookingStatus(value: SearchParamValue): BookingStatus | null {
  const raw = firstParam(value);
  return (BOOKING_STATUSES as readonly string[]).includes(raw || "") ? (raw as BookingStatus) : null;
}

export const BOOKING_SORTS = {
  proche: {
    column: "start_date",
    ascending: true,
    proximity: true,
    label: "Du plus proche au plus loin",
  },
  depart: { column: "start_date", ascending: false, proximity: false, label: "Départ, du plus lointain" },
  "depart-asc": { column: "start_date", ascending: true, proximity: false, label: "Départ, du plus ancien" },
  creation: { column: "created_at", ascending: false, proximity: false, label: "Création, du plus récent" },
  montant: { column: "total_amount", ascending: false, proximity: false, label: "Montant, du plus élevé" },
} as const;
export type BookingSort = keyof typeof BOOKING_SORTS;

/** Tri par défaut de `/admin/reservations` : absent de l’URL. */
export const DEFAULT_BOOKING_SORT: BookingSort = "proche";

export function parseBookingSort(value: SearchParamValue): BookingSort {
  const raw = firstParam(value);
  return raw && raw in BOOKING_SORTS ? (raw as BookingSort) : DEFAULT_BOOKING_SORT;
}

/** `tri` à mettre dans l’URL. Le tri par défaut n’y figure pas. */
export function bookingSortParam(sort: BookingSort) {
  return sort === DEFAULT_BOOKING_SORT ? null : sort;
}

type ProximityDated = {
  id?: string;
  start_date: string | null;
  end_date?: string | null;
  created_at?: string | null;
};

function isoDay(value: string | null | undefined) {
  const day = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** Inverse les chiffres pour qu’une date plus récente trie avant, en ordre croissant. */
function invertIsoDay(value: string) {
  return value.replace(/\d/g, (digit) => String(9 - Number(digit)));
}

/**
 * 0 séjour en cours (retour le plus tôt d’abord), 1 départ à venir,
 * 2 passé (le plus récent d’abord), 3 sans date.
 */
export function bookingProximityRank(
  booking: { start_date: string | null; end_date?: string | null },
  today: string
) {
  const start = isoDay(booking.start_date);
  const end = isoDay(booking.end_date);
  if (!start && !end) return { band: 3, key: "" };
  const moment = stayMoment(start, end, today);
  if (moment === "travelling") return { band: 0, key: end || "9999-12-31" };
  if (moment === "before") return { band: 1, key: start || end };
  return { band: 2, key: invertIsoDay(end || start) };
}

export function compareBookingsByProximity<T extends ProximityDated>(a: T, b: T, today: string) {
  const left = bookingProximityRank(a, today);
  const right = bookingProximityRank(b, today);
  if (left.band !== right.band) return left.band - right.band;
  if (left.key !== right.key) return left.key < right.key ? -1 : 1;
  const created = (b.created_at || "").localeCompare(a.created_at || "");
  if (created !== 0) return created;
  return (a.id || "").localeCompare(b.id || "");
}

/** En cours, puis le prochain départ, puis les passés du plus récent, sans date en dernier. */
export function sortBookingsByProximity<T extends ProximityDated>(rows: T[], today: string) {
  return rows.slice().sort((a, b) => compareBookingsByProximity(a, b, today));
}

export const CLIENT_FILTERS = ["veille"] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

export function parseClientFilter(value: SearchParamValue): ClientFilter | null {
  const raw = firstParam(value);
  return (CLIENT_FILTERS as readonly string[]).includes(raw || "") ? (raw as ClientFilter) : null;
}

/** `?limite=` d’une liste « Charger plus » : arrondi au pas, borné. Absent ou invalide → un pas. */
export function parseLoadMore(value: SearchParamValue, step: number, max: number) {
  const raw = Number.parseInt(firstParam(value) || "", 10);
  if (!Number.isFinite(raw) || raw < step) return step;
  return Math.min(max, Math.ceil(raw / step) * step);
}

/** Ce qu’il faut au filtrage d’une liste, sans les types profonds du client Supabase. */
export type FilterableQuery = {
  or(filters: string): FilterableQuery;
  eq(column: string, value: unknown): FilterableQuery;
  neq(column: string, value: unknown): FilterableQuery;
  gte(column: string, value: unknown): FilterableQuery;
  is(column: string, value: null): FilterableQuery;
  not(column: string, operator: string, value: null): FilterableQuery;
};

/** Page demandée au-delà du total : page réelle où renvoyer, sinon null. */
export function pageOverflow(page: number, total: number | null | undefined, size = ADMIN_PAGE_SIZE) {
  if (!total || total <= 0) return null;
  const { from } = pageRange(page, size);
  return from >= total ? pageCount(total, size) : null;
}

/** URL de la liste avec les filtres gardés et la page changée (ou retirée pour la première). */
export function listHref(base: string, params: Record<string, string | number | null | undefined>, page?: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  if (page && page > 1) search.set("page", String(page));
  else search.delete("page");
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}
