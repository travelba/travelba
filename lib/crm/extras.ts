import type { CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "./types";
import { householdMembers, memberFromTravelerLink } from "./household";

export const CHAUFFEUR_EUR = 150;
export const GREETER_ADULT_EUR = 100;
export const GREETER_CHILD_EUR = 25;
export const EXTRA_CHILD_AGE = 12;
export const EXTRA_NOTICE_MS = 48 * 60 * 60 * 1000;

export type ExtraKind = "chauffeur" | "greeter";
export type ExtraLeg = "departure" | "arrival";

export function isExtraKind(value: string | null | undefined): value is ExtraKind {
  return value === "chauffeur" || value === "greeter";
}

export function isExtraLeg(value: string | null | undefined): value is ExtraLeg {
  return value === "departure" || value === "arrival";
}

export function extraAmount(kind: ExtraKind, adults = 1, children = 0) {
  if (kind === "chauffeur") return CHAUFFEUR_EUR;
  const a = Math.max(0, Math.floor(adults));
  const c = Math.max(0, Math.floor(children));
  return a * GREETER_ADULT_EUR + c * GREETER_CHILD_EUR;
}

export function extraTitle(kind: ExtraKind, leg: ExtraLeg) {
  const side = leg === "departure" ? "départ" : "arrivée";
  if (kind === "chauffeur") {
    return leg === "departure"
      ? "Chauffeur domicile → aéroport"
      : "Chauffeur aéroport → domicile";
  }
  return `Greeter — ${side}`;
}

export function extraServiceLeg(item: { details?: Record<string, unknown> | null }): ExtraLeg | null {
  const value = item.details?.service_leg;
  return isExtraLeg(String(value || "")) ? (value as ExtraLeg) : null;
}

export function findExtra(
  items: { kind?: string | null; details?: Record<string, unknown> | null }[],
  kind: ExtraKind,
  leg: ExtraLeg
) {
  return items.find((item) => item.kind === kind && extraServiceLeg(item) === leg) || null;
}

export function ageOnDate(birthDate: string | null | undefined, at: Date) {
  if (!birthDate) return null;
  const born = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let age = at.getFullYear() - born.getFullYear();
  const md = at.getMonth() - born.getMonth();
  if (md < 0 || (md === 0 && at.getDate() < born.getDate())) age -= 1;
  return age;
}

export function isChildAt(birthDate: string | null | undefined, at: Date) {
  const age = ageOnDate(birthDate, at);
  return age != null && age < EXTRA_CHILD_AGE;
}

export function countExtraHeads(
  people: { birth_date?: string | null }[],
  at: Date
): { adults: number; children: number; missingBirth: number } {
  let adults = 0;
  let children = 0;
  let missingBirth = 0;
  for (const person of people) {
    if (!person.birth_date) {
      adults += 1;
      missingBirth += 1;
      continue;
    }
    if (isChildAt(person.birth_date, at)) children += 1;
    else adults += 1;
  }
  if (!adults && !children) adults = 1;
  return { adults, children, missingBirth };
}

export function extraNoticeOk(at: string | Date | null | undefined, now = new Date()) {
  if (!at) return false;
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  return when.getTime() - now.getTime() >= EXTRA_NOTICE_MS;
}

export function bookingHasFlight(
  items: { kind?: string | null }[] | null | undefined
) {
  return (items || []).some((item) => item.kind === "flight");
}

type ServiceFlightRow = {
  kind?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type ServiceFlightLeg = {
  role: "outbound" | "inbound";
  leg: ExtraLeg;
  flightNumber: string | null;
  fromIata: string | null;
  toIata: string | null;
  cityFrom: string | null;
  cityTo: string | null;
  departAt: string | null;
  arriveAt: string | null;
};

export type ServiceOffer = {
  kind: ExtraKind;
  leg: ExtraLeg;
  title: string;
  route: string;
  flightLine: string | null;
  airport: string | null;
  whenIso: string | null;
};

function detailText(item: ServiceFlightRow, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function serviceClock(iso: string | null | undefined) {
  if (!iso || iso.length <= 10) return "";
  const match = iso.match(/[T ](\d{2}):(\d{2})/);
  if (!match) return "";
  if (match[1] === "00" && match[2] === "00") return "";
  return `${match[1]}h${match[2]}`;
}

export function serviceAirportLabel(iata: string | null, city: string | null) {
  const code = (iata || "").trim();
  const place = (city || "").trim();
  if (code && place) return `${code} · ${place}`;
  return code || place;
}

function sortedFlights(items: ServiceFlightRow[]) {
  return items
    .filter((item) => item.kind === "flight")
    .slice()
    .sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")));
}

function toServiceLeg(item: ServiceFlightRow, role: "outbound" | "inbound"): ServiceFlightLeg {
  return {
    role,
    leg: role === "outbound" ? "departure" : "arrival",
    flightNumber: detailText(item, "flight_number"),
    fromIata: detailText(item, "from"),
    toIata: detailText(item, "to"),
    cityFrom: detailText(item, "city_from"),
    cityTo: detailText(item, "city_to"),
    departAt: item.start_at || null,
    arriveAt: item.end_at || null,
  };
}

/** Premier vol = aller, dernier vol distinct = retour. Un seul vol : pas de retour. */
export function serviceFlightLegs(items: ServiceFlightRow[]) {
  const flights = sortedFlights(items);
  if (!flights.length) return [] as ServiceFlightLeg[];
  const outbound = toServiceLeg(flights[0], "outbound");
  if (flights.length === 1) return [outbound];
  return [outbound, toServiceLeg(flights[flights.length - 1], "inbound")];
}

function flightMomentLine(leg: ServiceFlightLeg, moment: "depart" | "arrive") {
  const clock = serviceClock(moment === "depart" ? leg.departAt : leg.arriveAt);
  const vol = leg.flightNumber ? `Vol ${leg.flightNumber}` : "";
  const when = clock ? `${moment === "depart" ? "départ" : "arrivée"} ${clock}` : "";
  const line = [vol, when].filter(Boolean).join(" · ");
  return line || null;
}

export function serviceOffers(items: ServiceFlightRow[]): ServiceOffer[] {
  const legs = serviceFlightLegs(items);
  const offers: ServiceOffer[] = [];
  for (const leg of legs) {
    const aller = leg.role === "outbound";
    if (aller) {
      const airport = serviceAirportLabel(leg.fromIata, leg.cityFrom);
      offers.push({
        kind: "chauffeur",
        leg: "departure",
        title: "Transfert aller",
        route: leg.fromIata ? `Domicile → ${leg.fromIata}` : "Domicile → aéroport",
        flightLine: flightMomentLine(leg, "depart"),
        airport,
        whenIso: leg.departAt,
      });
    } else {
      const airport = serviceAirportLabel(leg.toIata, leg.cityTo);
      offers.push({
        kind: "chauffeur",
        leg: "arrival",
        title: "Transfert retour",
        route: leg.toIata ? `${leg.toIata} → Domicile` : "Aéroport → domicile",
        flightLine: flightMomentLine(leg, "arrive"),
        airport,
        whenIso: leg.arriveAt,
      });
    }
    const greet = serviceAirportLabel(leg.toIata, leg.cityTo);
    offers.push({
      kind: "greeter",
      leg: leg.leg,
      title: aller ? "Greeter aller" : "Greeter retour",
      route: greet ? `Aéroport ${greet}` : "Aéroport",
      flightLine: flightMomentLine(leg, "arrive"),
      airport: greet,
      whenIso: leg.arriveAt,
    });
  }
  return offers;
}

export function extraFlightAt(
  items: { kind?: string | null; start_at?: string | null }[],
  leg: ExtraLeg,
  fallback: string | null = null
) {
  if (!bookingHasFlight(items)) return null;
  const flights = items
    .filter((item) => item.kind === "flight" && item.start_at)
    .slice()
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  if (!flights.length) return fallback;
  return (leg === "departure" ? flights[0].start_at : flights[flights.length - 1].start_at) || fallback;
}

export function formatCustomerAddress(
  customer: Pick<CrmCustomer, "address_line" | "postal_code" | "city" | "country">
) {
  return [customer.address_line, [customer.postal_code, customer.city].filter(Boolean).join(" "), customer.country]
    .filter(Boolean)
    .join(", ");
}

export function extraHeadsFromBooking(opts: {
  travelers: CrmBookingTraveler[];
  holder: Pick<CrmCustomer, "first_name" | "last_name" | "birth_date">;
  companions: Pick<CrmCompanion, "id" | "first_name" | "last_name" | "birth_date">[];
  at: Date;
}) {
  const members = householdMembers(opts.holder, opts.companions);
  const people =
    opts.travelers.length > 0
      ? opts.travelers.map((traveler) => memberFromTravelerLink(traveler, members) || { birth_date: null })
      : members;
  return countExtraHeads(people, opts.at);
}

export function extraItemPayload(input: {
  kind: ExtraKind;
  leg: ExtraLeg;
  startAt: string | null;
  amount: number;
  address?: string | null;
  adults?: number;
  children?: number;
  visibleToClient: boolean;
}) {
  return {
    kind: input.kind,
    title: extraTitle(input.kind, input.leg),
    supplier: "Travelba",
    confirmation_ref: null as string | null,
    start_at: input.startAt,
    end_at: null as string | null,
    amount: input.amount,
    include_in_ledger: true,
    details: {
      service_leg: input.leg,
      pickup: input.kind === "chauffeur" ? input.address || null : null,
      adults: input.kind === "greeter" ? input.adults ?? 1 : null,
      children: input.kind === "greeter" ? input.children ?? 0 : null,
      extra: true,
    },
    visible_to_client: input.visibleToClient,
  };
}
