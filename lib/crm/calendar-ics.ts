import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS, isLedgerExpenseKind, visibleServiceCopy } from "@/lib/crm/types";
import { itemClock, flightCities, flightIata, hotelDisplayName, detailStr } from "@/lib/crm/carnet";
import { civilClock, timezoneForIata, zoneOffsetMinutes } from "@/lib/crm/airport-time";
import { addIsoDays } from "./dates";

export {
  calendarClickPlan,
  calendarFileDisposition,
  calendarItemIdFromSegment,
  calendarOpenTarget,
  calendarResponsePlan,
  chosenCalendarHref,
  isAndroidUa,
  isAppleMobileBrowser,
  itemCalendarHref,
  showGoogleCalendarFallback,
  type CalendarClickPlan,
  type PhoneCalendarLink,
  type PhoneCalendarLinks,
} from "./calendar-open";

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Ligne ≤ 75 octets, coupée entre deux caractères, suite précédée d’une espace. */
function foldLine(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  const decoder = new TextDecoder();
  let start = 0;
  let budget = 75;
  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    while (end > start && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + 1, bytes.length);
    parts.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    budget = 74;
  }
  return parts.join("\r\n ");
}

function foldBlock(lines: string[]) {
  return lines.map(foldLine).join("\r\n");
}

function icsStampUtc(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function allDay(iso: string) {
  return iso.slice(0, 10).replace(/-/g, "");
}

function hasRealTime(iso: string | null | undefined) {
  return Boolean(itemClock(iso));
}

function timedStamp(iso: string) {
  const date = iso.slice(0, 10).replace(/-/g, "");
  const clock = iso.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!clock) return `${date}T000000`;
  return `${date}T${clock[1]}${clock[2]}${clock[3] || "00"}`;
}

function offsetLabel(minutes: number) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}${mins}`;
}

function storedZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (!/^[A-Za-z0-9_+\-/]+$/.test(zone) || !zone.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function zoneForClock(zone: string | null, iso: string | null | undefined) {
  if (!zone || !iso || !hasRealTime(iso)) return null;
  const clock = civilClock(iso);
  if (!clock || zoneOffsetMinutes(clock, zone) == null) return null;
  return zone;
}

function flightZone(item: CrmBookingItem, which: "departure" | "arrival") {
  const stored = storedZone(
    which === "departure" ? item.details?.departure_timezone : item.details?.arrival_timezone
  );
  return stored || timezoneForIata(detailStr(item, which === "departure" ? "from" : "to"));
}

function serviceZone(item: CrmBookingItem) {
  return (
    storedZone(item.details?.timezone) ||
    storedZone(item.details?.time_zone) ||
    storedZone(item.details?.departure_timezone) ||
    timezoneForIata(detailStr(item, "from")) ||
    timezoneForIata(detailStr(item, "airport")) ||
    timezoneForIata(detailStr(item, "iata")) ||
    null
  );
}

/** Heure locale de l’aéroport : les chiffres restent, le fuseau est celui de la carte (#443). */
function timeZones(item: CrmBookingItem) {
  if (item.kind === "hotel" || !hasRealTime(item.start_at)) return { start: null, end: null };
  if (item.kind === "flight") {
    const start = zoneForClock(flightZone(item, "departure"), item.start_at);
    const end = zoneForClock(flightZone(item, "arrival"), item.end_at) || zoneForClock(flightZone(item, "departure"), item.end_at);
    return { start, end: end || start };
  }
  const zone = zoneForClock(serviceZone(item), item.start_at);
  return { start: zone, end: zoneForClock(serviceZone(item), item.end_at) || zone };
}

export function itemHasCalendarDate(item: Pick<CrmBookingItem, "kind" | "start_at" | "end_at">) {
  if (item.kind === "fee" || isLedgerExpenseKind(item.kind)) return false;
  return Boolean((item.start_at || "").slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/));
}

function itemSummary(item: CrmBookingItem) {
  const kind = visibleServiceCopy(BOOKING_ITEM_LABELS[item.kind] || item.kind);
  if (item.kind === "flight") {
    return visibleServiceCopy(`${kind} ${flightIata(item) || item.title}`.trim());
  }
  if (item.kind === "hotel") {
    return visibleServiceCopy(`${kind} · ${hotelDisplayName(item)}`.trim());
  }
  return visibleServiceCopy(`${kind} · ${item.title}`.trim());
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

function itemLocation(item: CrmBookingItem) {
  if (item.kind === "flight") {
    const iata = detailStr(item, "from");
    const city = detailStr(item, "city_from");
    if (city && iata) return `${city} (${iata})`;
    return iata || city;
  }
  if (item.kind === "hotel") {
    const name = hotelDisplayName(item);
    const city = detailStr(item, "city");
    const address = detailStr(item, "address");
    return [name, address || city].filter(Boolean).join(", ");
  }
  return (
    detailStr(item, "location") ||
    detailStr(item, "address") ||
    detailStr(item, "pickup") ||
    detailStr(item, "city") ||
    detailStr(item, "city_from")
  );
}

function icsUid(id: string) {
  const clean = id.replace(/[\r\n;,]/g, "");
  return `${clean || "etape"}@travelba.fr`;
}

function rememberZone(zones: Map<string, string[]>, zone: string | null, stamp: string) {
  if (!zone) return;
  const list = zones.get(zone) || [];
  list.push(stamp);
  zones.set(zone, list);
}

function zonedStamp(prop: "DTSTART" | "DTEND", stamp: string, zone: string | null, zones: Map<string, string[]>) {
  if (!zone) return `${prop}:${stamp}`;
  rememberZone(zones, zone, stamp);
  return `${prop};TZID=${zone}:${stamp}`;
}

function vtimezoneLines(tzid: string, stamps: string[]) {
  const points: { stamp: string; offset: number }[] = [];
  for (const stamp of [...new Set(stamps)].sort()) {
    const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (!match) continue;
    const offset = zoneOffsetMinutes(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`, tzid);
    if (offset == null) continue;
    points.push({ stamp, offset });
  }
  if (!points.length) return [];
  const observances: { stamp: string; from: number; to: number }[] = [];
  for (const point of points) {
    const prev = observances[observances.length - 1];
    if (prev && prev.to === point.offset) continue;
    observances.push({ stamp: point.stamp, from: prev ? prev.to : point.offset, to: point.offset });
  }
  const year = points[0]!.stamp.slice(0, 4);
  const winter = zoneOffsetMinutes(`${year}-01-15T12:00:00`, tzid);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${tzid}`];
  for (const row of observances) {
    const kind = winter != null && row.to !== winter ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${row.stamp}`,
      `TZOFFSETFROM:${offsetLabel(row.from)}`,
      `TZOFFSETTO:${offsetLabel(row.to)}`,
      `END:${kind}`
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

function veventLines(item: CrmBookingItem, booking: CrmBooking, zones: Map<string, string[]>) {
  if (!itemHasCalendarDate(item)) return null;
  const start = (item.start_at || "").slice(0, 10);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${icsUid(item.id)}`,
    `DTSTAMP:${icsStampUtc()}`,
    `SUMMARY:${icsEscape(itemSummary(item))}`,
    `DESCRIPTION:${icsEscape(itemDescription(item, booking))}`,
  ];
  const location = itemLocation(item);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);

  if (item.kind === "hotel" || !hasRealTime(item.start_at)) {
    const endExclusive = item.end_at ? item.end_at.slice(0, 10) : addIsoDays(start, 1);
    const end = endExclusive > start ? endExclusive : addIsoDays(start, 1);
    lines.push(`DTSTART;VALUE=DATE:${allDay(start)}`);
    lines.push(`DTEND;VALUE=DATE:${allDay(end)}`);
  } else {
    const zonesForItem = timeZones(item);
    lines.push(zonedStamp("DTSTART", timedStamp(item.start_at!), zonesForItem.start, zones));
    if (item.end_at && hasRealTime(item.end_at)) {
      lines.push(zonedStamp("DTEND", timedStamp(item.end_at), zonesForItem.end, zones));
    }
  }

  lines.push("END:VEVENT");
  return lines;
}

export function veventFromItem(item: CrmBookingItem, booking: CrmBooking): string | null {
  const lines = veventLines(item, booking, new Map());
  return lines ? lines.join("\r\n") : null;
}

export function veventFromStay(booking: CrmBooking): string | null {
  const start = (booking.start_date || "").slice(0, 10);
  const end = (booking.end_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const endExclusive = /^\d{4}-\d{2}-\d{2}$/.test(end) && end > start ? addIsoDays(end, 1) : addIsoDays(start, 1);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${icsUid(`stay-${booking.id}`)}`,
    `DTSTAMP:${icsStampUtc()}`,
    `SUMMARY:${icsEscape(`Séjour · ${booking.title}`)}`,
    `DESCRIPTION:${icsEscape([booking.reference, booking.destination].filter(Boolean).join(" · "))}`,
  ];
  if (booking.destination) lines.push(`LOCATION:${icsEscape(booking.destination)}`);
  lines.push(`DTSTART;VALUE=DATE:${allDay(start)}`, `DTEND;VALUE=DATE:${allDay(endExclusive)}`, "END:VEVENT");
  return lines.join("\r\n");
}

export function buildBookingIcs(opts: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  itemId?: string | null;
}) {
  const zones = new Map<string, string[]>();
  const events: string[][] = [];
  const named = opts.itemId ? opts.items.find((row) => row.id === opts.itemId) : null;
  if (opts.itemId) {
    const event = named ? veventLines(named, opts.booking, zones) : null;
    if (event) events.push(event);
  } else {
    const stay = veventFromStay(opts.booking);
    if (stay) events.push(stay.split("\r\n"));
    for (const item of opts.items) {
      const event = veventLines(item, opts.booking, zones);
      if (event) events.push(event);
    }
  }
  const timezoneBlocks = [...zones.entries()].flatMap(([tzid, stamps]) => vtimezoneLines(tzid, stamps));
  // Pas de nom de calendrier ni de TTL : ce fichier ajoute des événements, il n’ouvre pas un flux.
  return (
    foldBlock([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Travelba//Carnet//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...timezoneBlocks,
      ...events.flat(),
      "END:VCALENDAR",
    ]) + "\r\n"
  );
}

export function icsFileName(booking: CrmBooking, itemId?: string | null) {
  const ref = booking.reference.replace(/[^A-Za-z0-9_-]/g, "");
  return itemId ? `travelba-${ref}-etape.ics` : `travelba-${ref}.ics`;
}

export function icsHttpHeaders(fileName: string, opts?: { disposition?: "inline" | "attachment" }) {
  const disposition = opts?.disposition === "attachment" ? "attachment" : "inline";
  const safe = fileName.replace(/[\r\n"]/g, "") || "travelba.ics";
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `${disposition}; filename="${safe}"`,
    "Cache-Control": "private, no-store",
  };
}

function plusHours(stamp: string, hours: number) {
  const zulu = stamp.endsWith("Z");
  const core = zulu ? stamp.slice(0, -1) : stamp;
  const match = core.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return stamp;
  const when = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]));
  when.setUTCHours(when.getUTCHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}T${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}`;
  return zulu ? `${next}Z` : next;
}

function basicUtc(iso: string, zone: string | null) {
  if (!zone) return null;
  const clock = civilClock(iso);
  if (!clock) return null;
  const offset = zoneOffsetMinutes(clock, zone);
  if (offset == null) return null;
  const stamp = timedStamp(iso);
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const utc = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]) - offset * 60_000;
  const when = new Date(utc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}T${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}Z`;
}

function googleDates(item: CrmBookingItem) {
  const start = (item.start_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (item.kind === "hotel" || !hasRealTime(item.start_at)) {
    const endExclusive = item.end_at ? item.end_at.slice(0, 10) : addIsoDays(start, 1);
    const end = endExclusive > start ? endExclusive : addIsoDays(start, 1);
    return `${allDay(start)}/${allDay(end)}`;
  }
  const zones = timeZones(item);
  const startUtc = basicUtc(item.start_at!, zones.start);
  const endIso = item.end_at && hasRealTime(item.end_at) ? item.end_at : null;
  let endUtc = endIso ? basicUtc(endIso, zones.end || zones.start) : null;
  if (startUtc) {
    if (!endUtc || endUtc <= startUtc) endUtc = plusHours(startUtc, 1);
    return `${startUtc}/${endUtc}`;
  }
  const startStamp = timedStamp(item.start_at!);
  let endStamp = endIso ? timedStamp(endIso) : "";
  if (!endStamp || endStamp <= startStamp) endStamp = plusHours(startStamp, 1);
  return `${startStamp}/${endStamp}`;
}

/** Android : Google Agenda prérempli, prêt à enregistrer sur le téléphone. */
export function googleCalendarHref(item: CrmBookingItem, booking: CrmBooking): string | null {
  if (!itemHasCalendarDate(item)) return null;
  const dates = googleDates(item);
  if (!dates) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: itemSummary(item),
    dates,
    details: itemDescription(item, booking),
  });
  const location = itemLocation(item);
  if (location) params.set("location", location);
  const zone = timeZones(item).start;
  if (zone && dates.includes("T")) params.set("ctz", zone);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function googlePhoneMap(booking: CrmBooking, items: CrmBookingItem[]) {
  const mapped: Record<string, { google: string | null }> = {};
  for (const item of items) {
    const google = googleCalendarHref(item, booking);
    if (!google) continue;
    mapped[item.id] = { google };
  }
  return { stay: { google: null }, items: mapped };
}
