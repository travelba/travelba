/**
 * Page publique /v/exemple. Données en mémoire, jamais lues en base.
 * Le bouton WhatsApp « Voir le voyage » donne cet exemple à Meta : {{3}} = exemple.
 */
import type { Metadata } from "next";
import { clientVisibleItems } from "./carnet";
import { googlePhoneMap } from "./calendar-ics";
import { bookingCoverUrl } from "./covers";
import { formatDateFr } from "./dates";
import { withoutHotelRosterItems } from "./hotel-contact";
import { toPublicBooking } from "./public-booking";
import { siteConfig } from "../site";
import { stayTitleFromItems } from "./staff-stay";
import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "./types";

export const EXAMPLE_TRIP_CODE = "exemple";

const STAMP = "2026-12-01T12:00:00.000Z";
const BOOKING_ID = "exemple-sejour";

export type ExamplePublishedTrip = {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
};

export function isExampleTripCode(code: string | null | undefined) {
  return code === EXAMPLE_TRIP_CODE;
}

function exampleBooking(): CrmBooking {
  return {
    id: BOOKING_ID,
    customer_id: "exemple",
    billing_customer_id: "exemple",
    reference: "TB-EXEMPLE",
    title: "Marrakech",
    destination: "Marrakech",
    status: "confirmed",
    start_date: "2026-12-04",
    end_date: "2026-12-07",
    currency: "EUR",
    total_amount: 0,
    include_in_ledger: false,
    cover_image_path: null,
    cover_credit: null,
    notes_client: "Voyage d’exemple. Camille Morel et ce riad ne sont pas des clients de l’agence.",
    notes_internal: null,
    visible_to_client: true,
    prices_visible: false,
    offer_chauffeur: false,
    offer_greeter: false,
    offer_checkin: false,
    offer_visa: false,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function exampleHotel(): CrmBookingItem {
  return {
    id: "exemple-hotel",
    booking_id: BOOKING_ID,
    kind: "hotel",
    title: "Riad de l’Exemple",
    supplier: null,
    confirmation_ref: null,
    start_at: "2026-12-04",
    end_at: "2026-12-07",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: {
      hotel_name: "Riad de l’Exemple",
      city: "Marrakech",
      guests: "Camille Morel",
    },
    visible_to_client: true,
    source_document_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

/** Séjour fictif : Camille, Marrakech, un riad d’exemple. Aucune pièce, aucun prix. */
export function examplePublishedTrip(): ExamplePublishedTrip {
  return {
    booking: exampleBooking(),
    items: [exampleHotel()],
    docs: [],
  };
}

/** Le code réservé ne charge rien. Tout autre code suit le chargeur (la base, pour un vrai lien). */
export function publishedTripForCode<T extends ExamplePublishedTrip>(
  code: string,
  load: (code: string) => Promise<T | null>
): Promise<T | ExamplePublishedTrip | null> {
  if (isExampleTripCode(code)) return Promise.resolve(examplePublishedTrip());
  return load(code);
}

export async function publicTripPageModel(
  code: string,
  deps: {
    loadTrip: (code: string) => Promise<ExamplePublishedTrip | null>;
    loadContacts: (bookingId: string, items: CrmBookingItem[]) => Promise<CrmBookingItem[]>;
  }
) {
  const trip = await publishedTripForCode(code, deps.loadTrip);
  if (!trip) return null;
  const loaded = isExampleTripCode(code) ? trip.items : await deps.loadContacts(trip.booking.id, trip.items);
  const items = withoutHotelRosterItems(loaded);
  return {
    booking: toPublicBooking(trip.booking),
    items,
    docs: trip.docs,
    phones: googlePhoneMap(trip.booking, items),
  };
}

function tripDescription(start: string | null, end: string | null) {
  const lead = "Itinéraire et documents, préparés par Travel Business Agency.";
  if (!start && !end) return lead;
  return `${formatDateFr(start)} — ${formatDateFr(end)}. ${lead}`;
}

/** Même en-tête que le lien public. Le code exemple reste hors index. */
export function publicTripMetadata(code: string, trip: ExamplePublishedTrip | null): Metadata {
  const hidden = { index: false, follow: false };
  if (!trip) return { title: "Voyage", robots: hidden };
  const title = stayTitleFromItems(trip.booking.title, trip.booking.destination, clientVisibleItems(trip.items));
  const description = tripDescription(trip.booking.start_date, trip.booking.end_date);
  const cover = bookingCoverUrl(trip.booking, 1200, { partage: code, items: trip.items });
  return {
    title,
    description,
    robots: hidden,
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/v/${code}`,
      siteName: siteConfig.name,
      images: cover ? [{ url: cover, alt: title }] : undefined,
    },
  };
}
