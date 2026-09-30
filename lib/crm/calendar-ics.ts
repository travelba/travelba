import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS, isLedgerExpenseKind, visibleServiceCopy } from "@/lib/crm/types";
import { itemClock, flightIata, flightCities, hotelDisplayName } from "@/lib/crm/carnet";
import { siteConfig } from "@/lib/site";

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
  /** Abonnement téléphone : le calendrier se rafraîchit si l’horaire change. */
  subscription?: boolean;
}) {
  const events: string[] = [];
  const named = opts.itemId ? opts.items.find((row) => row.id === opts.itemId) : null;
  if (opts.itemId) {
    const event = named ? veventFromItem(named, opts.booking) : null;
    if (event) events.push(event);
  } else {
    const stay = veventFromStay(opts.booking);
    if (stay) events.push(stay);
    for (const item of opts.items) {
      const event = veventFromItem(item, opts.booking);
      if (event) events.push(event);
    }
  }
  const name = icsEscape(named ? itemSummary(named) : opts.booking.title || opts.booking.reference);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travelba//Carnet//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${name}`,
  ];
  if (opts.subscription) lines.push("X-PUBLISHED-TTL:PT6H");
  lines.push(...events, "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function icsFileName(booking: CrmBooking, itemId?: string | null) {
  const ref = booking.reference.replace(/[^A-Za-z0-9_-]/g, "");
  return itemId ? `travelba-${ref}-etape.ics` : `travelba-${ref}.ics`;
}

export function icsHttpHeaders(fileName: string, opts?: { handoff?: boolean }) {
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Cache-Control": "private, no-store",
  };
  // Avec un nom de fichier, Safari iPhone télécharge et affiche « Fiche d’agenda disponible ».
  if (!opts?.handoff) {
    headers["Content-Disposition"] = `inline; filename="${fileName}"`;
  }
  return headers;
}

/** Clé du flux « tout le séjour », distincte d’un id de carte. */
export const CALENDAR_STAY_KEY = "sejour";

export type PhoneCalendarLink = { webcal: string | null; google: string | null };

export type PhoneCalendarLinks = {
  stay: PhoneCalendarLink;
  items: Record<string, PhoneCalendarLink>;
};

export function isAndroidUa(ua: string) {
  return /Android/i.test(ua);
}

/** Safari sur iPhone ou iPad. Pas l’agent qui relit un abonnement : sinon la redirection boucle. */
export function isAppleMobileBrowser(ua: string) {
  if (/CalendarAgent|dataaccessd|CFNetwork/i.test(ua)) return false;
  return /iPhone|iPad|iPod/i.test(ua);
}

export function calendarOpenTarget(opts: {
  ua: string;
  webcalHref?: string | null;
  googleHref?: string | null;
  /** iPadOS qui se présente comme un Mac, mais avec un écran tactile. */
  appleTouch?: boolean;
}) {
  const apple = Boolean(opts.appleTouch) || isAppleMobileBrowser(opts.ua);
  if (apple && opts.webcalHref) return opts.webcalHref;
  if (isAndroidUa(opts.ua) && opts.googleHref) return opts.googleHref;
  return null;
}

export function chosenCalendarHref(
  httpsHref: string,
  phone: PhoneCalendarLink | null | undefined,
  ua: string
) {
  return (
    calendarOpenTarget({
      ua,
      webcalHref: phone?.webcal,
      googleHref: phone?.google,
    }) || httpsHref
  );
}

export function calendarResponsePlan(opts: {
  ua: string;
  webcalHref?: string | null;
  googleHref?: string | null;
}): { kind: "redirect"; url: string } | { kind: "file"; handoff: boolean } {
  const url = calendarOpenTarget(opts);
  if (url) return { kind: "redirect", url };
  return { kind: "file", handoff: isAppleMobileBrowser(opts.ua) };
}

export function originFromHeaders(h: { get(name: string): string | null }) {
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim() || "";
  if (!host) return siteConfig.url;
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function plusHours(stamp: string, hours: number) {
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return stamp;
  const when = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]));
  when.setUTCHours(when.getUTCHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}T${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}`;
}

function googleDates(item: CrmBookingItem) {
  const start = (item.start_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (item.kind === "hotel" || !hasRealTime(item.start_at)) {
    const endExclusive = item.end_at ? item.end_at.slice(0, 10) : addDays(start, 1);
    const end = endExclusive > start ? endExclusive : addDays(start, 1);
    return `${allDay(start)}/${allDay(end)}`;
  }
  const startStamp = timedStamp(item.start_at!);
  let endStamp = item.end_at && hasRealTime(item.end_at) ? timedStamp(item.end_at) : "";
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
  const location =
    item.kind === "flight"
      ? flightCities(item) || flightIata(item)
      : item.kind === "hotel"
        ? hotelDisplayName(item)
        : "";
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function googlePhoneMap(booking: CrmBooking, items: CrmBookingItem[]): PhoneCalendarLinks {
  const mapped: Record<string, PhoneCalendarLink> = {};
  for (const item of items) {
    const google = googleCalendarHref(item, booking);
    if (!google) continue;
    mapped[item.id] = { webcal: null, google };
  }
  return { stay: { webcal: null, google: null }, items: mapped };
}

