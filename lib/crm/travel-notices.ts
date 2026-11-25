import { civilClock, timezoneForIata, zoneOffsetMinutes } from "@/lib/crm/airport-time";
import { flightClockLabel, flightNumberLabel, flightRouteLabel } from "@/lib/crm/flight-watch";
import { flightNoticeKey, flightPushCopy } from "@/lib/crm/push-copy";
import { formatMoney } from "@/lib/crm/money";
import { stayToday } from "@/lib/crm/stay-moment";

const HOUR = 60 * 60 * 1000;
const CHECKIN_MIN_H = 20;
const CHECKIN_MAX_H = 28;
const URGENT_H = 12;
const BALANCE_DAYS = 14;

export type TravelPrefs = {
  push_travel?: boolean | null;
  push_checkin?: boolean | null;
  push_flight_change?: boolean | null;
  push_departure?: boolean | null;
  push_balance?: boolean | null;
};

export type TravelFlight = {
  id: string;
  bookingId: string;
  customerId: string;
  reference: string;
  startAt: string | null;
  origin: string;
  zone: string | null;
  details: Record<string, unknown>;
  status: string;
  gate: string;
  notifiedGate: string;
  notifiedOut: string;
  estimatedOut: string;
  checkinNotifiedAt: string;
};

export type TravelTransfer = {
  bookingId: string;
  title: string;
  startAt: string | null;
};

export type TravelBalance = {
  customerId: string;
  bookingId: string;
  reference: string;
  departsOn: string;
  owed: number;
  currency: string;
};

export type TravelNotice = {
  customerId: string;
  bookingId: string;
  kind: "travel" | "payment";
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
};

export type GateMemory = { itemId: string; gate: string; silent: boolean };

function open(value: boolean | null | undefined) {
  return value !== false;
}

export function parisClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  let hour = Number(read("hour"));
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  return { day: `${read("year")}-${read("month")}-${read("day")}`, hour };
}

/** 22 h – 8 h, heure de Paris. Le cron reprend à la fenêtre suivante. */
export function inQuietHours(now: Date) {
  const { hour } = parisClock(now);
  return hour >= 22 || hour < 8;
}

function shiftDay(day: string, delta: number) {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  return date.toISOString().slice(0, 10);
}

/** Heure locale de l’aéroport, convertie. Sans fuseau connu, on ne devine pas. */
export function departureInstant(startAt: string | null, origin: string, zone: string | null) {
  const clock = civilClock(startAt);
  if (!clock) return null;
  const timeZone = zone && zone.includes("/") ? zone : timezoneForIata(origin);
  if (!timeZone) return null;
  const offset = zoneOffsetMinutes(clock, timeZone);
  const match = clock.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (offset == null || !match) return null;
  const utc = Date.UTC(
    Number(match[1].slice(0, 4)),
    Number(match[1].slice(5, 7)) - 1,
    Number(match[1].slice(8, 10)),
    Number(match[2]),
    Number(match[3]),
    Number(match[4])
  );
  return utc - offset * 60_000;
}

function clean(value: string, max = 80) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function stayUrl(reference: string) {
  return `/mon-compte/reservations/${reference}`;
}

function transferSentence(transfers: TravelTransfer[], bookingId: string, day: string) {
  const row = transfers.find((item) => {
    if (item.bookingId !== bookingId) return false;
    const when = (item.startAt || "").slice(0, 10);
    return when === day || when === shiftDay(day, -1);
  });
  if (!row) return "";
  const title = clean(row.title, 60);
  if (!title) return "";
  const clock = flightClockLabel(row.startAt);
  return clock ? `Le transfert ${title} est à ${clock}.` : `Un transfert est prévu : ${title}.`;
}

function leg(details: Record<string, unknown>) {
  return [flightNumberLabel(details), flightRouteLabel(details)].filter(Boolean).join(" ");
}

/**
 * Rappels du jour : enregistrement à 24 h, retard, porte, départ la veille, reste à payer.
 * Heures calmes : on attend 8 h, sauf un retard ou une porte dont le vol part dans les 12 h.
 */
export function planTravelNotices(input: {
  now: Date;
  prefs: TravelPrefs | null;
  flights: TravelFlight[];
  transfers: TravelTransfer[];
  balances: TravelBalance[];
}) {
  const quiet = inQuietHours(input.now);
  const today = parisClock(input.now).day || stayToday(input.now);
  const prefs = input.prefs;
  const travelOn = open(prefs?.push_travel);
  const notices: TravelNotice[] = [];
  const gates: GateMemory[] = [];
  const seenDepart = new Set<string>();

  for (const flight of input.flights) {
    const reference = clean(flight.reference, 40);
    if (!reference.startsWith("TB-") || !flight.customerId) continue;
    const instant = departureInstant(flight.startAt, flight.origin, flight.zone);
    const hours = instant == null ? null : (instant - input.now.getTime()) / HOUR;
    const upcoming = hours == null || hours > -1;
    const urgent = hours != null && hours > -1 && hours <= URGENT_H;
    const allow = !quiet || urgent;
    const departDay = (flight.startAt || "").slice(0, 10);

    if (flight.gate && !flight.notifiedGate) gates.push({ itemId: flight.id, gate: flight.gate, silent: true });
    if (
      travelOn &&
      open(prefs?.push_flight_change) &&
      allow &&
      upcoming &&
      flight.gate &&
      flight.notifiedGate &&
      flight.gate !== flight.notifiedGate
    ) {
      const route = leg(flight.details);
      if (route) {
        notices.push({
          customerId: flight.customerId,
          bookingId: flight.bookingId,
          kind: "travel",
          title: "Porte d’embarquement",
          body: clean(`Votre vol ${route} embarque à la porte ${flight.gate}.`, 180),
          url: stayUrl(reference),
          idempotencyKey: `travel:gate:${flight.id}:${flight.gate}`.slice(0, 180),
        });
        gates.push({ itemId: flight.id, gate: flight.gate, silent: false });
      }
    }

    if (
      travelOn &&
      open(prefs?.push_flight_change) &&
      allow &&
      flight.status === "delayed" &&
      flight.estimatedOut &&
      flight.notifiedOut !== flight.estimatedOut
    ) {
      const when = flightClockLabel(flight.estimatedOut) || flightClockLabel(flight.startAt);
      const copy = flightPushCopy({
        kind: "retard",
        flight: flightNumberLabel(flight.details),
        route: flightRouteLabel(flight.details),
        when,
      });
      if (copy) {
        notices.push({
          customerId: flight.customerId,
          bookingId: flight.bookingId,
          kind: "travel",
          title: copy.title,
          body: copy.body,
          url: stayUrl(reference),
          idempotencyKey: flightNoticeKey(flight.id, "retard", flight.startAt),
        });
      }
    }

    if (
      travelOn &&
      open(prefs?.push_checkin) &&
      allow &&
      hours != null &&
      hours >= CHECKIN_MIN_H &&
      hours <= CHECKIN_MAX_H &&
      !recentCheckin(flight.checkinNotifiedAt, input.now)
    ) {
      const route = leg(flight.details);
      if (route) {
        notices.push({
          customerId: flight.customerId,
          bookingId: flight.bookingId,
          kind: "travel",
          title: "Enregistrement",
          body: clean(`Pensez à l’enregistrement de votre vol ${route}, dans les prochaines 24 heures.`, 180),
          url: stayUrl(reference),
          idempotencyKey: `travel:checkin:${flight.id}:${departDay}`.slice(0, 180),
        });
      }
    }

    const departKey = `${flight.bookingId}:${departDay}`;
    if (
      travelOn &&
      open(prefs?.push_departure) &&
      !quiet &&
      departDay &&
      shiftDay(departDay, -1) === today &&
      !seenDepart.has(departKey)
    ) {
      seenDepart.add(departKey);
      const route = flightRouteLabel(flight.details);
      const transfer = transferSentence(input.transfers, flight.bookingId, departDay);
      const lead = route ? `Votre départ ${route} est demain.` : "Votre départ est demain.";
      notices.push({
        customerId: flight.customerId,
        bookingId: flight.bookingId,
        kind: "travel",
        title: "Départ demain",
        body: clean(transfer ? `${lead} ${transfer}` : lead, 180),
        url: stayUrl(reference),
        idempotencyKey: `travel:depart:${flight.bookingId}:${departDay}`.slice(0, 180),
      });
    }
  }

  if (open(prefs?.push_balance)) {
    const horizon = shiftDay(today, BALANCE_DAYS);
    for (const row of input.balances) {
      const reference = clean(row.reference, 40);
      if (!reference.startsWith("TB-") || !row.customerId) continue;
      if (!(row.owed >= 0.5) || !row.departsOn || row.departsOn < today || row.departsOn > horizon) continue;
      if (quiet) continue;
      const cents = Math.round(row.owed * 100);
      notices.push({
        customerId: row.customerId,
        bookingId: row.bookingId,
        kind: "payment",
        title: "Reste à régler",
        body: clean(`Il reste ${formatMoney(row.owed, row.currency)} à régler avant le départ.`, 180),
        url: "/mon-compte/transactions",
        idempotencyKey: `travel:balance:${row.customerId}:${row.bookingId}:${cents}`.slice(0, 180),
      });
    }
  }

  return { notices, gates };
}

function recentCheckin(value: string, now: Date) {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < 36 * HOUR;
}
