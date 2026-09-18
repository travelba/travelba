import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export function detailStr(item: CrmBookingItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function detailList(item: CrmBookingItem, key: string): string[] {
  const value = item.details?.[key];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[;•\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function hotelRooms(item: CrmBookingItem): {
  room: string;
  guests: string;
  confirmation_ref: string;
}[] {
  const raw = item.details?.rooms;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((row) => {
      const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        room: String(rec.room || rec.type || "").trim(),
        guests: String(rec.guests || "").trim(),
        confirmation_ref: String(rec.confirmation_ref || "").trim(),
      };
    });
  }
  const room = detailStr(item, "room");
  if (room) {
    return [
      {
        room,
        guests: detailStr(item, "guests"),
        confirmation_ref: item.confirmation_ref || "",
      },
    ];
  }
  return [];
}

export function nightsBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const a = new Date(`${start.slice(0, 10)}T12:00:00`);
  const b = new Date(`${end.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const n = Math.round((b.getTime() - a.getTime()) / 86400000);
  return n > 0 ? n : null;
}

export function hotelStayLabel(item: CrmBookingItem) {
  const start = (item.start_at || "").slice(0, 10);
  const end = (item.end_at || "").slice(0, 10);
  const nights = nightsBetween(start, end);
  const range = `${formatDateFr(start)} – ${formatDateFr(end)}`;
  if (nights) {
    return `${nights} nuit${nights > 1 ? "s" : ""} · ${range}`;
  }
  return range;
}

export function stayNightDates(start: string | null, end: string | null) {
  const from = (start || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return [] as string[];
  const to = (end || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) return [from];
  const dates: string[] = [];
  const cur = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [from];
  while (cur < last) {
    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, "0");
    const day = String(cur.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates.length ? dates : [from];
}

export function itemDayKey(item: CrmBookingItem) {
  if (!item.start_at) return null;
  return item.start_at.slice(0, 10);
}

export function isTimelineKind(kind: string) {
  return (
    kind === "flight" ||
    kind === "hotel" ||
    kind === "transfer" ||
    kind === "activity" ||
    kind === "rail" ||
    kind === "car" ||
    kind === "cruise"
  );
}

export function compareItemsByOrder<T extends { start_at?: string | null; sort_order?: number | null }>(
  a: T,
  b: T
) {
  const orderA = a.sort_order;
  const orderB = b.sort_order;
  if (orderA != null && orderB != null && orderA !== orderB) return orderA - orderB;
  return (a.start_at || "9999-99-99").localeCompare(b.start_at || "9999-99-99");
}

export function sortItemsByOrder<T extends { start_at?: string | null; sort_order?: number | null }>(
  items: T[]
) {
  return [...items].sort(compareItemsByOrder);
}

export function hotelsOf(items: CrmBookingItem[]) {
  return sortItemsByOrder(items.filter((item) => item.kind === "hotel"));
}

export function timelineItems(items: CrmBookingItem[]) {
  return items.filter((item) => isTimelineKind(item.kind));
}

export function groupByDay(items: CrmBookingItem[]) {
  const map = new Map<string, CrmBookingItem[]>();
  for (const item of items) {
    if (item.kind === "insurance" || item.kind === "fee") continue;
    const keys =
      item.kind === "hotel" ? stayNightDates(item.start_at, item.end_at) : [itemDayKey(item)];
    for (const key of keys) {
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
  }
  for (const list of map.values()) {
    list.sort(compareItemsByOrder);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function undatedTimeline(items: CrmBookingItem[]) {
  return sortItemsByOrder(
    timelineItems(items).filter((item) => {
      if (item.kind === "hotel") return stayNightDates(item.start_at, item.end_at).length === 0;
      return !itemDayKey(item);
    })
  );
}

export function itemClock(iso: string | null | undefined) {
  if (!iso || iso.length <= 10) return "";
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  return `${match[1]}h${match[2]}`;
}

export function dayHeading(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function documentLabel(doc: CrmBookingDocument, items: CrmBookingItem[]) {
  const related = items.find((item) => item.source_document_id === doc.id);
  const metier = related
    ? BOOKING_ITEM_LABELS[related.kind]
    : doc.kind === "pdf" || doc.kind === "image"
      ? "Confirmation"
      : doc.kind;
  const name = doc.file_name || "";
  return name ? `${metier} · ${name}` : metier;
}

export function confirmationForItem(item: CrmBookingItem, docs: CrmBookingDocument[]) {
  if (item.source_document_id) {
    return docs.find((doc) => doc.id === item.source_document_id) || null;
  }
  return null;
}

export function kindIcon(kind: string) {
  switch (kind) {
    case "flight":
      return "flight";
    case "hotel":
      return "hotel";
    case "transfer":
      return "airport_shuttle";
    case "rail":
      return "train";
    case "car":
      return "directions_car";
    case "cruise":
      return "directions_boat";
    case "activity":
      return "local_activity";
    case "insurance":
      return "health_and_safety";
    default:
      return "event";
  }
}

export function flightIata(item: CrmBookingItem) {
  const from = detailStr(item, "from");
  const to = detailStr(item, "to");
  return from && to ? `${from} → ${to}` : "";
}

export function flightCities(item: CrmBookingItem) {
  const cityFrom = detailStr(item, "city_from");
  const cityTo = detailStr(item, "city_to");
  if (cityFrom && cityTo) return `${cityFrom} → ${cityTo}`;
  return cityFrom || cityTo || "";
}

export function flightRoute(item: CrmBookingItem) {
  return flightIata(item) || flightCities(item);
}

export function carnetVisible(
  booking: Pick<CrmBooking, "visible_to_client">,
  items: CrmBookingItem[]
) {
  if (!booking.visible_to_client) return false;
  return items.some((item) => item.visible_to_client !== false && item.kind !== "fee");
}

export function itemPriceLabel(item: CrmBookingItem, currency: string) {
  if (item.amount == null || Number.isNaN(Number(item.amount))) return null;
  return formatMoney(Number(item.amount), currency);
}

export function coverQuery(destination: string | null, title: string | null) {
  const first = (destination || "").split(/[·,|/]/)[0].trim();
  return first || `${destination || ""} ${title || ""}`.trim() || "voyage";
}

export function whatsappModifyHref(
  phone: string,
  reference: string,
  destination: string | null
) {
  const dest = (destination || "").trim();
  const text = dest
    ? `Bonjour, je voudrais modifier ${reference} — ${dest}.`
    : `Bonjour, je voudrais modifier ${reference}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
