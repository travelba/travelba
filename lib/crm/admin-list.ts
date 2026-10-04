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

export const BOOKING_STATE_FILTERS = ["preparation", "montre", "archive"] as const;
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
  depart: { column: "start_date", ascending: false, label: "Départ, du plus proche" },
  "depart-asc": { column: "start_date", ascending: true, label: "Départ, du plus ancien" },
  creation: { column: "created_at", ascending: false, label: "Création, du plus récent" },
  montant: { column: "total_amount", ascending: false, label: "Montant, du plus élevé" },
} as const;
export type BookingSort = keyof typeof BOOKING_SORTS;

export function parseBookingSort(value: SearchParamValue): BookingSort {
  const raw = firstParam(value);
  return raw && raw in BOOKING_SORTS ? (raw as BookingSort) : "depart";
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
  is(column: string, value: null): FilterableQuery;
  not(column: string, operator: string, value: null): FilterableQuery;
};

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
