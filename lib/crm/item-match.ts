import type { BookingItemKind } from "@/lib/crm/types";

export type MatchableItem = {
  kind: string;
  confirmation_ref?: string | null;
  start_at?: string | null;
  title?: string | null;
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
    if (ref) return `hotel:${ref}`;
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
  const key = itemMatchKey(incoming);
  if (!key) return null;
  return existing.find((row) => itemMatchKey(row) === key) || null;
}
