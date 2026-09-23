import type { CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "./types";
import { householdMembers, memberFromTravelerLink } from "./household";

export const CHAUFFEUR_EUR = 150;
export const GREETER_ADULT_EUR = 100;
export const GREETER_CHILD_EUR = 25;
export const VISA_EUR = 50;
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

export const TRANSFER_LEAD_MINUTES = 150;

export function extraTitle(kind: ExtraKind, leg: ExtraLeg) {
  const side = leg === "departure" ? "aller" : "retour";
  if (kind === "chauffeur") return `Transfert ${side}`;
  return `Accueil VIP et Fastpass ${side}`;
}

/** Heure de réservation du transfert : 2 h 30 avant le départ du vol, sans décalage de fuseau. */
export function transferPickupIso(departAt: string | null | undefined) {
  if (!departAt) return null;
  const match = departAt.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  const pickup = new Date(utc - TRANSFER_LEAD_MINUTES * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pickup.getUTCFullYear()}-${pad(pickup.getUTCMonth() + 1)}-${pad(pickup.getUTCDate())}T${pad(pickup.getUTCHours())}:${pad(pickup.getUTCMinutes())}:00`;
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

export function findVisaExtra<T extends { kind?: string | null }>(items: T[]) {
  return items.find((item) => item.kind === "visa") || null;
}

/** Au moins un passager : un dossier sans voyageur nommé compte pour 1. */
export function visaPassengerCount(travelerCount: number) {
  const n = Math.floor(Number(travelerCount));
  return Math.max(1, Number.isFinite(n) ? n : 0);
}

export function visaFeeAmount(travelerCount: number) {
  return visaPassengerCount(travelerCount) * VISA_EUR;
}

export function visaFeeTitle(travelerCount: number) {
  const n = visaPassengerCount(travelerCount);
  return `Demande de Visa (${n} passager${n > 1 ? "s" : ""})`;
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
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type StayPickup = {
  name: string;
  address: string;
};

function stayParts(item: ServiceFlightRow) {
  const name = detailText(item, "hotel_name") || (item.title || "").trim() || "";
  const address = detailText(item, "address") || "";
  const city = detailText(item, "city") || "";
  return { name, address, city };
}

function placeMatches(place: string, city: string) {
  const left = place.trim().toLowerCase();
  const right = city.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

/** Hôtel du séjour pour le transfert retour. Un seul hôtel gagne. Plusieurs : celui de la ville du vol. */
export function matchedStay(items: ServiceFlightRow[], city?: string | null): StayPickup | null {
  const stays = items.filter((item) => item.kind === "hotel");
  if (!stays.length) return null;
  const ranked = stays
    .slice()
    .sort((a, b) => String(b.end_at || b.start_at || "").localeCompare(String(a.end_at || a.start_at || "")));
  const wanted = (city || "").trim();
  const chosen =
    (wanted && ranked.find((item) => placeMatches(stayParts(item).city || stayParts(item).name, wanted))) ||
    ranked[0];
  const parts = stayParts(chosen);
  const unique = [parts.name, parts.address, parts.city].filter(Boolean).filter((part, index, all) => {
    return all.findIndex((row) => row.toLowerCase() === part.toLowerCase()) === index;
  });
  if (!unique.length) return null;
  return { name: parts.name || unique[0], address: unique.join(", ") };
}

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

function transferLine(leg: ServiceFlightLeg) {
  const pickup = serviceClock(transferPickupIso(leg.departAt));
  const vol = leg.flightNumber ? `Vol ${leg.flightNumber}` : "";
  const depart = serviceClock(leg.departAt);
  return [pickup ? `Prise en charge ${pickup}` : "", vol, depart ? `départ ${depart}` : ""]
    .filter(Boolean)
    .join(" · ") || null;
}

export function serviceOffers(items: ServiceFlightRow[]): ServiceOffer[] {
  const legs = serviceFlightLegs(items);
  const offers: ServiceOffer[] = [];
  for (const leg of legs) {
    const aller = leg.role === "outbound";
    const departureAirport = serviceAirportLabel(leg.fromIata, leg.cityFrom);
    const stay = aller ? null : matchedStay(items, leg.cityFrom);
    const returnFrom = stay?.name || "Hébergement";
    offers.push({
      kind: "chauffeur",
      leg: leg.leg,
      title: aller ? "Aller" : "Retour",
      route: aller
        ? leg.fromIata
          ? `Domicile → ${leg.fromIata}`
          : "Domicile → aéroport"
        : leg.fromIata
          ? `${returnFrom} → ${leg.fromIata}`
          : `${returnFrom} → aéroport`,
      flightLine: transferLine(leg),
      airport: departureAirport,
      whenIso: transferPickupIso(leg.departAt),
    });
    const greet = serviceAirportLabel(leg.toIata, leg.cityTo);
    offers.push({
      kind: "greeter",
      leg: leg.leg,
      title: aller ? "Aller" : "Retour",
      route: greet ? `Aéroport ${greet}` : "Aéroport",
      flightLine: flightMomentLine(leg, "arrive"),
      airport: greet,
      whenIso: leg.arriveAt,
    });
  }
  return offers;
}

export function returnStay(items: ServiceFlightRow[]) {
  const inbound = serviceFlightLegs(items).find((leg) => leg.role === "inbound");
  return matchedStay(items, inbound?.cityFrom || null);
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

export function visaItemPayload(input: {
  travelerCount: number;
  visibleToClient: boolean;
}) {
  const passengers = visaPassengerCount(input.travelerCount);
  return {
    kind: "visa" as const,
    title: visaFeeTitle(passengers),
    supplier: "Travelba",
    confirmation_ref: null as string | null,
    start_at: null as string | null,
    end_at: null as string | null,
    amount: visaFeeAmount(passengers),
    include_in_ledger: true,
    details: {
      extra: true,
      passengers,
      unit_eur: VISA_EUR,
    },
    visible_to_client: input.visibleToClient,
  };
}
