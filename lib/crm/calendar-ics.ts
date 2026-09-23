import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS } from "@/lib/crm/types";
import { itemClock, flightIata, flightCities, hotelDisplayName } from "@/lib/crm/carnet";

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStampUtc(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function allDay(iso: string) {
  return iso.slice(0, 10).replace(/-/g, "");
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasRealTime(iso: string | null | undefined) {
  return Boolean(itemClock(iso));
}

function timedStamp(iso: string) {
  const date = iso.slice(0, 10).replace(/-/g, "");
  const clock = iso.match(/T(\d{2}):(\d{2})/);
  if (!clock) return `${date}T000000`;
  return `${date}T${clock[1]}${clock[2]}00`;
}

export function itemHasCalendarDate(item: Pick<CrmBookingItem, "kind" | "start_at" | "end_at">) {
  if (item.kind === "fee") return false;
  return Boolean((item.start_at || "").slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/));
}

function itemSummary(item: CrmBookingItem) {
  const kind = BOOKING_ITEM_LABELS[item.kind] || item.kind;
  if (item.kind === "flight") {
    return `${kind} ${flightIata(item) || item.title}`.trim();
  }
  if (item.kind === "hotel") {
    return `${kind} · ${hotelDisplayName(item)}`.trim();
  }
  return `${kind} · ${item.title}`.trim();
}

function itemDescription(item: CrmBookingItem, booking: CrmBooking) {
  const bits = [
    booking.title,
    booking.reference,
    item.kind === "flight" ? flightCities(item) : "",
    item.confirmation_ref ? `Réf. ${item.confirmation_ref}` : "",
  ].filter(Boolean);
  return bits.join("\n");
}

export function veventFromItem(item: CrmBookingItem, booking: CrmBooking): string | null {
  if (!itemHasCalendarDate(item)) return null;
  const start = (item.start_at || "").slice(0, 10);
  const uid = `${item.id}@travelba.fr`;
  const summary = icsEscape(itemSummary(item));
  const description = icsEscape(itemDescription(item, booking));
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStampUtc()}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
  ];

  if (item.kind === "hotel" || !hasRealTime(item.start_at)) {
    const endExclusive = item.end_at
      ? item.end_at.slice(0, 10)
      : addDays(start, 1);
    const end = endExclusive > start ? endExclusive : addDays(start, 1);
    lines.push(`DTSTART;VALUE=DATE:${allDay(start)}`);
    lines.push(`DTEND;VALUE=DATE:${allDay(end)}`);
  } else {
    lines.push(`DTSTART:${timedStamp(item.start_at!)}`);
    if (item.end_at && hasRealTime(item.end_at)) {
      lines.push(`DTEND:${timedStamp(item.end_at)}`);
    }
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function veventFromStay(booking: CrmBooking): string | null {
  const start = (booking.start_date || "").slice(0, 10);
  const end = (booking.end_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const endExclusive = /^\d{4}-\d{2}-\d{2}$/.test(end) && end > start ? addDays(end, 1) : addDays(start, 1);
  const summary = icsEscape(`Séjour · ${booking.title}`);
  const description = icsEscape([booking.reference, booking.destination].filter(Boolean).join(" · "));
  return [
    "BEGIN:VEVENT",
    `UID:stay-${booking.id}@travelba.fr`,
    `DTSTAMP:${icsStampUtc()}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `DTSTART;VALUE=DATE:${allDay(start)}`,
    `DTEND;VALUE=DATE:${allDay(endExclusive)}`,
    "END:VEVENT",
  ].join("\r\n");
}

export function buildBookingIcs(opts: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  itemId?: string | null;
}) {
  const events: string[] = [];
  if (opts.itemId) {
    const item = opts.items.find((row) => row.id === opts.itemId);
    const event = item ? veventFromItem(item, opts.booking) : null;
    if (event) events.push(event);
  } else {
    const stay = veventFromStay(opts.booking);
    if (stay) events.push(stay);
    for (const item of opts.items) {
      const event = veventFromItem(item, opts.booking);
      if (event) events.push(event);
    }
  }
  const name = icsEscape(opts.booking.title || opts.booking.reference);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travelba//Carnet//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${name}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function icsFileName(booking: CrmBooking, itemId?: string | null) {
  const ref = booking.reference.replace(/[^A-Za-z0-9_-]/g, "");
  return itemId ? `travelba-${ref}-etape.ics` : `travelba-${ref}.ics`;
}

export function icsHttpHeaders(fileName: string) {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
  };
}

