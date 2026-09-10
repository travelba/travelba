import type {
  MtripAccommodation,
  MtripDestination,
  MtripDocument,
  MtripFlight,
  MtripPriceLine,
  MtripTraveler,
  MtripTrip,
} from "./types";

/** Profil recommandé pour Travel Business Agency (loisirs) — MAX options. */
export const MTRIP_BEST_DEFAULTS = {
  accountId: Number(process.env.MTRIP_ACCOUNT_ID || 66582),
  primaryId: process.env.MTRIP_PRIMARY_ID || "TBT123",
  tripType: "type_4" as const,
  status: "published" as const,
  bookingStatus: "confirmed" as const,
  bookingVisibility: true,
  language: "fr",
  sortItemsByPosition: true,
  /** 1 = envoyer une invitation email — CRM force 0 (WhatsApp) côté publish */
  sendInvitationType: 1,
  sendInvitationSms: true,
  agencyContact: {
    type: "custom" as const,
    label: "Travel Business Agency",
    email: process.env.MTRIP_AGENCY_EMAIL || "contact@travelbt.fr",
    email_label: "Email",
    phone: process.env.MTRIP_AGENCY_PHONE as string | undefined,
    phone_label: "Téléphone",
  },
  updateNotification:
    "Votre voyage a été mis à jour. Ouvrez l'app mTrip pour les détails.",
};

export type BuildBestTripInput = {
  /** Stable CRM / dossier id — used as mTrip trip identifier */
  identifier: string;
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
  pictureUrl?: string;
  destinations: MtripDestination[];
  travelers: MtripTraveler[];
  flights?: MtripFlight[];
  accommodations?: MtripAccommodation[];
  documents?: MtripDocument[];
  totalPrice?: number;
  priceCurrency?: string;
  priceNote?: string;
  prices?: MtripPriceLine[];
  trains?: MtripTrip["trains"];
  carRentals?: MtripTrip["car_rentals"];
  transports?: MtripTrip["transports"];
  activities?: MtripTrip["activities"];
  /** Override defaults */
  draft?: boolean;
  bookingStatus?: "pending" | "confirmed" | "cancelled";
  accountId?: number;
  primaryId?: string;
  sortItemsByPosition?: boolean;
};

/**
 * Builds a trip payload with TBT “best options”:
 * published, confirmed, type_4, sort by position, agency contact, FR notif.
 */
export function buildBestTrip(input: BuildBestTripInput): MtripTrip {
  const d = MTRIP_BEST_DEFAULTS;

  const travelers = input.travelers.map((t, index) => ({
    language: d.language,
    send_invitation_type: d.sendInvitationType,
    send_invitation_sms: Boolean(t.phone) && d.sendInvitationSms,
    role: t.role ?? (index === 0 ? ["lead_traveler", "traveler"] : ["traveler"]),
    ...t,
  }));

  const contact = {
    ...d.agencyContact,
    ...(d.agencyContact.phone
      ? {}
      : { phone: undefined, phone_label: undefined }),
  };

  return {
    name: input.name,
    identifier: input.identifier,
    trip_type: d.tripType,
    // Critique : n'envoyer QUE mtrip_account_id OU primary_id, jamais les deux
    // (sinon mTrip répond 404 No agency found)
    ...(input.primaryId && !input.accountId && !d.accountId
      ? { primary_id: input.primaryId }
      : { mtrip_account_id: input.accountId ?? d.accountId }),
    start_date: input.startDate,
    end_date: input.endDate,
    description: input.description,
    picture_url: input.pictureUrl,
    destinations: input.destinations,
    travelers,
    flights: input.flights,
    accommodations: input.accommodations,
    trains: input.trains,
    car_rentals: input.carRentals,
    transports: input.transports,
    activities: input.activities,
    documents: input.documents,
    status: input.draft ? "draft" : d.status,
    booking_status: input.bookingStatus ?? d.bookingStatus,
    booking_visibility: d.bookingVisibility,
    sort_items_by_position:
      input.sortItemsByPosition ?? d.sortItemsByPosition,
    trip_update_notifications: d.updateNotification,
    contacts: [
      {
        type: contact.type,
        label: contact.label,
        email: contact.email,
        email_label: contact.email_label,
        ...(contact.phone
          ? { phone: contact.phone, phone_label: contact.phone_label }
          : {}),
      },
    ],
    ...(input.prices?.length ? { prices: input.prices } : {}),
    ...(input.totalPrice != null
      ? {
          total_price: input.totalPrice,
          price_currency: input.priceCurrency || "EUR",
          price_note: input.priceNote,
        }
      : {}),
  };
}
