import {
  mergeBookingSuggestions,
  suggestBookingByReference,
  suggestBookingByTripSignals,
  type BookingSuggestion,
  type TripBooking,
} from "@/lib/crm/email-match";
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
        rooms: booking.room_types.map((type) => ({
          room: null,
          type,
          guests: null,
          confirmation_ref: booking.confirmation_number,
        })),
      },
    },
  ];
  return extract;
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
