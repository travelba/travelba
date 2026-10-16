import {
  blocksSecondDossier,
  mergeBookingSuggestions,
  suggestBookingByReference,
  suggestBookingByTripSignals,
  type BookingSuggestion,
  type TripBooking,
} from "@/lib/crm/email-match";
import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";
import { emptyBookingExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import {
  cancellationApplyPlan,
  cancellationIsSettled,
  replacementPlan,
  type LifecycleCard,
} from "@/lib/crm/item-lifecycle";
import {
  isLeCancelled,
  splitGuestName,
  type LeBooking,
  type LeRoom,
} from "@/lib/crm/little-emperors";
import type { CrmBookingItem, CrmCustomer } from "@/lib/crm/types";

type CustomerLite = Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name" | "email"> & {
  usage_name?: string | null;
};

function uniqueLines(lines: string[]) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function stayBenefits(booking: LeBooking) {
  const rooms = booking.rooms.length
    ? booking.rooms.flatMap((room) => [...room.benefits, ...room.additional_benefits, ...room.public_inclusions])
    : booking.benefits;
  return uniqueLines(rooms.map((line) => frenchLeBenefitLine(line)).filter(Boolean));
}

function stayFootnotes(booking: LeBooking) {
  return uniqueLines(booking.rooms.flatMap((room) => room.benefits_footnotes));
}

function roomGuests(room: LeRoom) {
  const bits: string[] = [];
  if (room.guest_name) bits.push(room.guest_name);
  if (room.adults != null && room.adults > 0) {
    bits.push(room.adults > 1 ? `${room.adults} adultes` : "1 adulte");
  }
  for (const child of room.children) {
    const age = child.age != null ? `${child.age} ans` : "";
    const name = child.name || (age ? "Enfant" : "");
    const bit = [name, age].filter(Boolean).join(", ");
    if (bit) bits.push(bit);
  }
  return bits.join(" · ");
}

/** Extract pour le carnet. Le coût Little Emperors n’est pas le prix vendu. */
export function leBookingExtract(booking: LeBooking): BookingExtract {
  const extract = emptyBookingExtract();
  extract.destination = booking.city || "";
  extract.start_date = booking.check_in || "";
  extract.end_date = booking.check_out || "";
  extract.currency = booking.currency || "EUR";
  extract.total_amount = null;
  extract.title = booking.hotel_name || "";
  const people = booking.guest_names
    .map(splitGuestName)
    .filter((person): person is { first_name: string; last_name: string } => Boolean(person));
  if (people[0]) {
    extract.customer_first_name = people[0].first_name;
    extract.customer_last_name = people[0].last_name;
  }
  extract.travelers = people;
  extract.document_status = isLeCancelled(booking.state) ? "cancelled" : "confirmed";
  const deposits = uniqueLines(booking.rooms.map((room) => room.deposit_policy || ""));
  const policies = uniqueLines([
    ...booking.cancellation_policies,
    ...booking.rooms.map((room) => room.cancellation_policy || ""),
  ]);
  const image = booking.image || booking.rooms.flatMap((room) => room.images)[0] || null;
  const roomName = uniqueLines(
    booking.rooms.length ? booking.rooms.map((room) => room.room_type || "") : booking.room_types
  ).join(" · ");
  extract.items = [
    {
      kind: "hotel",
      title: booking.hotel_name || "Hôtel",
      supplier: "Little Emperors",
      confirmation_ref: booking.confirmation_number,
      start_at: booking.check_in,
      end_at: booking.check_out,
      amount: null,
      include_in_ledger: false,
      details: {
        hotel_name: booking.hotel_name,
        room: roomName || null,
        city: booking.city,
        address: booking.address,
        website: booking.website,
        le_hotel_id: booking.hotel_id,
        source_family: "little_emperors",
        included: stayBenefits(booking),
        benefit_footnotes: stayFootnotes(booking),
        cancellation_policies: policies,
        deposit_policy: deposits.join(" · ") || null,
        eta: booking.eta,
        le_total_cost: booking.total_cost,
        le_currency: booking.currency,
        image,
        latitude: booking.latitude,
        longitude: booking.longitude,
        check_in_time: booking.check_in_time,
        check_out_time: booking.check_out_time,
        hotel_description: booking.description,
        rooms: (booking.rooms.length ? booking.rooms : booking.room_types.map((type) => ({ room_type: type, guest_name: null, adults: null, children: [] }))).map(
          (room) => ({
            room: "room_type" in room ? room.room_type : room,
            type: "room_type" in room ? room.room_type : room,
            guests: "guest_name" in room ? roomGuests(room as LeRoom) : null,
            confirmation_ref: booking.confirmation_number,
          })
        ),
      },
    },
  ];
  return extract;
}

export const LE_HOLD = {
  choice: "Plusieurs cartes hôtel sur ce séjour. Choisissez laquelle mettre à jour.",
  same_stay: "Même destination : le dossier n’est pas créé. Rattachez la carte au séjour existant.",
  name: "Little Emperors n’a pas donné un prénom et un nom.",
  customers: "Plusieurs fiches portent ce nom. Choisissez le client.",
  cancel_card: "Annulation Little Emperors reçue, sans carte hôtel correspondante sur le dossier.",
  unconfirmed: "Little Emperors n’a pas confirmé cette réservation.",
} as const;

export type LeWritePlan =
  | { kind: "replace"; bookingId: string; customerId: string }
  | { kind: "cancel"; bookingId: string; customerId: string }
  | { kind: "create"; customerId: string }
  | { kind: "create_customer"; firstName: string; lastName: string }
  | { kind: "hold"; message: string | null };

/** Match unique : met à jour. Aucun séjour : crée. Ambigu ou deux cartes : la file attend. */
export function planLeCarnetWrite(input: {
  booking: LeBooking;
  autoBookingId: string | null;
  candidates: { booking_id: string | null; customer_id: string | null; reason: string; score: number }[];
  linked: { bookingId: string; customerId: string } | null;
  items: LifecycleCard[] | null;
  namedCustomerIds: string[];
  ignored?: boolean;
}): LeWritePlan {
  if (input.ignored && !input.linked) return { kind: "hold", message: null };
  if (String(input.booking.state || "").trim().toLowerCase() === "failed") {
    return { kind: "hold", message: LE_HOLD.unconfirmed };
  }
  const fromAuto = input.autoBookingId
    ? input.candidates.find((row) => row.booking_id === input.autoBookingId)
    : null;
  const target =
    input.linked ||
    (input.autoBookingId && fromAuto?.customer_id
      ? { bookingId: input.autoBookingId, customerId: fromAuto.customer_id }
      : null);
  const extract = leBookingExtract(input.booking);
  if (isLeCancelled(input.booking.state)) {
    if (!target) return { kind: "hold", message: null };
    if (!input.items) return { kind: "hold", message: null };
    const plan = cancellationApplyPlan(extract, input.items);
    if (!cancellationIsSettled(plan)) return { kind: "hold", message: LE_HOLD.cancel_card };
    return { kind: "cancel", bookingId: target.bookingId, customerId: target.customerId };
  }
  if (!target) {
    if (blocksSecondDossier(input.candidates)) return { kind: "hold", message: LE_HOLD.same_stay };
    if (input.namedCustomerIds.length > 1) return { kind: "hold", message: LE_HOLD.customers };
    if (input.namedCustomerIds.length === 1) return { kind: "create", customerId: input.namedCustomerIds[0] };
    const person = splitGuestName(input.booking.guest_names[0] || "");
    if (!person) return { kind: "hold", message: LE_HOLD.name };
    return { kind: "create_customer", firstName: person.first_name, lastName: person.last_name };
  }
  if (!input.items) return { kind: "hold", message: null };
  const plan = replacementPlan(extract.items || [], input.items);
  if (plan.choices.length) return { kind: "hold", message: LE_HOLD.choice };
  return { kind: "replace", bookingId: target.bookingId, customerId: target.customerId };
}

export function suggestLittleEmperorsBooking(
  booking: LeBooking,
  bookings: TripBooking[],
  itemsByBooking: Map<string, Pick<CrmBookingItem, "confirmation_ref">[]>,
  customers: CustomerLite[]
): BookingSuggestion {
  const extract = leBookingExtract(booking);
  return mergeBookingSuggestions(
    suggestBookingByReference(extract, bookings, itemsByBooking),
    suggestBookingByTripSignals(extract, bookings, customers)
  );
}
