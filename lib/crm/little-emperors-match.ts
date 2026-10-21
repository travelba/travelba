import {
  confirmationRefsAlign,
  mergeBookingSuggestions,
  suggestBookingByHotelStay,
  suggestBookingByReference,
  suggestBookingByTripSignals,
  suggestCustomerFromExtract,
  type BookingSuggestion,
  type HotelStayCard,
  type TripBooking,
} from "@/lib/crm/email-match";
import { joinConfirmationRefs } from "@/lib/crm/item-match";
import { catalogNameAgrees, roomsFromStay } from "@/lib/crm/hotel-gallery";
import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";
import { emptyBookingExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import {
  isLeCancelled,
  splitGuestName,
  type LeBooking,
} from "@/lib/crm/little-emperors";
import type { CrmBookingItem, CrmCustomer } from "@/lib/crm/types";

type CustomerLite = Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name" | "email"> & {
  usage_name?: string | null;
};

/** Extract minimal pour réutiliser le rapprochement e-mail. Pas de prix vendu, pas de téléphone. */
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
  extract.document_status = isLeCancelled(booking.state) ? "cancelled" : null;
  const benefits = [...new Set(booking.benefits.map((line) => frenchLeBenefitLine(line)).filter(Boolean))];
  const roomTypes = booking.room_types.map((type) => type.trim()).filter(Boolean);
  const guestNames = [...new Set(booking.guest_names.map((name) => name.trim()).filter(Boolean))];
  const conditions = [...new Set(booking.cancellation_policies.map((line) => line.trim()).filter(Boolean))];
  const rooms = roomsFromStay(roomTypes, guestNames, booking.confirmation_number);
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
        city: booking.city,
        address: booking.address,
        website: booking.website,
        le_hotel_id: booking.hotel_id,
        source_family: "little_emperors",
        included: benefits,
        ...(conditions.length ? { conditions } : {}),
        ...(guestNames.length && guestNames.length !== roomTypes.length
          ? { guests: guestNames.join(", ") }
          : {}),
        rooms,
      },
    },
  ];
  return extract;
}

export type LeAutoDecision =
  | { kind: "link"; bookingId: string }
  | { kind: "create"; customerId: string }
  | { kind: "wait" };

/**
 * Dossier déjà proposé → on le relie. Sinon une fiche unique (score ≥ 85)
 * ouvre le dossier. Annulation, ignorer, homonyme ou ex æquo : la file attend.
 * Aucune fiche n’est créée ici.
 */
export function decideLittleEmperorsAuto(input: {
  booking: LeBooking;
  suggestion: BookingSuggestion;
  customers: CustomerLite[];
  linkedBookingId?: string | null;
  ignored?: boolean;
}): LeAutoDecision {
  if (input.linkedBookingId) return { kind: "link", bookingId: input.linkedBookingId };
  if (input.suggestion.autoBookingId) return { kind: "link", bookingId: input.suggestion.autoBookingId };
  if (input.ignored || isLeCancelled(input.booking.state) || input.suggestion.candidates.length) {
    return { kind: "wait" };
  }
  const customer = suggestCustomerFromExtract(input.customers, leBookingExtract(input.booking));
  const chosen = customer.candidates.find((row) => row.customer_id === customer.autoCustomerId);
  if (!customer.autoCustomerId || !chosen || chosen.score < 85) return { kind: "wait" };
  return { kind: "create", customerId: customer.autoCustomerId };
}

function stayDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

/** Cartes hôtel du dossier qui reçoivent l’identifiant Little Emperors. Pas le montant. */
export function leItemsForHotelStamp(
  items: {
    id: string;
    title?: string | null;
    confirmation_ref?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    details?: Record<string, unknown> | null;
  }[],
  booking: Pick<LeBooking, "confirmation_number" | "hotel_name" | "hotel_id"> & {
    check_in?: string | null;
    check_out?: string | null;
  }
) {
  const hotelName = (booking.hotel_name || "").trim();
  const checkIn = stayDay(booking.check_in);
  const checkOut = stayDay(booking.check_out);
  return items
    .filter((item) => {
      const details = item.details || {};
      const current = details.le_hotel_id;
      if (booking.hotel_id != null && current != null && current !== "" && Number(current) !== booking.hotel_id) {
        return false;
      }
      const itemStart = stayDay(item.start_at);
      const itemEnd = stayDay(item.end_at);
      const sameDates = Boolean(checkIn && checkOut && itemStart === checkIn && itemEnd === checkOut);
      const itemName =
        (typeof details.hotel_name === "string" && details.hotel_name.trim()) || (item.title || "").trim();
      const sameName = Boolean(itemName && hotelName && catalogNameAgrees(itemName, hotelName));
      const sameId =
        booking.hotel_id != null && current != null && current !== "" && Number(current) === booking.hotel_id;
      if (sameDates && (sameId || sameName)) return true;
      if (confirmationRefsAlign(item.confirmation_ref, booking.confirmation_number)) return true;
      const rooms = Array.isArray(details.rooms) ? details.rooms : [];
      if (
        rooms.some((room) =>
          confirmationRefsAlign(
            room && typeof room === "object" ? (room as { confirmation_ref?: string | null }).confirmation_ref : null,
            booking.confirmation_number
          )
        )
      ) {
        return true;
      }
      if (!sameName) return false;
      if (
        item.confirmation_ref &&
        booking.confirmation_number &&
        !confirmationRefsAlign(item.confirmation_ref, booking.confirmation_number)
      ) {
        return false;
      }
      return true;
    })
    .map((item) => item.id);
}

type LeMatchItem = Pick<CrmBookingItem, "confirmation_ref"> & Partial<HotelStayCard>;

/** Une seule carte : les deux numéros. Plusieurs cartes : on ne choisit pas le numéro. */
export function leHotelStampPatch(
  item: { confirmation_ref?: string | null; details?: Record<string, unknown> | null },
  booking: Pick<LeBooking, "confirmation_number" | "hotel_id">,
  matchCount: number
) {
  const details = { ...(item.details || {}) };
  if (booking.hotel_id != null && (details.le_hotel_id == null || details.le_hotel_id === "")) {
    details.le_hotel_id = booking.hotel_id;
  }
  if (!details.source_family) details.source_family = "little_emperors";
  if (matchCount !== 1) return { details };
  const confirmation_ref = joinConfirmationRefs(item.confirmation_ref, booking.confirmation_number);
  return confirmation_ref ? { details, confirmation_ref } : { details };
}

export function suggestLittleEmperorsBooking(
  booking: LeBooking,
  bookings: TripBooking[],
  itemsByBooking: Map<string, LeMatchItem[]>,
  customers: CustomerLite[]
): BookingSuggestion {
  const extract = leBookingExtract(booking);
  const cards: HotelStayCard[] = [];
  for (const [bookingId, items] of itemsByBooking) {
    for (const item of items) {
      cards.push({
        booking_id: item.booking_id || bookingId,
        kind: item.kind,
        title: item.title,
        confirmation_ref: item.confirmation_ref,
        start_at: item.start_at,
        end_at: item.end_at,
        details: item.details,
        lifecycle: item.lifecycle,
      });
    }
  }
  return mergeBookingSuggestions(
    suggestBookingByReference(extract, bookings, itemsByBooking),
    suggestBookingByHotelStay(extract, bookings, cards, customers),
    suggestBookingByTripSignals(extract, bookings, customers)
  );
}
