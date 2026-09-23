import { detailStr, flightCities, flightIata, itemClock } from "./carnet";
import { BOOKING_ITEM_LABELS, type BookingItemKind, type CrmBooking, type CrmBookingItem } from "./types";

const SKIP_KINDS = new Set(["fee", "insurance"]);

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return parts.join("\r\n");
}

function dateStamp(isoDate: string) {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

function nextDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/** Heure imprimée, sans fuseau : l’iPhone affiche 09:40 comme sur le billet. */
function floatingStamp(iso: string | null | undefined) {
  if (!iso || !itemClock(iso)) return null;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].replace(/-/g, "")}T${match[2]}${match[3]}00`;
}

function plusOneHour(stamp: string) {
  const y = Number(stamp.slice(0, 4));
  const m = Number(stamp.slice(4, 6)) - 1;
  const d = Number(stamp.slice(6, 8));
  const hh = Number(stamp.slice(9, 11));
  const mm = Number(stamp.slice(11, 13));
  const date = new Date(y, m, d, hh, mm);
  date.setHours(date.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

function utcStamp(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

function locationOf(item: CrmBookingItem) {
  if (item.kind === "flight" || item.kind === "rail") {
    return flightIata(item) || flightCities(item);
  }
  return detailStr(item, "city") || detailStr(item, "meeting_point") || item.supplier || "";
}

function summaryOf(item: CrmBookingItem) {
  const kind = BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || "Étape";
  return `${kind} · ${item.title}`;
}

function descriptionOf(item: CrmBookingItem) {
  return [item.supplier, item.confirmation_ref ? `Réf. ${item.confirmation_ref}` : ""]
    .filter(Boolean)
    .join("\n");
}

function eventLines(input: {
  uid: string;
  stamp: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
}) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${input.stamp}`,
    input.allDay
      ? `DTSTART;VALUE=DATE:${input.start}`
      : `DTSTART:${input.start}`,
    input.allDay ? `DTEND;VALUE=DATE:${input.end}` : `DTEND:${input.end}`,
    `SUMMARY:${icsText(input.summary)}`,
  ];
  if (input.location) lines.push(`LOCATION:${icsText(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${icsText(input.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

function itemEvent(item: CrmBookingItem, stamp: string) {
  const startDay = (item.start_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return null;
  const startClock = floatingStamp(item.start_at);
  const endClock = floatingStamp(item.end_at);
  const endDay = (item.end_at || "").slice(0, 10);
  if (startClock) {
    return eventLines({
      uid: `${item.id}@travelba.fr`,
      stamp,
      summary: summaryOf(item),
      start: startClock,
      end: endClock || plusOneHour(startClock),
      allDay: false,
      location: locationOf(item),
      description: descriptionOf(item),
    });
  }
  const end =
    /^\d{4}-\d{2}-\d{2}$/.test(endDay) && endDay > startDay
      ? dateStamp(endDay)
      : nextDate(startDay);
  return eventLines({
    uid: `${item.id}@travelba.fr`,
    stamp,
    summary: summaryOf(item),
    start: dateStamp(startDay),
    end,
    allDay: true,
    location: locationOf(item),
    description: descriptionOf(item),
  });
}

export function buildBookingIcs(
  booking: Pick<CrmBooking, "id" | "reference" | "title" | "destination" | "start_date" | "end_date">,
  items: CrmBookingItem[],
  now = new Date()
) {
  const stamp = utcStamp(now);
  const events = items
    .filter((item) => !SKIP_KINDS.has(item.kind) && item.visible_to_client !== false)
    .map((item) => itemEvent(item, stamp))
    .filter((row): row is string[] => Boolean(row));

  if (!events.length && booking.start_date) {
    const start = dateStamp(booking.start_date);
    const end =
      booking.end_date && booking.end_date > booking.start_date
        ? dateStamp(booking.end_date)
        : nextDate(booking.start_date);
    events.push(
      eventLines({
        uid: `${booking.id}@travelba.fr`,
        stamp,
        summary: booking.destination || booking.title,
        start,
        end,
        allDay: true,
        description: booking.reference,
      })
    );
  }

  const name = [booking.reference, booking.destination || booking.title].filter(Boolean).join(" — ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travelba//Carnet//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
