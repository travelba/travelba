import { catalogNameAgrees } from "@/lib/crm/hotel-gallery";
import type { BookingItemKind } from "@/lib/crm/types";

export type MatchableItem = {
  kind: string;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  title?: string | null;
  supplier?: string | null;
  details?: Record<string, unknown> | null;
};

function detail(item: MatchableItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" ? value : "";
}

function norm(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function day(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function hotelRefTokens(ref: string | null | undefined) {
  return (ref || "")
    .split(/[;,\s/]+/)
    .map(norm)
    .filter((token) => token.length >= 5);
}

const LE_ROOM_REF = /^(\d{4,})SH\d+$/;
const LE_BOOKING_REF = /^(\d{4,})$/;

/** Réservation Little Emperors : `64570`, ou chambre `64570SH046795`. */
export function hotelBookingStem(ref: string | null | undefined): string | null {
  for (const token of hotelRefTokens(ref)) {
    const room = token.match(LE_ROOM_REF);
    if (room) return room[1];
    const booking = token.match(LE_BOOKING_REF);
    if (booking) return booking[1];
  }
  return null;
}

/** Même réservation, y compris le numéro court et une autre chambre. Deux numéros sans `SH` ne se rejoignent pas. */
export function hotelRefsShareBooking(a: string | null | undefined, b: string | null | undefined) {
  const stemA = hotelBookingStem(a);
  const stemB = hotelBookingStem(b);
  if (!stemA || stemA !== stemB) return false;
  return [...hotelRefTokens(a), ...hotelRefTokens(b)].some((token) => LE_ROOM_REF.test(token));
}

function hotelNamesAlign(a: string | null | undefined, b: string | null | undefined) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 12 && longer.includes(shorter);
}

function hotelLabels(item: MatchableItem) {
  return [detail(item, "hotel_name"), item.title || ""].map((value) => value.trim()).filter(Boolean);
}

function hotelsShareName(a: MatchableItem, b: MatchableItem) {
  const left = hotelLabels(a);
  const right = hotelLabels(b);
  return left.some((name) => right.some((other) => hotelNamesAlign(name, other)));
}

/** Les deux côtés ont un numéro, et ce n’est pas le même. */
function hotelRefsConflict(a: string | null | undefined, b: string | null | undefined) {
  const left = hotelRefTokens(a);
  const right = hotelRefTokens(b);
  if (!left.length || !right.length) return false;
  if (left.some((token) => right.includes(token))) return false;
  if (hotelRefsShareBooking(a, b)) return false;
  return true;
}

function stayNightsOverlap(a: MatchableItem, b: MatchableItem) {
  const aStart = day(a.start_at);
  const bStart = day(b.start_at);
  if (!aStart || !bStart) return false;
  const aEnd = day(a.end_at) || aStart;
  const bEnd = day(b.end_at) || bStart;
  return aStart <= bEnd && bStart <= aEnd;
}

function addDays(iso: string, days: number) {
  const [year, month, date] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Dernier jour exclu. Sans date de départ, la nuit d’arrivée compte. */
function checkoutDay(item: MatchableItem) {
  const start = day(item.start_at);
  if (!start) return "";
  const end = day(item.end_at);
  if (!end || end <= start) return addDays(start, 1);
  return end;
}

/** Une nuit en commun. Le jour de départ est libre : arrivée le 19 après un départ le 19. */
function hotelNightsShare(a: MatchableItem, b: MatchableItem) {
  const aStart = day(a.start_at);
  const bStart = day(b.start_at);
  if (!aStart || !bStart) return false;
  return aStart < checkoutDay(b) && bStart < checkoutDay(a);
}

/**
 * Même séjour : même réservation, même hôtel, ou une nuit en commun.
 * Deux hôtels à la suite ne se remplacent pas.
 */
export function hotelSameStay(
  current: MatchableItem,
  incoming: {
    kind?: string | null;
    confirmation_ref?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    title?: string | null;
    details?: Record<string, unknown> | null;
  }
) {
  const card: MatchableItem = { ...incoming, kind: incoming.kind || "" };
  if (current.kind !== "hotel" || card.kind !== "hotel") return false;
  if (hotelRefsShareBooking(current.confirmation_ref, card.confirmation_ref)) return true;
  if (hotelsShareName(current, card)) return true;
  return hotelNightsShare(current, card);
}

function hollowHotelMention(item: MatchableItem) {
  return (item.kind || "") === "hotel" && !(item.confirmation_ref || "").trim() && !day(item.start_at);
}

/** Mention sans date ni numéro : la carte du même nom qui a déjà des dates, s’il n’y en a qu’une. */
function foldHollowHotel<T extends MatchableItem>(existing: T[], incoming: T): T | null {
  if ((incoming.kind || "") !== "hotel") return null;
  if (hollowHotelMention(incoming)) {
    const dated = existing.filter(
      (row) => (row.kind || "") === "hotel" && hotelsShareName(row, incoming) && Boolean(day(row.start_at))
    );
    return dated.length === 1 ? dated[0] : null;
  }
  const hollows = existing.filter((row) => hollowHotelMention(row) && hotelsShareName(row, incoming));
  return hollows.length === 1 ? hollows[0] : null;
}

/**
 * Même hôtel, nuits qui se croisent, et pas deux numéros différents.
 * « Mondrian Bordeaux » et « Mondrian Bordeaux Les Carmes » sont le même hôtel.
 * Deux cartes du même nom : aucun choix automatique.
 */
export function findHotelSameStay<T extends MatchableItem>(
  existing: T[],
  incoming: MatchableItem
): T | null {
  if ((incoming.kind || "") !== "hotel") return null;
  const hits = existing.filter((row) => {
    if ((row.kind || "") !== "hotel") return false;
    if (hotelRefsConflict(row.confirmation_ref, incoming.confirmation_ref)) return false;
    if (!hotelsShareName(row, incoming)) return false;
    return stayNightsOverlap(row, incoming);
  });
  return hits.length === 1 ? hits[0] : null;
}

function leHotelId(item: MatchableItem): number | null {
  const value = item.details?.le_hotel_id;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function hotelNamesAgree(a: MatchableItem, b: MatchableItem) {
  const left = hotelLabels(a);
  const right = hotelLabels(b);
  return left.some((name) =>
    right.some((other) => Boolean(name.trim() && other.trim() && catalogNameAgrees(name, other)))
  );
}

/**
 * Même hôtel (nom ou `le_hotel_id`) et dates exactes.
 * Deux numéros différents ne se bloquent pas : confirmation hôtel et numéro Little Emperors.
 * Deux identifiants d’hôtel différents ne se rejoignent pas.
 */
export function hotelExactStay(current: MatchableItem, incoming: MatchableItem) {
  if ((current.kind || "") !== "hotel" || (incoming.kind || "") !== "hotel") return false;
  const leftStart = day(current.start_at);
  const rightStart = day(incoming.start_at);
  const leftEnd = day(current.end_at);
  const rightEnd = day(incoming.end_at);
  if (!leftStart || !rightStart || !leftEnd || !rightEnd) return false;
  if (leftStart !== rightStart || leftEnd !== rightEnd) return false;
  const leftId = leHotelId(current);
  const rightId = leHotelId(incoming);
  if (leftId != null && rightId != null && leftId !== rightId) return false;
  if (leftId != null && rightId != null) return true;
  return hotelNamesAgree(current, incoming);
}

/** Une seule carte a cet hôtel et ces dates. Deux cartes : aucun choix. */
export function findHotelExactStay<T extends MatchableItem>(
  existing: T[],
  incoming: MatchableItem
): T | null {
  if ((incoming.kind || "") !== "hotel") return null;
  const hits = existing.filter((row) => hotelExactStay(row, incoming));
  return hits.length === 1 ? hits[0] : null;
}

/** Compléter la carte déjà là : garder le nom, écrire la référence manquante. */
export function hotelMatchKeepsStay(current: MatchableItem, incoming: MatchableItem) {
  if ((current.kind || "") !== "hotel") return false;
  if (hotelRefsConflict(current.confirmation_ref, incoming.confirmation_ref)) return false;
  const shared = hotelRefTokens(current.confirmation_ref).some((token) =>
    hotelRefTokens(incoming.confirmation_ref).includes(token)
  );
  if (shared || hotelRefsShareBooking(current.confirmation_ref, incoming.confirmation_ref)) return false;
  return Boolean(findHotelSameStay([current], incoming));
}

/**
 * Une seule carte active porte cette réservation. Deux chambres actives : aucun choix,
 * l’agence désigne la carte.
 */
export function findHotelBookingCard<T extends MatchableItem>(
  existing: T[],
  incoming: MatchableItem
): T | null {
  if ((incoming.kind || "") !== "hotel") return null;
  if (!hotelBookingStem(incoming.confirmation_ref)) return null;
  const hits = existing.filter(
    (row) => (row.kind || "") === "hotel" && hotelRefsShareBooking(incoming.confirmation_ref, row.confirmation_ref)
  );
  return hits.length === 1 ? hits[0] : null;
}

function filled(value: string | null | undefined) {
  return (value || "").trim();
}

/**
 * Les deux numéros restent, dans leur casse d’origine.
 * `64570` disparaît si `64570SH046795` est déjà là : c’est la même réservation.
 */
export function joinConfirmationRefs(a?: string | null, b?: string | null): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of [a, b]) {
    for (const token of String(raw || "").split(/[;,\s/|]+/)) {
      const trimmed = token.trim();
      const key = norm(trimmed);
      if (key.length < 5 || seen.has(key)) continue;
      seen.add(key);
      parts.push(trimmed);
    }
  }
  const roomStems = new Set<string>();
  for (const token of parts) {
    const room = norm(token).match(LE_ROOM_REF);
    if (room) roomStems.add(room[1]);
  }
  const kept = parts.filter((token) => {
    const key = norm(token);
    return !(roomStems.has(key) && LE_BOOKING_REF.test(key));
  });
  if (kept.length) return kept.join(";");
  return filled(a) || filled(b) || null;
}

/**
 * Le mail complète la carte déjà là. Le nom, la référence complète et les dates restent.
 * Les avantages nouveaux s’ajoutent.
 */
export function keptHotelStayFields(
  current: {
    title?: string | null;
    confirmation_ref?: string | null;
    supplier?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    details?: Record<string, unknown> | null;
  },
  incoming: {
    title?: string | null;
    confirmation_ref?: string | null;
    supplier?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    details?: Record<string, unknown> | null;
  }
) {
  const details: Record<string, unknown> = { ...(current.details || {}) };
  const included = [
    ...(Array.isArray(details.included) ? details.included : []),
    ...(Array.isArray(incoming.details?.included) ? incoming.details.included : []),
  ]
    .map((row) => String(row).trim())
    .filter(Boolean);
  if (included.length) details.included = [...new Set(included)];
  return {
    title: filled(current.title) || filled(incoming.title),
    confirmation_ref: joinConfirmationRefs(current.confirmation_ref, incoming.confirmation_ref),
    supplier: filled(current.supplier) || filled(incoming.supplier) || null,
    start_at: filled(current.start_at) || filled(incoming.start_at) || null,
    end_at: filled(current.end_at) || filled(incoming.end_at) || null,
    details,
  };
}

/** Clé de fusion à l’import. `null` = toujours insérer (pas de replace). */
export function itemMatchKey(item: MatchableItem): string | null {
  const kind = (item.kind || "fee") as BookingItemKind | string;
  const ref = norm(item.confirmation_ref);
  const start = day(item.start_at);

  if (kind === "flight") {
    const num = norm(detail(item, "flight_number"));
    if (num && start) return `flight:${num}:${start}`;
    if (ref && start) return `flight:${ref}:${start}`;
    if (ref) return `flight:${ref}`;
    return null;
  }

  if (kind === "hotel") {
    const refs = hotelRefTokens(item.confirmation_ref).sort();
    if (refs.length) return `hotel:${refs[0]}`;
    const name = norm(detail(item, "hotel_name") || item.title);
    if (name && start) return `hotel:${name}:${start}`;
    return null;
  }

  if (kind === "rail") {
    const train = norm(detail(item, "train_number"));
    if (train && start) return `rail:${train}:${start}`;
    if (ref && start) return `rail:${ref}:${start}`;
    if (ref) return `rail:${ref}`;
    const title = norm(item.title);
    if (title && start) return `rail:${title}:${start}`;
    return null;
  }

  if (kind === "transfer" || kind === "car" || kind === "cruise" || kind === "activity" || kind === "insurance") {
    if (ref) return `${kind}:${ref}`;
    const title = norm(item.title);
    if (title && start) return `${kind}:${title}:${start}`;
    return null;
  }

  if (ref) return `${kind}:${ref}`;
  return null;
}

export function findMatchingItem<T extends MatchableItem>(
  existing: T[],
  incoming: MatchableItem
): T | null {
  if ((incoming.kind || "") === "hotel") {
    const incomingRefs = hotelRefTokens(incoming.confirmation_ref);
    if (incomingRefs.length) {
      const hit = existing.find((row) => {
        if ((row.kind || "") !== "hotel") return false;
        const have = hotelRefTokens(row.confirmation_ref);
        return have.some((token) => incomingRefs.includes(token));
      });
      if (hit) return hit;
    }
    const stay = findHotelSameStay(existing, incoming);
    if (stay) return stay;
  }
  const key = itemMatchKey(incoming);
  if (!key) return null;
  return existing.find((row) => itemMatchKey(row) === key) || null;
}

function fillEmpty<T>(current: T, incoming: T): T {
  if (current == null || current === "") return incoming;
  return current;
}

function mergeHotelConfirmation(a?: string | null, b?: string | null) {
  const tokens = [...new Set([...hotelRefTokens(a), ...hotelRefTokens(b)])].sort();
  return tokens.join(";") || a || b || null;
}

/**
 * Nombre de billets saisi. Vide, absent ou invalide : pas de nombre.
 * Le prix de la carte est alors le total, sans division ni prix unitaire.
 */
export function statedTicketCount(item: {
  kind?: string | null;
  details?: Record<string, unknown> | null;
}): number | null {
  if ((item.kind || "") !== "flight") return null;
  const raw = item.details?.ticket_count;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(99, Math.round(n));
}

/** Saisie du champ. Vide ou illisible : aucun nombre, pas de repli à 1. */
export function parseTicketCountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(99, Math.round(n));
}

/** Vols fusionnés : 1 e-ticket = 1 billet. Un vol sans nombre compte 1 seulement à la fusion. */
export function itemTicketCount(item: {
  kind?: string | null;
  details?: Record<string, unknown> | null;
}): number {
  return statedTicketCount(item) ?? 1;
}

function mergeDetails(
  target: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
) {
  const out: Record<string, unknown> = { ...(incoming || {}), ...(target || {}) };
  const roomsA = Array.isArray(target?.rooms) ? target.rooms : [];
  const roomsB = Array.isArray(incoming?.rooms) ? incoming.rooms : [];
  if (roomsA.length || roomsB.length) {
    const seen = new Set<string>();
    const rooms: unknown[] = [];
    for (const room of [...roomsA, ...roomsB]) {
      const key = JSON.stringify(room);
      if (seen.has(key)) continue;
      seen.add(key);
      rooms.push(room);
    }
    out.rooms = rooms;
  }
  const includedA = Array.isArray(target?.included) ? target.included : [];
  const includedB = Array.isArray(incoming?.included) ? incoming.included : [];
  if (includedA.length || includedB.length) {
    out.included = [...new Set([...includedA, ...includedB].map(String).filter(Boolean))];
  }
  return out;
}

/** Un e-ticket par passager → une carte vol. Deux réf. hôtel → une carte. */
export function mergeExtractItems<T extends MatchableItem>(items: T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    const hit = findMatchingItem(out, item) || foldHollowHotel(out, item);
    if (!hit) {
      out.push({
        ...item,
        details: item.details ? { ...item.details } : item.details,
      });
      continue;
    }
    hit.supplier = fillEmpty(hit.supplier, item.supplier);
    hit.start_at = fillEmpty(hit.start_at, item.start_at);
    hit.end_at = fillEmpty(hit.end_at, item.end_at);
    hit.title = fillEmpty(hit.title, item.title);
    if ((hit.kind || "") === "hotel") {
      hit.confirmation_ref = mergeHotelConfirmation(
        hit.confirmation_ref,
        item.confirmation_ref
      );
    } else {
      hit.confirmation_ref = fillEmpty(hit.confirmation_ref, item.confirmation_ref);
    }
    const currentCount = itemTicketCount(hit);
    const incomingCount = itemTicketCount(item);
    hit.details = mergeDetails(hit.details, item.details);
    if ((hit.kind || "") === "flight") {
      hit.details = { ...(hit.details || {}), ticket_count: currentCount + incomingCount };
    }
  }
  return out;
}

function positiveDocumentAmount(details?: Record<string, unknown> | null): number | null {
  const raw = details?.document_amount;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Même référence, même total imprimé sur chaque segment : c’est le total du billet, une seule fois.
 * Deux montants différents restent, chacun sur son segment.
 */
export function collapseSharedTicketPrice<T extends MatchableItem>(items: T[]): T[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const kind = item.kind || "";
    if (kind !== "flight" && kind !== "rail") return;
    const ref = norm(item.confirmation_ref);
    if (!ref) return;
    const list = groups.get(ref) || [];
    list.push(index);
    groups.set(ref, list);
  });
  const next = items.map((item) => ({
    ...item,
    details: item.details ? { ...item.details } : item.details,
  }));
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const amounts = indexes.map((index) => positiveDocumentAmount(next[index].details));
    const present = amounts.filter((amount): amount is number => amount != null);
    if (present.length < 2) continue;
    const first = present[0];
    if (!present.every((amount) => Math.abs(amount - first) < 0.01)) continue;
    const ordered = [...indexes].sort((a, b) =>
      String(next[a].start_at || "").localeCompare(String(next[b].start_at || ""))
    );
    for (const index of ordered.slice(1)) {
      const details = next[index].details;
      if (!details || positiveDocumentAmount(details) == null) continue;
      const rest = { ...details };
      delete rest.document_amount;
      next[index].details = rest;
    }
  }
  return next;
}
