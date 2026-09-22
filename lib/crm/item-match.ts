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

  if (
    kind === "transfer" ||
    kind === "rail" ||
    kind === "car" ||
    kind === "cruise" ||
    kind === "activity"
  ) {
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
    const hit = findMatchingItem(out, item);
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
    hit.details = mergeDetails(hit.details, item.details);
  }
  return out;
}
