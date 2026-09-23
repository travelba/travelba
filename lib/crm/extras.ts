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
