import type { CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "./types";
import { householdMembers, memberFromTravelerLink } from "./household";

export const CHAUFFEUR_EUR = 150;
export const GREETER_ADULT_EUR = 100;
export const GREETER_CHILD_EUR = 25;
export const VISA_EUR = 50;
export const CHECKIN_EUR = 10;
export const EXTRA_CHILD_AGE = 12;
export const EXTRA_NOTICE_MS = 48 * 60 * 60 * 1000;

export type ExtraKind = "chauffeur" | "greeter";
export type ExtraLeg = "departure" | "arrival";
export type ServicePlace = "home" | "hotel";
export type OfferSlot = "before" | "after";

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

export function isServicePlace(value: string | null | undefined): value is ServicePlace {
  return value === "home" || value === "hotel";
}

/** Lieu du transfert. Les cartes déjà validées sans `place` gardent l’ancien sens : aller = domicile, retour = hôtel. */
export function extraPlaceOf(item: {
  kind?: string | null;
  details?: Record<string, unknown> | null;
}): ServicePlace | null {
  const value = item.details?.place;
  if (isServicePlace(typeof value === "string" ? value : "")) return value as ServicePlace;
  if (item.kind !== "chauffeur") return null;
  const leg = extraServiceLeg(item);
  if (leg === "departure") return "home";
  if (leg === "arrival") return "hotel";
  return null;
}

export function findExtra(
  items: { kind?: string | null; details?: Record<string, unknown> | null }[],
  kind: ExtraKind,
  leg: ExtraLeg,
  place?: ServicePlace | null
) {
  return (
    items.find((item) => {
      if (item.kind !== kind || extraServiceLeg(item) !== leg) return false;
      if (kind !== "chauffeur" || place == null) return true;
      return extraPlaceOf(item) === place;
    }) || null
  );
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
  return `Obtention du visa (${n} passager${n > 1 ? "s" : ""})`;
}

export function checkinPassengerCount(travelerCount: number) {
  return visaPassengerCount(travelerCount);
}

export function checkinFeeAmount(travelerCount: number) {
  return checkinPassengerCount(travelerCount) * CHECKIN_EUR;
}

export function checkinFeeTitle(travelerCount: number) {
  const n = checkinPassengerCount(travelerCount);
  return `Enregistrement (${n} passager${n > 1 ? "s" : ""})`;
}

export function findCheckinExtra<T extends { kind?: string | null }>(items: T[]) {
  return items.find((item) => item.kind === "checkin") || null;
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
  id?: string;
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
  id: string;
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
  place: ServicePlace | null;
  slot: OfferSlot;
  flightId: string;
  day: string;
  title: string;
  route: string;
  flightLine: string | null;
  airport: string | null;
  whenIso: string | null;
  address: string | null;
};

export type JourneyRow<T> =
  | { type: "item"; item: T }
  | { type: "offer"; offer: ServiceOffer };

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

function dayKey(iso: string | null | undefined) {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function toServiceLeg(item: ServiceFlightRow, role: "outbound" | "inbound"): ServiceFlightLeg {
  return {
    id: item.id || role,
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

function offerBase(
  leg: ServiceFlightLeg,
  input: Pick<ServiceOffer, "kind" | "place" | "slot" | "day" | "route" | "flightLine" | "airport" | "whenIso" | "address">
): ServiceOffer {
  return {
    kind: input.kind,
    leg: leg.leg,
    place: input.place,
    slot: input.slot,
    flightId: leg.id,
    day: input.day,
    title: leg.role === "outbound" ? "Aller" : "Retour",
    route: input.route,
    flightLine: input.flightLine,
    airport: input.airport,
    whenIso: input.whenIso,
    address: input.address,
  };
}

/** Propositions d’itinéraire : domicile aller/retour, hôtel s’il existe, greeter juste avant chaque vol. */
export function itineraryOffers(items: ServiceFlightRow[]): ServiceOffer[] {
  const legs = serviceFlightLegs(items);
  const outbound = legs.find((leg) => leg.role === "outbound");
  const inbound = legs.find((leg) => leg.role === "inbound");
  const offers: ServiceOffer[] = [];

  if (outbound) {
    const departDay = dayKey(outbound.departAt);
    const arriveDay = dayKey(outbound.arriveAt) || departDay;
    const fromAirport = serviceAirportLabel(outbound.fromIata, outbound.cityFrom);
    const toAirport = serviceAirportLabel(outbound.toIata, outbound.cityTo);
    const stay = matchedStay(items, outbound.cityTo);
    if (departDay) {
      offers.push(
        offerBase(outbound, {
          kind: "chauffeur",
          place: "home",
          slot: "before",
          day: departDay,
          route: outbound.fromIata ? `Domicile → ${outbound.fromIata}` : "Domicile → aéroport",
          flightLine: transferLine(outbound),
          airport: fromAirport,
          whenIso: transferPickupIso(outbound.departAt),
          address: null,
        })
      );
      offers.push(
        offerBase(outbound, {
          kind: "greeter",
          place: null,
          slot: "before",
          day: departDay,
          route: fromAirport ? `Aéroport ${fromAirport}` : "Aéroport",
          flightLine: flightMomentLine(outbound, "depart"),
          airport: fromAirport,
          whenIso: outbound.departAt,
          address: null,
        })
      );
    }
    if (stay && arriveDay) {
      offers.push(
        offerBase(outbound, {
          kind: "chauffeur",
          place: "hotel",
          slot: "after",
          day: arriveDay,
          route: outbound.toIata ? `${outbound.toIata} → ${stay.name}` : `Aéroport → ${stay.name}`,
          flightLine: flightMomentLine(outbound, "arrive"),
          airport: toAirport,
          whenIso: outbound.arriveAt,
          address: stay.address,
        })
      );
    }
  }

  if (inbound) {
    const departDay = dayKey(inbound.departAt);
    const arriveDay = dayKey(inbound.arriveAt) || departDay;
    const pickupIso = transferPickupIso(inbound.departAt);
    const pickupDay = dayKey(pickupIso) || departDay;
    const fromAirport = serviceAirportLabel(inbound.fromIata, inbound.cityFrom);
    const toAirport = serviceAirportLabel(inbound.toIata, inbound.cityTo);
    const stay = matchedStay(items, inbound.cityFrom);
    if (stay && pickupDay) {
      offers.push(
        offerBase(inbound, {
          kind: "chauffeur",
          place: "hotel",
          slot: "before",
          day: pickupDay,
          route: inbound.fromIata ? `${stay.name} → ${inbound.fromIata}` : `${stay.name} → aéroport`,
          flightLine: transferLine(inbound),
          airport: fromAirport,
          whenIso: pickupIso,
          address: stay.address,
        })
      );
    }
    if (departDay) {
      offers.push(
        offerBase(inbound, {
          kind: "greeter",
          place: null,
          slot: "before",
          day: departDay,
          route: fromAirport ? `Aéroport ${fromAirport}` : "Aéroport",
          flightLine: flightMomentLine(inbound, "depart"),
          airport: fromAirport,
          whenIso: inbound.departAt,
          address: null,
        })
      );
    }
    if (arriveDay) {
      offers.push(
        offerBase(inbound, {
          kind: "chauffeur",
          place: "home",
          slot: "after",
          day: arriveDay,
          route: inbound.toIata ? `${inbound.toIata} → Domicile` : "Aéroport → domicile",
          flightLine: flightMomentLine(inbound, "arrive"),
          airport: toAirport,
          whenIso: inbound.arriveAt,
          address: null,
        })
      );
    }
  }

  return offers;
}

export function offerKey(offer: Pick<ServiceOffer, "kind" | "leg" | "place">) {
  return `${offer.kind}:${offer.leg}:${offer.place || "none"}`;
}

/** Cartes du jour : propositions collées au vol, sinon en tête de journée (arrivée la veille ou le lendemain). */
export function composeItineraryDay<T extends { id: string }>(
  day: string,
  items: T[],
  offers: ServiceOffer[]
): JourneyRow<T>[] {
  const used = new Set<ServiceOffer>();
  const rows: JourneyRow<T>[] = [];
  for (const item of items) {
    for (const offer of offers) {
      if (used.has(offer) || offer.day !== day || offer.flightId !== item.id || offer.slot !== "before") {
        continue;
      }
      rows.push({ type: "offer", offer });
      used.add(offer);
    }
    rows.push({ type: "item", item });
    for (const offer of offers) {
      if (used.has(offer) || offer.day !== day || offer.flightId !== item.id || offer.slot !== "after") {
        continue;
      }
      rows.push({ type: "offer", offer });
      used.add(offer);
    }
  }
  const rest = offers
    .filter((offer) => offer.day === day && !used.has(offer))
    .map((offer) => ({ type: "offer" as const, offer }));
  return [...rest, ...rows];
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
  place?: ServicePlace | null;
  startAt: string | null;
  amount: number;
  address?: string | null;
  adults?: number;
  children?: number;
  visibleToClient: boolean;
}) {
  const place = input.kind === "chauffeur" ? input.place || null : null;
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
      place,
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

export function checkinItemPayload(input: { travelerCount: number; visibleToClient: boolean }) {
  const passengers = checkinPassengerCount(input.travelerCount);
  return {
    kind: "checkin" as const,
    title: checkinFeeTitle(passengers),
    supplier: "Travelba",
    confirmation_ref: null as string | null,
    start_at: null as string | null,
    end_at: null as string | null,
    amount: checkinFeeAmount(passengers),
    include_in_ledger: true,
    details: {
      extra: true,
      passengers,
      unit_eur: CHECKIN_EUR,
    },
    visible_to_client: input.visibleToClient,
  };
}
